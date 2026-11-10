#!/usr/bin/env node
/**
 * `fleet-test-affected` executable for the published repo-quality package.
 * The installed package cannot load TypeScript from node_modules, so the
 * TypeScript-authored launcher is emitted as an ESM `.mjs` artifact.
 */
try {
  await import(new URL("./affected-tests/cli.mjs", import.meta.url).href);
} catch (error) {
  console.error(error);
  process.exit(1);
}
