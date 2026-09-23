#!/usr/bin/env node
/**
 * CLI for hermetic git spawn check.
 */
import fs from "node:fs";
import path from "node:path";
import { checkHermeticGit } from "./index.ts";

function findTestFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      findTestFiles(full, fileList);
    } else if (entry.isFile()) {
      const normalized = full.replaceAll("\\", "/");
      if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)) {
        fileList.push(path.relative(process.cwd(), full));
      }
    }
  }
  return fileList;
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  let paths = argv.filter((a) => !a.startsWith("-"));
  if (paths.length === 0) {
    paths = findTestFiles(process.cwd());
  }

  const result = checkHermeticGit(paths);
  if (result.violations.length > 0) {
    console.warn(`hermetic-git-check: found ${String(result.violations.length)} unscoped git spawn warning(s):`);
    for (const v of result.violations) {
      console.warn(`  ${v.file}:${String(v.line)} - ${v.detail}`);
    }
    // Starts as a warning for gradual adoption
    return 0;
  }

  console.log(`hermetic-git-check: ok (${String(result.testFilesScanned)} test file(s) scanned)`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
