#!/usr/bin/env node
/**
 * Thin ESM launcher for the portable docs-only simpleDiff gate (RT#422).
 * Prefer: node --experimental-strip-types packages/repo-quality/docs-only-gate/cli.ts
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "docs-only-gate", "cli.ts");
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", cli, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
