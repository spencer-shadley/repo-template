#!/usr/bin/env node
/**
 * Fail closed when a source directory has too many peer files (mega-dirs hurt
 * path-disjoint parallel land). Config: scripts/dir-breadth.json
 *
 * Disable flow for a dir that already exceeds the cap:
 *   1. File GH issue "re-enable dir-breadth for <path>"
 *   2. Add to allowlist: { "path": "src/foo", "maxFiles": 99, "issue": "https://github.com/.../issues/N" }
 *   3. When fixed, lower max / remove allowlist entry and close issue
 *
 * Exit 0 = ok, 1 = violation, 2 = config error
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "scripts", "dir-breadth.json");

const SOURCE_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".mts", ".cts",
]);

interface AllowlistEntry {
  readonly path?: string;
  readonly maxFiles?: number;
  readonly issue?: string;
  readonly issueUrl?: string;
}

interface DirBreadthConfig {
  readonly maxFilesPerDir: number;
  readonly roots: readonly string[];
  readonly ignoreDirNames: ReadonlySet<string>;
  readonly allowlist: readonly AllowlistEntry[];
}

interface Hit {
  readonly rel: string;
  readonly count: number;
}

interface AllowlistCapResult {
  readonly max: number;
  readonly issue: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadConfig(): DirBreadthConfig {
  if (!existsSync(configPath)) {
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
  const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
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

function isSourceFile(name: string): boolean {
  const i = name.lastIndexOf(".");
  if (i < 0) return false;
  return SOURCE_EXT.has(name.slice(i).toLowerCase());
}

function walk(
  dirAbs: string,
  dirRel: string,
  cfg: DirBreadthConfig,
  hits: Hit[],
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

function allowlistCap(rel: string, cfg: DirBreadthConfig): AllowlistCapResult | null {
  const row = cfg.allowlist.find((a) => (a.path ?? "").replace(/\\/g, "/") === rel);
  if (!row) return null;
  const max = Number(row.maxFiles);
  return {
    max: max > 0 ? max : 9999,
    issue: row.issue || row.issueUrl || "",
  };
}

function checkHit(h: Hit, cfg: DirBreadthConfig, violations: string[]): void {
  const allow = allowlistCap(h.rel, cfg);
  const cap = allow ? allow.max : cfg.maxFilesPerDir;
  if (h.count > cap) {
    const issue = allow?.issue ? ` (issue ${allow.issue})` : "";
    violations.push(`${h.rel}: ${h.count} source files > max ${cap}${issue}`);
  } else if (allow) {
    console.log(`dir-breadth: allowlisted ${h.rel} ${h.count}/${cap}${allow.issue ? ` → ${allow.issue}` : ""}`);
  }
}

function main(): void {
  const cfg = loadConfig();
  const hits: Hit[] = [];
  for (const r of cfg.roots) {
    const abs = join(root, r);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    walk(abs, r.replace(/\\/g, "/"), cfg, hits);
  }

  const violations: string[] = [];
  for (const h of hits) {
    checkHit(h, cfg, violations);
  }

  if (violations.length) {
    console.error("dir-breadth: FAIL — too many peer source files (hurts path-disjoint parallel land):");
    for (const v of violations) console.error(`  - ${v}`);
    console.error("Split into subdirs, or allowlist with a GH issue to re-enable the cap (scripts/dir-breadth.json).");
    process.exit(1);
  }
  console.log("dir-breadth: ok");
}

main();
