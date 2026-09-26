#!/usr/bin/env node
// @stack-waiver id=repo-quality-default-branch-guard-mjs reason="Published npm ESM launcher must stay JavaScript so Node can import the TypeScript cli without a separate compile step (same pattern as docs-only-gate.mjs)."
/**
 * Thin ESM launcher for the default-branch commit guard (repo-template#440).
 * Prefer: node --experimental-strip-types packages/repo-quality/default-branch-guard/cli.ts
 */
try {
  await import("./default-branch-guard/cli.ts");
} catch (error) {
  console.error(error);
  process.exit(1);
}
