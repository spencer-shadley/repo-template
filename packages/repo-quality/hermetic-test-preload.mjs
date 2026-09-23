#!/usr/bin/env node
// @stack-waiver id=repo-quality-hermetic-test-preload-mjs reason="Published npm ESM launcher must stay JavaScript so Node can --import the TypeScript preload without a separate compile step (same pattern as docs-only-gate.mjs)."
/**
 * Thin ESM --import launcher for the shared hermetic test preload (code#6081 / DOCTRINE §65).
 * Prefer: node --experimental-strip-types --import ./node_modules/@spencer-shadley/repo-quality/hermetic-test-preload.mjs
 * Or TypeScript direct: node --experimental-strip-types --import ./…/hermetic-test-preload/preload.ts
 */
try {
  await import("./hermetic-test-preload/preload.ts");
} catch (error) {
  console.error(error);
  process.exit(1);
}
