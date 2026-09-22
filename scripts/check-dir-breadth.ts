#!/usr/bin/env node
/**
 * Fail closed when a source directory has too many peer files (mega-dirs hurt
 * path-disjoint parallel land). Config: scripts/dir-breadth.json
 *
 * Invariants (repo-template#377):
 * 1. Directory breadth limits: no source directory may exceed maxFilesPerDir
 *    unless explicitly allowlisted.
 * 2. Closed allowlist owners forbidden: no allowlist entry may cite a closed
 *    GitHub issue. Closed repair issues cannot keep stale exemptions alive.
 * 3. Gated peer additions: file counts in allowlisted directories cannot exceed
 *    their exact frozen ceiling.
 *
 * Disable flow for a dir that already exceeds the cap:
 *   1. File GH issue "re-enable dir-breadth for <path>"
 *   2. Add to allowlist: { "path": "src/foo", "maxFiles": 99, "issue": "https://github.com/.../issues/N" }
 *   3. When fixed, lower max / remove allowlist entry and close issue
 *
 * Exit 0 = ok, 1 = violation, 2 = config error
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "scripts", "dir-breadth.json");

const SOURCE_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".mts", ".cts",
]);

/** Default repo for bare `#N` / path-only issue refs. */
export const DIR_BREADTH_DEFAULT_REPO = "spencer-shadley/repo-template";

/**
 * Historical closed repair issues that previously authorized temporary freezes.
 * Terminal — MUST NOT serve as active exception authority (repo-template#377).
 */
export const KNOWN_CLOSED_ISSUES: ReadonlySet<number> = new Set([
  376,
]);

export interface AllowlistEntry {
  readonly path?: string;
  readonly maxFiles?: number;
  readonly issue?: string;
  readonly issueUrl?: string;
  readonly reason?: string;
  readonly status?: string;
  readonly state?: string;
}

export interface DirBreadthConfig {
  readonly maxFilesPerDir: number;
  readonly roots: readonly string[];
  readonly ignoreDirNames: ReadonlySet<string>;
  readonly allowlist: readonly AllowlistEntry[];
}

export interface DirHit {
  readonly rel: string;
  readonly count: number;
}

export interface AllowlistCap {
  readonly max: number;
  readonly issue: string;
}

export interface CheckDirBreadthResult {
  readonly ok: boolean;
  readonly hits: DirHit[];
  readonly violations: string[];
  readonly allowlisted: string[];
}

export type DirBreadthIssueLookup = (repo: string, issueNum: number) => { state: string } | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRepoIdentity(repo: string): string {
  return repo.trim().toLowerCase();
}

export function extractIssueDetails(issueUrl: string): { repo: string; issue: number } | null {
  const value = issueUrl.trim();
  const match = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)\b/i.exec(value);
  if (match?.[1] && match[2]) {
    return { repo: normalizeRepoIdentity(match[1]), issue: Number(match[2]) };
  }
  const issuePathMatch = /\/issues\/(\d+)\b/.exec(value);
  if (issuePathMatch?.[1]) {
    return { repo: DIR_BREADTH_DEFAULT_REPO, issue: Number(issuePathMatch[1]) };
  }
  const shorthand = /^(?:(?<repo>[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)?)#(?<issue>\d+)$/.exec(value);
  if (shorthand?.groups?.issue) {
    const repoToken = shorthand.groups.repo;
    let repo = DIR_BREADTH_DEFAULT_REPO;
    if (repoToken) {
      if (repoToken.includes("/")) {
        repo = repoToken;
      } else {
        const defaultOwner = DIR_BREADTH_DEFAULT_REPO.split("/", 2)[0];
        repo = `${defaultOwner}/${repoToken}`;
      }
    }
    return { repo: normalizeRepoIdentity(repo), issue: Number(shorthand.groups.issue) };
  }
  return null;
}

export function extractIssueNumber(issueUrl: string): number | null {
  return extractIssueDetails(issueUrl)?.issue ?? null;
}

export function loadConfig(customConfigPath?: string, rootDir?: string): DirBreadthConfig {
  const configFile = customConfigPath ?? join(rootDir ?? root, "scripts", "dir-breadth.json");
  if (!existsSync(configFile)) {
    return {
      maxFilesPerDir: 25,
      roots: ["src", "lib", "packages", "apps", "tools", "scripts"],
      ignoreDirNames: new Set([
        "node_modules", "dist", "build", "coverage", "vendor", ".git",
        "fixtures", "testdata", "__snapshots__", "archive",
      ]),
      allowlist: [],
    };
  }
  const parsed: unknown = JSON.parse(readFileSync(configFile, "utf8"));
  const raw = isRecord(parsed) ? parsed : {};
  const rawMax = Number(raw["maxFilesPerDir"]);
  const rawRoots = raw["roots"];
  const rawIgnore = raw["ignoreDirNames"];
  const rawAllowlist = raw["allowlist"];

  return {
    maxFilesPerDir: rawMax > 0 ? rawMax : 25,
    roots: Array.isArray(rawRoots)
      ? rawRoots.filter((r): r is string => typeof r === "string")
      : ["src", "lib"],
    ignoreDirNames: new Set(
      Array.isArray(rawIgnore)
        ? rawIgnore.filter((i): i is string => typeof i === "string")
        : ["node_modules", "dist", "build", "coverage", "vendor", ".git"],
    ),
    allowlist: Array.isArray(rawAllowlist)
      ? (rawAllowlist.filter((a): a is AllowlistEntry => typeof a === "object" && a !== null))
      : [],
  };
}

export function isSourceFile(name: string): boolean {
  const i = name.lastIndexOf(".");
  if (i < 0) return false;
  return SOURCE_EXT.has(name.slice(i).toLowerCase());
}

export function walk(
  dirAbs: string,
  dirRel: string,
  cfg: DirBreadthConfig,
  hits: DirHit[],
): void {
  let entries;
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  const files = entries.filter((e) => e.isFile() && isSourceFile(e.name));
  if (files.length > cfg.maxFilesPerDir) {
    hits.push({ rel: dirRel || ".", count: files.length });
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (cfg.ignoreDirNames.has(e.name)) continue;
    if (e.name.startsWith(".") && e.name !== ".github") continue;
    const childAbs = join(dirAbs, e.name);
    const childRel = dirRel ? `${dirRel}/${e.name}` : e.name;
    walk(childAbs, childRel, cfg, hits);
  }
}

export function allowlistCap(rel: string, cfg: DirBreadthConfig): AllowlistCap | null {
  const row = cfg.allowlist.find((a) => (a.path ?? "").replaceAll("\\", "/") === rel);
  if (!row) return null;
  const max = Number(row.maxFiles);
  return {
    max: max > 0 ? max : 9999,
    issue: row.issue || row.issueUrl || "",
  };
}

export function ghIssueStateLookup(repo: string, issueNum: number): { state: string } | null {
  try {
    const stdout = execFileSync(
      "gh",
      ["api", `repos/${repo}/issues/${String(issueNum)}`, "--jq", "{state:.state}"],
      { encoding: "utf8", windowsHide: true, timeout: 15_000 },
    );
    const parsed = JSON.parse(stdout) as { state?: string };
    if (parsed && typeof parsed.state === "string") {
      return { state: parsed.state };
    }
  } catch {
    // gh CLI not installed, offline, or rate-limited — offline KNOWN_CLOSED remains the floor
  }
  return null;
}

export function checkDirBreadth(
  rootDir?: string,
  customConfigPath?: string,
  options?: {
    issueLookup?: DirBreadthIssueLookup;
  },
): CheckDirBreadthResult {
  const repoRoot = rootDir ?? root;
  const cfg = loadConfig(customConfigPath, repoRoot);
  const violations: string[] = [];
  const allowlisted: string[] = [];

  // 1. Validate allowlist lifecycle: closed owners cannot keep exemptions alive
  for (const entry of cfg.allowlist) {
    const entryPath = (entry.path ?? "").replaceAll("\\", "/");
    const issueUrl = entry.issue ?? entry.issueUrl ?? "";
    if (!issueUrl) {
      violations.push(`${entryPath}: allowlist entry missing required issue URL`);
      continue;
    }
    const issueDetails = extractIssueDetails(issueUrl);
    const issueNum = issueDetails?.issue ?? extractIssueNumber(issueUrl);
    if (issueNum !== null) {
      if (
        issueDetails
        && issueDetails.repo === normalizeRepoIdentity(DIR_BREADTH_DEFAULT_REPO)
        && KNOWN_CLOSED_ISSUES.has(issueNum)
      ) {
        violations.push(
          `${entryPath}: allowlist cites closed issue #${String(issueNum)} (${issueUrl}); closed issues cannot keep stale exemptions alive (repo-template#377)`,
        );
      } else if (options?.issueLookup && issueDetails) {
        const live = options.issueLookup(issueDetails.repo, issueDetails.issue);
        if (live && live.state.toUpperCase() === "CLOSED") {
          violations.push(
            `${entryPath}: allowlist cites dynamically verified closed issue #${String(issueNum)} (${issueUrl}); closed issues cannot keep stale exemptions alive (repo-template#377)`,
          );
        }
      }
    }
    if (entry.status === "closed" || entry.state === "CLOSED") {
      violations.push(
        `${entryPath}: allowlist entry is marked closed; closed exemptions cannot keep stale authority alive (repo-template#377)`,
      );
    }
  }

  // 2. Walk directory roots and verify peer source file caps
  const hits: DirHit[] = [];
  for (const r of cfg.roots) {
    const abs = join(repoRoot, r);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    walk(abs, r.replaceAll("\\", "/"), cfg, hits);
  }

  for (const h of hits) {
    const allow = allowlistCap(h.rel, cfg);
    const cap = allow ? allow.max : cfg.maxFilesPerDir;
    if (h.count > cap) {
      const issue = allow?.issue ? ` (issue ${allow.issue})` : "";
      violations.push(`${h.rel}: ${String(h.count)} source files > max ${String(cap)}${issue}`);
    } else if (allow) {
      allowlisted.push(
        `dir-breadth: allowlisted ${h.rel} ${String(h.count)}/${String(cap)}${allow.issue ? ` → ${allow.issue}` : ""}`,
      );
    }
  }

  return {
    ok: violations.length === 0,
    hits,
    violations,
    allowlisted,
  };
}

export function main(): void {
  const result = checkDirBreadth(root, configPath, {
    issueLookup: ghIssueStateLookup,
  });
  for (const msg of result.allowlisted) {
    console.log(msg);
  }
  if (!result.ok) {
    console.error(
      "dir-breadth: FAIL — too many peer source files or closed allowlist owners (hurts path-disjoint parallel land):",
    );
    for (const v of result.violations) console.error(`  - ${v}`);
    console.error(
      "Split into subdirs, or retarget allowlist to an active open issue (scripts/dir-breadth.json).",
    );
    process.exit(1);
  }
  console.log("dir-breadth: ok");
}

const THIS_FILE = fileURLToPath(import.meta.url);
if (
  process.argv[1]
  && (resolve(process.argv[1]) === THIS_FILE || import.meta.url === pathToFileURL(process.argv[1]).href)
) {
  main();
}
