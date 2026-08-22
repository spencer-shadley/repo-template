#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

const commands = {
  dir: ["dir", ".", "--redact"],
  staged: ["git", ".", "--pre-commit", "--staged", "--redact"],
  history: ["git", ".", "--redact"],
} as const;
type SecretScanCommand = keyof typeof commands;

function isSecretScanCommand(value: string | undefined): value is SecretScanCommand {
  return value === "dir" || value === "staged" || value === "history";
}

const command = process.argv[2];

if (!isSecretScanCommand(command) || process.argv.length !== 3) {
  console.error("usage: secret-scan.mjs <dir|staged|history>");
  process.exit(2);
}

const binaryNames = ["betterleaks", "betterleaks.cmd", "betterleaks.exe"];
const pathEntries = (process.env["PATH"] ?? process.env["Path"] ?? "").split(delimiter);
const hostLocations = [
  process.env["USERPROFILE"] ? resolve(join(process.env["USERPROFILE"], ".local", "bin", "betterleaks.cmd")) : undefined,
  process.env["USERPROFILE"] ? resolve(join(process.env["USERPROFILE"], ".local", "bin", "betterleaks")) : undefined,
  process.env["HOME"] ? resolve(join(process.env["HOME"], ".local", "bin", "betterleaks")) : undefined,
].filter((candidate): candidate is string => candidate !== undefined);

// Resolve host-installed shims explicitly because unshelled Windows lookup misses .cmd files.
const betterleaksPath = [
  ...pathEntries.flatMap((entry) => binaryNames.map((name) => resolve(entry, name))),
  ...hostLocations,
].find((candidate) => existsSync(candidate));

if (!betterleaksPath) {
  console.error(
    "Betterleaks is required on PATH. Install the host binary through Code#1853; this repository does not install host binaries.",
  );
  process.exit(1);
}

const isWindowsCommandShim = process.platform === "win32" && betterleaksPath.endsWith(".cmd");
const commandLine = `"${[betterleaksPath, ...commands[command]]
  .map((argument) => `"${argument.replaceAll('"', '""')}"`)
  .join(" ")}"`;
const result = spawnSync(
  isWindowsCommandShim
    ? process.env["ComSpec"] ?? join(process.env["SystemROOT"] ?? join(process.env["SystemDRIVE"] ?? "C:", "Windows"), "System32", "cmd.exe")
    : betterleaksPath,
  isWindowsCommandShim ? ["/d", "/s", "/c", commandLine] : [...commands[command]],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsVerbatimArguments: isWindowsCommandShim,
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
