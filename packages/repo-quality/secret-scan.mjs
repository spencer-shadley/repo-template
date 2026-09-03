#!/usr/bin/env node
// @generated from secret-scan.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
// The fleet gate blocks on provider-shaped, high-confidence credentials. Betterleaks' broad
// low/medium heuristics are useful interactively, but repeatedly classified fixtures, placeholders,
// and local service URLs as leaks and inverted the merge path (repo-template#302).
const commands = {
    dir: ["dir", ".", "--confidence", "high", "--redact"],
    staged: ["git", ".", "--pre-commit", "--staged", "--confidence", "high", "--redact"],
    history: ["git", ".", "--confidence", "high", "--redact"],
};
function isSecretScanCommand(value) {
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
].filter((candidate) => candidate !== undefined);
// Resolve host-installed shims explicitly because unshelled Windows lookup misses .cmd files.
const betterleaksPath = [
    ...pathEntries.flatMap((entry) => binaryNames.map((name) => resolve(entry, name))),
    ...hostLocations,
].find((candidate) => existsSync(candidate));
if (!betterleaksPath) {
    console.error("Betterleaks is required on PATH. Install the host binary through Code#1853; this repository does not install host binaries.");
    process.exit(1);
}
const isWindowsCommandShim = process.platform === "win32" && betterleaksPath.endsWith(".cmd");
function supportsConfidenceFlag(binaryPath, isWindowsShim) {
    try {
        const probe = spawnSync(isWindowsShim
            ? process.env["ComSpec"] ?? join(process.env["SystemROOT"] ?? join(process.env["SystemDRIVE"] ?? "C:", "Windows"), "System32", "cmd.exe")
            : binaryPath, isWindowsShim ? ["/d", "/s", "/c", `"${binaryPath}" dir --help`] : ["dir", "--help"], { encoding: "utf8", windowsHide: true });
        return typeof probe.stdout === "string" && probe.stdout.includes("--confidence");
    }
    catch {
        return false;
    }
}
const confidenceArgs = supportsConfidenceFlag(betterleaksPath, isWindowsCommandShim) ? ["--confidence", "high"] : [];
const commandArgs = {
    dir: ["dir", ".", ...confidenceArgs, "--redact"],
    staged: ["git", ".", "--pre-commit", "--staged", ...confidenceArgs, "--redact"],
    history: ["git", ".", ...confidenceArgs, "--redact"],
};
const commandLine = `"${[betterleaksPath, ...commandArgs[command]]
    .map((argument) => `"${argument.replaceAll('"', '""')}"`)
    .join(" ")}"`;
const result = spawnSync(isWindowsCommandShim
    ? process.env["ComSpec"] ?? join(process.env["SystemROOT"] ?? join(process.env["SystemDRIVE"] ?? "C:", "Windows"), "System32", "cmd.exe")
    : betterleaksPath, isWindowsCommandShim ? ["/d", "/s", "/c", commandLine] : [...commandArgs[command]], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsVerbatimArguments: isWindowsCommandShim,
});
if (result.error) {
    throw result.error;
}
process.exitCode = result.status ?? 1;
