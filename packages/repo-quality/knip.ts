#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!isRecord(parsed)) {
    throw new TypeError(`${filePath} must contain a JSON object`);
  }
  return parsed;
}

const require = createRequire(import.meta.url);
const knipEntrypoint = join(dirname(require.resolve("knip")), "..", "bin", "knip.js");
const policyPath = fileURLToPath(new URL("./knip.json", import.meta.url));
const overridePath = join(process.cwd(), "knip.overrides.json");
const policy = readJsonObject(policyPath);
const rawOverrides = existsSync(overridePath) ? readJsonObject(overridePath) : {};
const { issue: _issue, ...overrides } = rawOverrides;
const policyRules = isRecord(policy["rules"]) ? policy["rules"] : {};
const overrideRules = isRecord(overrides["rules"]) ? overrides["rules"] : {};
const config = {
  ...policy,
  ...overrides,
  rules: {
    ...policyRules,
    ...overrideRules,
    cycles: "error",
  },
};
const configDirectory = mkdtempSync(join(tmpdir(), "repo-quality-knip-"));
const configPath = join(configDirectory, "knip.json");
writeFileSync(configPath, `${JSON.stringify(config, undefined, 2)}\n`);
const commands: ReadonlyArray<readonly [string, ...string[]]> = [
  ["knip", "--config", configPath],
  ["knip --strict", "--strict", "--config", configPath],
];

try {
  for (const [label, ...args] of commands) {
    console.warn(`repo-quality: ${label}`);
    const result = spawnSync(process.execPath, [knipEntrypoint, ...args], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
} finally {
  rmSync(configDirectory, { force: true, recursive: true });
}
