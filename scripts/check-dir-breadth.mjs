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
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "scripts", "dir-breadth.json");

const SOURCE_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".mts", ".cts",
]);

function loadConfig() {
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
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  return {
    maxFilesPerDir: Number(raw.maxFilesPerDir) > 0 ? Number(raw.maxFilesPerDir) : 25,
    roots: Array.isArray(raw.roots) ? raw.roots : ["src", "lib"],
    ignoreDirNames: new Set(raw.ignoreDirNames || ["node_modules", "dist", "build", "coverage", "vendor", ".git"]),
    allowlist: Array.isArray(raw.allowlist) ? raw.allowlist : [],
  };
}

function isSourceFile(name) {
  const i = name.lastIndexOf(".");
  if (i < 0) return false;
  return SOURCE_EXT.has(name.slice(i).toLowerCase());
}

function walk(dirAbs, dirRel, cfg, hits) {
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

function allowlistCap(rel, cfg) {
  const row = cfg.allowlist.find((a) => String(a.path || "").replace(/\\/g, "/") === rel);
  if (!row) return null;
  return {
    max: Number(row.maxFiles) > 0 ? Number(row.maxFiles) : 9999,
    issue: row.issue || row.issueUrl || "",
  };
}

function main() {
  const cfg = loadConfig();
  const hits = [];
  for (const r of cfg.roots) {
    const abs = join(root, r);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    walk(abs, r.replace(/\\/g, "/"), cfg, hits);
  }

  const violations = [];
  for (const h of hits) {
    const allow = allowlistCap(h.rel, cfg);
    const cap = allow ? allow.max : cfg.maxFilesPerDir;
    if (h.count > cap) {
      const issue = allow?.issue ? ` (issue ${allow.issue})` : "";
      violations.push(`${h.rel}: ${h.count} source files > max ${cap}${issue}`);
    } else if (allow) {
      console.log(`dir-breadth: allowlisted ${h.rel} ${h.count}/${cap}${allow.issue ? ` → ${allow.issue}` : ""}`);
    }
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
