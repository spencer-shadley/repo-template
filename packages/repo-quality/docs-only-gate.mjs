#!/usr/bin/env node
/**
 * Thin ESM launcher for the portable docs-only simpleDiff gate (RT#422).
 * Prefer: node --experimental-strip-types packages/repo-quality/docs-only-gate/cli.ts
 */
try {
  await import("./docs-only-gate/cli.ts");
} catch (error) {
  console.error(error);
  process.exit(1);
}
