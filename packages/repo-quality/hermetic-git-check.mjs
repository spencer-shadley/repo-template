#!/usr/bin/env node
// @stack-waiver id=repo-quality-hermetic-git-check-mjs reason="Published npm ESM launcher for hermetic git check CLI"
/**
 * Thin ESM launcher for hermetic git spawn check.
 * Prefer: node --experimental-strip-types packages/repo-quality/hermetic-git-check/cli.ts
 */
try {
  await import("./hermetic-git-check/cli.ts");
} catch (error) {
  console.error(error);
  process.exit(1);
}
