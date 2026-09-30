#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

// The fleet gate blocks on provider-shaped, high-confidence credentials. Betterleaks' broad
// low/medium heuristics are useful interactively, but repeatedly classified fixtures, placeholders,
// and local service URLs as leaks and inverted the merge path (repo-template#302).
const commands = {
  dir: ["dir", ".", "--confidence", "high", "--redact"],
  staged: ["git", ".", "--pre-commit", "--staged", "--confidence", "high", "--redact"],
  history: ["git", ".", "--confidence", "high", "--redact"],
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

function supportsConfidenceFlag(binaryPath: string, isWindowsShim: boolean): boolean {
  try {
    // Same cmd.exe quoting as the scan below: /s strips one outer quote pair, and verbatim arguments stop Node
    // escaping the inner quotes. Without both, the probe never ran on .cmd shims and always reported "unsupported".
    const probe = spawnSync(
      isWindowsShim
        ? process.env["ComSpec"] ?? join(process.env["SystemROOT"] ?? join(process.env["SystemDRIVE"] ?? "C:", "Windows"), "System32", "cmd.exe")
        : binaryPath,
      isWindowsShim ? ["/d", "/s", "/c", `""${binaryPath}" dir --help"`] : ["dir", "--help"],
      { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: isWindowsShim },
    );
    return typeof probe.stdout === "string" && probe.stdout.includes("--confidence");
  } catch {
    return false;
  }
}

// The kit declares its host-tool minimums next to this code (package.json fleetRequirements). An older Betterleaks
// without --confidence must fail loudly: scanning unfiltered silently re-enables the rules #302 removed (#463).
function betterleaksRequirement(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  const requirements: unknown = typeof manifest === "object" && manifest !== null ? Reflect.get(manifest, "fleetRequirements") : undefined;
  const requirement: unknown = typeof requirements === "object" && requirements !== null ? Reflect.get(requirements, "betterleaks") : undefined;
  if (typeof requirement !== "string" || requirement === "") {
    throw new TypeError("@spencer-shadley/repo-quality package.json must declare fleetRequirements.betterleaks");
  }
  return requirement;
}

if (!supportsConfidenceFlag(betterleaksPath, isWindowsCommandShim)) {
  const requirement = betterleaksRequirement();
  console.error(
    `betterleaks at ${betterleaksPath} lacks --confidence; @spencer-shadley/repo-quality requires betterleaks ${requirement}. `
      + `Bump the git-github-tooling Betterleaks pin to ${requirement}. Refusing to scan unfiltered (repo-template#463).`,
  );
  process.exit(3);
}

const confidenceArgs = ["--confidence", "high"];
const commandArgs: Record<SecretScanCommand, string[]> = {
  dir: ["dir", ".", ...confidenceArgs, "--redact"],
  staged: ["git", ".", "--pre-commit", "--staged", ...confidenceArgs, "--redact"],
  history: ["git", ".", ...confidenceArgs, "--redact"],
};

const commandLine = `"${[betterleaksPath, ...commandArgs[command]]
  .map((argument) => `"${argument.replaceAll('"', '""')}"`)
  .join(" ")}"`;
const result = spawnSync(
  isWindowsCommandShim
    ? process.env["ComSpec"] ?? join(process.env["SystemROOT"] ?? join(process.env["SystemDRIVE"] ?? "C:", "Windows"), "System32", "cmd.exe")
    : betterleaksPath,
  isWindowsCommandShim ? ["/d", "/s", "/c", commandLine] : [...commandArgs[command]],
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
