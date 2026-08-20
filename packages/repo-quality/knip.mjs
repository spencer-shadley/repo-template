#!/usr/bin/env node
// @stack-waiver id=knip-wrapper reason="Published Node entrypoint executes the kit-owned Knip policy."
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const knipEntrypoint = join(dirname(require.resolve("knip")), "..", "bin", "knip.js");
const policyPath = fileURLToPath(new URL("./knip.json", import.meta.url));
const overridePath = join(process.cwd(), "knip.overrides.json");
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const rawOverrides = existsSync(overridePath) ? JSON.parse(readFileSync(overridePath, "utf8")) : {};
const { issue: _issue, ...overrides } = rawOverrides;
const config = {
  ...policy,
  ...overrides,
  rules: {
    ...policy.rules,
    ...overrides.rules,
    cycles: "error",
  },
};
const configDirectory = mkdtempSync(join(tmpdir(), "repo-quality-knip-"));
const configPath = join(configDirectory, "knip.json");
writeFileSync(configPath, `${JSON.stringify(config, undefined, 2)}\n`);
const commands = [
  ["knip", "--config", configPath],
  ["knip --strict", "--strict", "--config", configPath],
];

try {
  for (const [label, ...args] of commands) {
    console.log(`repo-quality: ${label}`);
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
