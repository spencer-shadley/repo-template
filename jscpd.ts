#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const jscpdEntrypoint = require.resolve("jscpd/run-jscpd.js");
const policyPath = fileURLToPath(new URL("./jscpd.json", import.meta.url));
const outputDirectory = join(process.cwd(), ".ops");
const reportPath = join(outputDirectory, "jscpd-ai.txt");

mkdirSync(outputDirectory, { recursive: true });
const result = spawnSync(process.execPath, [jscpdEntrypoint, "--config", policyPath], {
  cwd: process.cwd(),
  encoding: "utf8",
});
const stdout = result.stdout || "";
const stderr = result.stderr || "";
const report = `${stdout}${stderr}`;

process.stdout.write(report);
writeFileSync(reportPath, report);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
