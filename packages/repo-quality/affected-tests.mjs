#!/usr/bin/env node
// @stack-waiver id=repo-quality-affected-tests-mjs reason="Published npm bin launcher must stay JavaScript so Node can import the emitted cli without a compile step (same pattern as default-branch-guard.mjs)."
/**
 * `fleet-test-affected` bin: run only the test files a change affects (repo-template#549).
 * Prefer: node --experimental-strip-types packages/repo-quality/affected-tests/cli.ts
 */
try {
  await import("./affected-tests/cli.mjs");
} catch (error) {
  console.error(error);
  process.exit(1);
}
