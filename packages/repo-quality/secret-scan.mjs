#!/usr/bin/env node
// @stack-waiver id=secret-scan-wrapper reason="Published entrypoint invokes the host-installed Betterleaks binary."
import { spawnSync } from "node:child_process";

const commands = {
  dir: ["dir", ".", "--redact"],
  staged: ["git", ".", "--pre-commit", "--staged", "--redact"],
  history: ["git", ".", "--redact"],
};
const command = process.argv[2];

if (!Object.hasOwn(commands, command) || process.argv.length !== 3) {
  console.error("usage: secret-scan.mjs <dir|staged|history>");
  process.exit(2);
}

const result = spawnSync("betterleaks", commands[command], {
  cwd: process.cwd(),
  stdio: "inherit",
});

if (result.error) {
  console.error(
    "Betterleaks is required on PATH. Install the host binary through Code#1853; this repository does not install host binaries.",
  );
  process.exit(1);
}

process.exitCode = result.status ?? 1;
