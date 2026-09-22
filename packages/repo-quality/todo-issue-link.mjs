#!/usr/bin/env node
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Prefer experimental strip-types when available; fall back to direct ts import under Node 24+.
try {
  await import("./todo-issue-link/cli.ts");
} catch (error) {
  console.error(error);
  process.exit(1);
}
