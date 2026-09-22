#!/usr/bin/env node
// @stack-waiver id=repo-quality-docs-only-gate-mjs reason="Published npm ESM launcher must stay JavaScript so Node can import the TypeScript cli without a separate compile step (same pattern as knip.mjs and sibling package launchers)."
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
