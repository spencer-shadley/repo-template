#!/usr/bin/env node
// @stack-waiver id=repo-quality-issue-link-mjs reason="Published npm ESM launcher must stay JavaScript so Node can import the TypeScript cli without a separate compile step (same pattern as knip.mjs and docs-only-gate.mjs)."
/**
 * Thin ESM launcher for the portable issue-link checker (RT#345).
 * Prefer: node --experimental-strip-types packages/repo-quality/issue-link/cli.ts
 * (package path on disk remains the historical RT#345 directory name.)
 */
try {
  await import("./todo-issue-link/cli.ts");
} catch (error) {
  console.error(error);
  process.exit(1);
}
