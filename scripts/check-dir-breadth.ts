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

function parseFullGithubIssueUrl(value: string): { repo: string; issue: number } | null {
  const match = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)\b/i.exec(value);
  if (!match?.[1] || !match[2]) return null;
  return { repo: normalizeRepoIdentity(match[1]), issue: Number(match[2]) };
}

function parseIssuePathOnly(value: string): { repo: string; issue: number } | null {
  const match = /\/issues\/(\d+)\b/.exec(value);
  if (!match?.[1]) return null;
  return { repo: DIR_BREADTH_DEFAULT_REPO, issue: Number(match[1]) };
}

function parseShorthandIssueRef(value: string): { repo: string; issue: number } | null {
  // Avoid named groups (sonarjs/unused-named-groups + index-signature friction).
  const match = /^(?:([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)?)#(\d+)$/.exec(value);
  if (!match?.[2]) return null;
  const repoToken = match[1];
  let repo = DIR_BREADTH_DEFAULT_REPO;
  if (repoToken) {
    if (repoToken.includes("/")) {
      repo = repoToken;
    } else {
      const defaultOwner = DIR_BREADTH_DEFAULT_REPO.split("/", 2)[0] ?? "spencer-shadley";
      repo = `${defaultOwner}/${repoToken}`;
    }
  }
  return { repo: normalizeRepoIdentity(repo), issue: Number(match[2]) };
}

export function extractIssueDetails(issueUrl: string): { repo: string; issue: number } | null {
  const value = issueUrl.trim();
  return parseFullGithubIssueUrl(value) ?? parseIssuePathOnly(value) ?? parseShorthandIssueRef(value);
}

export function extractIssueNumber(issueUrl: string): number | null {
  return extractIssueDetails(issueUrl)?.issue ?? null;
}

function readStringArray(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  return raw.filter((item): item is string => typeof item === "string");
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
  const allowlistRaw = raw["allowlist"];
  const allowlist = Array.isArray(allowlistRaw)
    ? allowlistRaw.filter((a): a is AllowlistEntry => typeof a === "object" && a !== null)
    : [];
  return {
    maxFilesPerDir: rawMax > 0 ? rawMax : 25,
    roots: readStringArray(raw["roots"], ["src", "lib"]),
    ignoreDirNames: new Set(
      readStringArray(raw["ignoreDirNames"], ["node_modules", "dist", "build", "coverage", "vendor", ".git"]),
    ),
    allowlist,
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

function parseIssueStatePayload(stdout: string): { state: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const state = parsed["state"];
  if (typeof state !== "string") return null;
  return { state };
}

export function ghIssueStateLookup(repo: string, issueNum: number): { state: string } | null {
  try {
    const stdout = execFileSync(
      "gh",
      ["api", `repos/${repo}/issues/${String(issueNum)}`, "--jq", "{state:.state}"],
      { encoding: "utf8", windowsHide: true, timeout: 15_000 },
    );
    return parseIssueStatePayload(stdout);
  } catch {
    // gh CLI not installed, offline, or rate-limited — offline KNOWN_CLOSED remains the floor
    return null;
  }
}

function closedOwnerViolation(
  entryPath: string,
  issueUrl: string,
  issueNum: number,
  kind: "known" | "dynamic",
): string {
  const label = kind === "known" ? "closed issue" : "dynamically verified closed issue";
  return (
    `${entryPath}: allowlist cites ${label} #${String(issueNum)} (${issueUrl}); `
    + "closed issues cannot keep stale exemptions alive (repo-template#377)"
  );
}

function entryMarkedClosed(entry: AllowlistEntry): boolean {
  return entry.status === "closed" || entry.state === "CLOSED";
}

function closedOwnerFromDetails(
  entryPath: string,
  issueUrl: string,
  issueDetails: { repo: string; issue: number },
  options?: { issueLookup?: DirBreadthIssueLookup },
): string | null {
  const defaultRepo = normalizeRepoIdentity(DIR_BREADTH_DEFAULT_REPO);
  const issueNum = issueDetails.issue;
  if (issueDetails.repo === defaultRepo && KNOWN_CLOSED_ISSUES.has(issueNum)) {
    return closedOwnerViolation(entryPath, issueUrl, issueNum, "known");
  }
  const lookup = options?.issueLookup;
  if (!lookup) return null;
  const live = lookup(issueDetails.repo, issueDetails.issue);
  if (live?.state.toUpperCase() === "CLOSED") {
    return closedOwnerViolation(entryPath, issueUrl, issueNum, "dynamic");
  }
  return null;
}

function validateOneAllowlistEntry(
  entry: AllowlistEntry,
  options?: { issueLookup?: DirBreadthIssueLookup },
): string[] {
  const violations: string[] = [];
  const entryPath = (entry.path ?? "").replaceAll("\\", "/");
  const issueUrl = entry.issue ?? entry.issueUrl ?? "";
  if (!issueUrl) {
    violations.push(`${entryPath}: allowlist entry missing required issue URL`);
    return violations;
  }
  const issueDetails = extractIssueDetails(issueUrl);
  if (issueDetails) {
    const closed = closedOwnerFromDetails(entryPath, issueUrl, issueDetails, options);
    if (closed) violations.push(closed);
  }
  if (entryMarkedClosed(entry)) {
    violations.push(
      `${entryPath}: allowlist entry is marked closed; closed exemptions cannot keep stale authority alive (repo-template#377)`,
    );
  }
  return violations;
}

function validateAllowlistLifecycle(
  cfg: DirBreadthConfig,
  options?: { issueLookup?: DirBreadthIssueLookup },
): string[] {
  const violations: string[] = [];
  for (const entry of cfg.allowlist) {
    violations.push(...validateOneAllowlistEntry(entry, options));
  }
  return violations;
}

function evaluatePeerCaps(
  hits: readonly DirHit[],
  cfg: DirBreadthConfig,
): { violations: string[]; allowlisted: string[] } {
  const violations: string[] = [];
  const allowlisted: string[] = [];
  for (const h of hits) {
    const allow = allowlistCap(h.rel, cfg);
    const cap = allow ? allow.max : cfg.maxFilesPerDir;
    if (h.count > cap) {
      const issue = allow?.issue ? ` (issue ${allow.issue})` : "";
      violations.push(`${h.rel}: ${String(h.count)} source files > max ${String(cap)}${issue}`);
    } else if (allow) {
      const arrow = allow.issue ? ` → ${allow.issue}` : "";
      allowlisted.push(`dir-breadth: allowlisted ${h.rel} ${String(h.count)}/${String(cap)}${arrow}`);
    }
  }
  return { violations, allowlisted };
}

function collectHits(repoRoot: string, cfg: DirBreadthConfig): DirHit[] {
  const hits: DirHit[] = [];
  for (const r of cfg.roots) {
    const abs = join(repoRoot, r);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    walk(abs, r.replaceAll("\\", "/"), cfg, hits);
  }
  return hits;
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
  const lifecycleViolations = validateAllowlistLifecycle(cfg, options);
  const hits = collectHits(repoRoot, cfg);
  const peers = evaluatePeerCaps(hits, cfg);
  const violations = [...lifecycleViolations, ...peers.violations];
  return {
    ok: violations.length === 0,
    hits,
    violations,
    allowlisted: peers.allowlisted,
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
