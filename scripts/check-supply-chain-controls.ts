#!/usr/bin/env node
/** Enforce AI-First stack §9.2 package-manager supply-chain controls (repo-template#324). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import process from "node:process";

export type SupplyChainRule = "SC1" | "SC2" | "SC3" | "SC4" | "SC5";

export interface SupplyChainViolation {
  readonly rule: SupplyChainRule;
  readonly message: string;
}

interface Inputs {
  readonly npmrc: string;
  readonly workspace: string;
  readonly packageJson: string;
}

function packageData(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("package.json must contain an object");
  }
  return value as Record<string, unknown>;
}

function scalarMinutes(workspace: string): number | null {
  const match = /^minimumReleaseAge:\s*(\d+)\s*$/mu.exec(workspace);
  return match?.[1] ? Number(match[1]) : null;
}

function hasBuildAllowlist(workspace: string): boolean {
  return /^onlyBuiltDependencies:\s*(?:\[[^\]]*\])?\s*$/mu.test(workspace);
}

function packageManagerPnpmVersion(pkg: Record<string, unknown>): string | null {
  if (typeof pkg.packageManager !== "string") return null;
  return /^pnpm@(.+)$/u.exec(pkg.packageManager)?.[1] ?? null;
}

function engines(pkg: Record<string, unknown>): Record<string, unknown> {
  return typeof pkg.engines === "object" && pkg.engines !== null && !Array.isArray(pkg.engines)
    ? pkg.engines as Record<string, unknown>
    : {};
}

function isBareExactVersion(value: string): boolean {
  return /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value.trim());
}

export function checkSupplyChainControls(input: Inputs): SupplyChainViolation[] {
  const violations: SupplyChainViolation[] = [];
  if (!/^engine-strict\s*=\s*true\s*$/mu.test(input.npmrc)) {
    violations.push({ rule: "SC1", message: "SC1 .npmrc must declare engine-strict=true" });
  }

  const minimumReleaseAge = scalarMinutes(input.workspace);
  if (minimumReleaseAge === null || minimumReleaseAge < 1440) {
    violations.push({
      rule: "SC2",
      message: "SC2 pnpm-workspace.yaml must declare minimumReleaseAge >= 1440 minutes",
    });
  }

  if (!hasBuildAllowlist(input.workspace)) {
    violations.push({
      rule: "SC3",
      message: "SC3 pnpm-workspace.yaml must explicitly declare onlyBuiltDependencies (empty is valid)",
    });
  }

  const pkg = packageData(input.packageJson);
  const expectedPnpm = packageManagerPnpmVersion(pkg);
  const declaredEngines = engines(pkg);
  if (expectedPnpm === null || declaredEngines.pnpm !== expectedPnpm) {
    violations.push({
      rule: "SC4",
      message: "SC4 package.json engines.pnpm must exactly equal the pnpm version in packageManager",
    });
  }

  const nodeEngine = declaredEngines.node;
  if (typeof nodeEngine !== "string" || nodeEngine.trim() === "" || isBareExactVersion(nodeEngine)) {
    violations.push({
      rule: "SC5",
      message: "SC5 package.json engines.node must be a range expression, not a bare exact version",
    });
  }
  return violations;
}

function rules(input: Inputs): SupplyChainRule[] {
  return checkSupplyChainControls(input).map(({ rule }) => rule);
}

function runSelfTest(): void {
  const valid: Inputs = {
    npmrc: "engine-strict=true\nignore-scripts=true\n",
    workspace: 'packages:\n  - "packages/*"\nminimumReleaseAge: 10080\nonlyBuiltDependencies: []\n',
    packageJson: JSON.stringify({
      packageManager: "pnpm@11.17.0",
      engines: { node: ">=24.16.0 <25", pnpm: "11.17.0" },
    }),
  };
  assert.deepEqual(rules(valid), []);
  assert.deepEqual(rules({ ...valid, npmrc: "ignore-scripts=true\n" }), ["SC1"]);
  assert.deepEqual(rules({ ...valid, workspace: valid.workspace.replace("10080", "100") }), ["SC2"]);
  assert.deepEqual(
    rules({ ...valid, workspace: valid.workspace.replace("onlyBuiltDependencies: []\n", "") }),
    ["SC3"],
  );
  assert.deepEqual(
    rules({ ...valid, packageJson: valid.packageJson.replace('"pnpm":"11.17.0"', '"pnpm":"11.16.0"') }),
    ["SC4"],
  );
  assert.deepEqual(
    rules({ ...valid, packageJson: valid.packageJson.replace('">=24.16.0 <25"', '"24.16.0"') }),
    ["SC5"],
  );
  process.stdout.write("check-supply-chain-controls self-test: ok\n");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }
  const violations = checkSupplyChainControls({
    npmrc: readFileSync(".npmrc", "utf8"),
    workspace: readFileSync("pnpm-workspace.yaml", "utf8"),
    packageJson: readFileSync("package.json", "utf8"),
  });
  for (const violation of violations) {
    process.stderr.write(`${violation.rule}: ${violation.message}\n`);
  }
  if (violations.length > 0) process.exitCode = 1;
}

main();
