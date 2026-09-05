#!/usr/bin/env node
/**
 * Validate supply-chain controls SC1-SC5 (Issue #324).
 *
 * Assertions:
 *   SC1: .npmrc declares engine-strict=true
 *   SC2: minimumReleaseAge declared and >= 1440 minutes
 *   SC3: onlyBuiltDependencies declared (empty allowlist PASSES; absence FAILS)
 *   SC4: package.json engines.pnpm exists and equals version from packageManager (pnpm@<version>)
 *   SC5: package.json engines.node exists and is a range expression, not bare exact version
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export type RuleId = "SC1" | "SC2" | "SC3" | "SC4" | "SC5";

export interface SupplyChainViolation {
  readonly filename: string;
  readonly line: number;
  readonly ruleId: RuleId;
  readonly message: string;
}

export interface CheckSupplyChainOptions {
  readonly repoRoot?: string;
  readonly npmrcContent?: string;
  readonly workspaceYamlContent?: string;
  readonly packageJsonContent?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findLineInText(text: string, pattern: RegExp): number {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i] ?? "")) {
      return i + 1;
    }
  }
  return 1;
}

export function isBareExactVersion(version: string): boolean {
  return /^=?\s*v?\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?$/.test(version.trim());
}

export interface NpmrcInfo {
  readonly engineStrictDeclared: boolean;
  readonly engineStrictValue?: string;
  readonly engineStrictLine: number;
}

export function parseNpmrc(content: string): NpmrcInfo {
  const lines = content.split(/\r?\n/);
  let engineStrictDeclared = false;
  let engineStrictValue: string | undefined;
  let engineStrictLine = 1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key === "engine-strict") {
      engineStrictDeclared = true;
      engineStrictValue = val;
      engineStrictLine = i + 1;
    }
  }

  return {
    engineStrictDeclared,
    engineStrictLine,
    ...(engineStrictValue !== undefined ? { engineStrictValue } : {}),
  };
}

export interface WorkspaceYamlInfo {
  readonly minimumReleaseAgeDeclared: boolean;
  readonly minimumReleaseAgeValue?: number;
  readonly minimumReleaseAgeRaw?: string;
  readonly minimumReleaseAgeLine: number;
  readonly onlyBuiltDependenciesDeclared: boolean;
  readonly onlyBuiltDependenciesValid: boolean;
  readonly onlyBuiltDependenciesLine: number;
}

function stripTrailingComment(value: string): string {
  const hashIdx = value.indexOf(" #");
  return hashIdx === -1 ? value.trim() : value.slice(0, hashIdx).trim();
}

function parseTopLevelYamlKey(rawLine: string): { readonly key: string; readonly rest: string } | null {
  if (/^\s/.test(rawLine)) return null;
  const keyMatch = /^(['"]?[A-Za-z0-9_-]+['"]?)\s*:(.*)$/.exec(rawLine);
  if (!keyMatch?.[1]) return null;
  const unquotedKey = keyMatch[1].replaceAll(/['"]/g, "");
  const rest = stripTrailingComment(keyMatch[2] ?? "");
  return { key: unquotedKey, rest };
}

function isAllowlistValid(rest: string): boolean {
  if (rest === "[]" || rest === "" || rest === "null" || rest === "~") {
    return true;
  }
  return rest.startsWith("[") && rest.endsWith("]");
}

export function parseWorkspaceYaml(content: string): WorkspaceYamlInfo {
  const lines = content.split(/\r?\n/);
  let minimumReleaseAgeDeclared = false;
  let minimumReleaseAgeValue: number | undefined;
  let minimumReleaseAgeRaw: string | undefined;
  let minimumReleaseAgeLine = 1;
  let onlyBuiltDependenciesDeclared = false;
  let onlyBuiltDependenciesValid = false;
  let onlyBuiltDependenciesLine = 1;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const parsed = parseTopLevelYamlKey(rawLine);
    if (!parsed) continue;

    if (parsed.key === "minimumReleaseAge") {
      minimumReleaseAgeDeclared = true;
      minimumReleaseAgeLine = i + 1;
      minimumReleaseAgeRaw = parsed.rest;
      const num = Number(parsed.rest);
      if (parsed.rest !== "" && Number.isInteger(num)) {
        minimumReleaseAgeValue = num;
      }
    } else if (parsed.key === "onlyBuiltDependencies") {
      onlyBuiltDependenciesDeclared = true;
      onlyBuiltDependenciesLine = i + 1;
      onlyBuiltDependenciesValid = isAllowlistValid(parsed.rest);
    }
  }

  return {
    minimumReleaseAgeDeclared,
    minimumReleaseAgeLine,
    onlyBuiltDependenciesDeclared,
    onlyBuiltDependenciesValid,
    onlyBuiltDependenciesLine,
    ...(minimumReleaseAgeValue !== undefined ? { minimumReleaseAgeValue } : {}),
    ...(minimumReleaseAgeRaw !== undefined ? { minimumReleaseAgeRaw } : {}),
  };
}

function validateSC1(npmrcContent: string | undefined): SupplyChainViolation[] {
  if (npmrcContent === undefined) {
    return [
      {
        filename: ".npmrc",
        line: 1,
        ruleId: "SC1",
        message: "Missing .npmrc; expected 'engine-strict=true'",
      },
    ];
  }
  const info = parseNpmrc(npmrcContent);
  if (!info.engineStrictDeclared) {
    return [
      {
        filename: ".npmrc",
        line: 1,
        ruleId: "SC1",
        message: ".npmrc does not declare 'engine-strict=true'",
      },
    ];
  }
  if (info.engineStrictValue !== "true") {
    return [
      {
        filename: ".npmrc",
        line: info.engineStrictLine,
        ruleId: "SC1",
        message: `.npmrc declares 'engine-strict=${info.engineStrictValue ?? ""}'; expected 'true'`,
      },
    ];
  }
  return [];
}

function validateSC2(workspaceInfo: WorkspaceYamlInfo | null): SupplyChainViolation[] {
  if (!workspaceInfo) {
    return [
      {
        filename: "pnpm-workspace.yaml",
        line: 1,
        ruleId: "SC2",
        message: "Missing pnpm-workspace.yaml; expected 'minimumReleaseAge >= 1440'",
      },
    ];
  }
  if (!workspaceInfo.minimumReleaseAgeDeclared) {
    return [
      {
        filename: "pnpm-workspace.yaml",
        line: 1,
        ruleId: "SC2",
        message: "'minimumReleaseAge' is not declared; expected value >= 1440 minutes",
      },
    ];
  }
  if (workspaceInfo.minimumReleaseAgeValue === undefined) {
    return [
      {
        filename: "pnpm-workspace.yaml",
        line: workspaceInfo.minimumReleaseAgeLine,
        ruleId: "SC2",
        message: `'minimumReleaseAge' is not a valid integer; found '${workspaceInfo.minimumReleaseAgeRaw ?? ""}'`,
      },
    ];
  }
  if (workspaceInfo.minimumReleaseAgeValue < 1440) {
    return [
      {
        filename: "pnpm-workspace.yaml",
        line: workspaceInfo.minimumReleaseAgeLine,
        ruleId: "SC2",
        message: `'minimumReleaseAge' is ${String(workspaceInfo.minimumReleaseAgeValue)} minutes; expected >= 1440 minutes (one day)`,
      },
    ];
  }
  return [];
}

function validateSC3(workspaceInfo: WorkspaceYamlInfo | null): SupplyChainViolation[] {
  if (!workspaceInfo) {
    return [
      {
        filename: "pnpm-workspace.yaml",
        line: 1,
        ruleId: "SC3",
        message: "Missing pnpm-workspace.yaml; expected 'onlyBuiltDependencies' build-script allowlist",
      },
    ];
  }
  if (!workspaceInfo.onlyBuiltDependenciesDeclared) {
    return [
      {
        filename: "pnpm-workspace.yaml",
        line: 1,
        ruleId: "SC3",
        message: "'onlyBuiltDependencies' build-script allowlist is not declared",
      },
    ];
  }
  if (!workspaceInfo.onlyBuiltDependenciesValid) {
    return [
      {
        filename: "pnpm-workspace.yaml",
        line: workspaceInfo.onlyBuiltDependenciesLine,
        ruleId: "SC3",
        message: "'onlyBuiltDependencies' must be an allowlist (empty array '[]' or array of package names)",
      },
    ];
  }
  return [];
}

function validateSC4(
  pkg: Record<string, unknown>,
  packageJsonContent: string,
): SupplyChainViolation[] {
  const packageManager = typeof pkg["packageManager"] === "string" ? pkg["packageManager"] : "";
  const pnpmMatch = /^pnpm@([^+\s]+)/.exec(packageManager);
  const expectedPnpmVersion = pnpmMatch?.[1];

  const engines = isRecord(pkg["engines"]) ? pkg["engines"] : undefined;
  const pnpmLine = findLineInText(packageJsonContent, /"pnpm"\s*:/)
    || findLineInText(packageJsonContent, /"engines"\s*:/);

  if (!expectedPnpmVersion) {
    return [
      {
        filename: "package.json",
        line: findLineInText(packageJsonContent, /"packageManager"\s*:/),
        ruleId: "SC4",
        message: `packageManager must declare 'pnpm@<version>' (found '${packageManager}')`,
      },
    ];
  }
  if (!engines || typeof engines["pnpm"] !== "string" || engines["pnpm"].trim() === "") {
    return [
      {
        filename: "package.json",
        line: pnpmLine,
        ruleId: "SC4",
        message: `package.json 'engines.pnpm' is missing; expected '${expectedPnpmVersion}' matching packageManager`,
      },
    ];
  }
  if (engines["pnpm"].trim() !== expectedPnpmVersion) {
    return [
      {
        filename: "package.json",
        line: pnpmLine,
        ruleId: "SC4",
        message: `package.json 'engines.pnpm' is '${engines["pnpm"]}'; expected '${expectedPnpmVersion}' matching packageManager`,
      },
    ];
  }
  return [];
}

function validateSC5(
  pkg: Record<string, unknown>,
  packageJsonContent: string,
): SupplyChainViolation[] {
  const engines = isRecord(pkg["engines"]) ? pkg["engines"] : undefined;
  const nodeLine = findLineInText(packageJsonContent, /"node"\s*:/)
    || findLineInText(packageJsonContent, /"engines"\s*:/);

  if (!engines || typeof engines["node"] !== "string" || engines["node"].trim() === "") {
    return [
      {
        filename: "package.json",
        line: nodeLine,
        ruleId: "SC5",
        message: "package.json 'engines.node' is missing; expected a range expression",
      },
    ];
  }
  const nodeVersion = engines["node"].trim();
  if (isBareExactVersion(nodeVersion)) {
    return [
      {
        filename: "package.json",
        line: nodeLine,
        ruleId: "SC5",
        message: `package.json 'engines.node' is a bare exact version ('${nodeVersion}'); expected a range expression`,
      },
    ];
  }
  return [];
}

function readOptionalFile(filePath: string): string | undefined {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : undefined;
}

export function checkSupplyChainControls(
  options: CheckSupplyChainOptions = {},
): SupplyChainViolation[] {
  const repoRoot = options.repoRoot ?? ".";
  const npmrcContent = options.npmrcContent ?? readOptionalFile(join(repoRoot, ".npmrc"));
  const workspaceContent = options.workspaceYamlContent
    ?? readOptionalFile(join(repoRoot, "pnpm-workspace.yaml"));
  const packageJsonContent = options.packageJsonContent
    ?? readOptionalFile(join(repoRoot, "package.json"));

  const workspaceInfo = workspaceContent !== undefined
    ? parseWorkspaceYaml(workspaceContent)
    : null;

  let pkg: Record<string, unknown> | null = null;
  if (packageJsonContent !== undefined) {
    try {
      const parsed: unknown = JSON.parse(packageJsonContent);
      if (isRecord(parsed)) {
        pkg = parsed;
      }
    } catch {
      // handled below
    }
  }

  const packageJsonViolations: SupplyChainViolation[] = [];
  if (packageJsonContent === undefined) {
    packageJsonViolations.push(
      { filename: "package.json", line: 1, ruleId: "SC4", message: "Missing package.json" },
      { filename: "package.json", line: 1, ruleId: "SC5", message: "Missing package.json" },
    );
  } else if (!pkg) {
    packageJsonViolations.push(
      { filename: "package.json", line: 1, ruleId: "SC4", message: "package.json is not valid JSON" },
      { filename: "package.json", line: 1, ruleId: "SC5", message: "package.json is not valid JSON" },
    );
  } else {
    packageJsonViolations.push(
      ...validateSC4(pkg, packageJsonContent),
      ...validateSC5(pkg, packageJsonContent),
    );
  }

  return [
    ...validateSC1(npmrcContent),
    ...validateSC2(workspaceInfo),
    ...validateSC3(workspaceInfo),
    ...packageJsonViolations,
  ];
}

const VALID_NPMRC = "engine-strict=true\nignore-scripts=true\n";
const VALID_WORKSPACE = `packages:
  - "packages/*"

# https://pnpm.io/11.x/settings/dependency-resolution#minimumreleaseage
minimumReleaseAge: 10080

# https://pnpm.io/11.x/settings/build#allowbuilds
onlyBuiltDependencies: []
`;
const VALID_PACKAGE_JSON = JSON.stringify(
  {
    name: "test-package",
    packageManager: "pnpm@11.17.0",
    engines: {
      node: ">=24.16.0 <25",
      pnpm: "11.17.0",
    },
  },
  null,
  2,
);

function testPositiveBaseline(): void {
  const violations = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: VALID_WORKSPACE,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (violations.length !== 0) {
    throw new Error(
      `self-test failed: positive baseline reported violations: ${JSON.stringify(violations)}`,
    );
  }
}

function testSC1(): void {
  const failFalse = checkSupplyChainControls({
    npmrcContent: "engine-strict=false\n",
    workspaceYamlContent: VALID_WORKSPACE,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (failFalse.length !== 1 || failFalse[0]?.ruleId !== "SC1") {
    throw new Error("self-test failed: SC1 negative (engine-strict=false) did not produce SC1 violation");
  }

  const failMissing = checkSupplyChainControls({
    npmrcContent: "save-exact=true\n",
    workspaceYamlContent: VALID_WORKSPACE,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (failMissing.length !== 1 || failMissing[0]?.ruleId !== "SC1") {
    throw new Error("self-test failed: SC1 negative (missing engine-strict) did not produce SC1 violation");
  }
}

function testSC2(): void {
  const failLow = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: `packages:\n  - "packages/*"\nminimumReleaseAge: 1000\nonlyBuiltDependencies: []\n`,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (failLow.length !== 1 || failLow[0]?.ruleId !== "SC2") {
    throw new Error("self-test failed: SC2 negative (value < 1440) did not produce SC2 violation");
  }

  const failMissing = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: `packages:\n  - "packages/*"\nonlyBuiltDependencies: []\n`,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (failMissing.length !== 1 || failMissing[0]?.ruleId !== "SC2") {
    throw new Error("self-test failed: SC2 negative (missing) did not produce SC2 violation");
  }

  const passBoundary = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: `packages:\n  - "packages/*"\nminimumReleaseAge: 1440\nonlyBuiltDependencies: []\n`,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (passBoundary.length !== 0) {
    throw new Error("self-test failed: SC2 boundary (1440) unexpectedly failed");
  }
}

function testSC3(): void {
  const failMissing = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: `packages:\n  - "packages/*"\nminimumReleaseAge: 10080\n`,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (failMissing.length !== 1 || failMissing[0]?.ruleId !== "SC3") {
    throw new Error("self-test failed: SC3 negative (missing onlyBuiltDependencies) did not produce SC3 violation");
  }

  const passEmpty = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: `packages:\n  - "packages/*"\nminimumReleaseAge: 10080\nonlyBuiltDependencies: []\n`,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (passEmpty.length !== 0) {
    throw new Error("self-test failed: SC3 empty allowlist unexpectedly failed");
  }

  const passNonEmpty = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: `packages:\n  - "packages/*"\nminimumReleaseAge: 10080\nonlyBuiltDependencies:\n  - dep-a\n`,
    packageJsonContent: VALID_PACKAGE_JSON,
  });
  if (passNonEmpty.length !== 0) {
    throw new Error("self-test failed: SC3 non-empty allowlist unexpectedly failed");
  }
}

function testSC4(): void {
  const failMismatch = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: VALID_WORKSPACE,
    packageJsonContent: JSON.stringify({
      packageManager: "pnpm@11.17.0",
      engines: { node: ">=24.16.0 <25", pnpm: "11.16.0" },
    }),
  });
  if (failMismatch.length !== 1 || failMismatch[0]?.ruleId !== "SC4") {
    throw new Error("self-test failed: SC4 negative (mismatched version) did not produce SC4 violation");
  }

  const failMissing = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: VALID_WORKSPACE,
    packageJsonContent: JSON.stringify({
      packageManager: "pnpm@11.17.0",
      engines: { node: ">=24.16.0 <25" },
    }),
  });
  if (failMissing.length !== 1 || failMissing[0]?.ruleId !== "SC4") {
    throw new Error("self-test failed: SC4 negative (missing engines.pnpm) did not produce SC4 violation");
  }
}

function testSC5(): void {
  const failBareExact = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: VALID_WORKSPACE,
    packageJsonContent: JSON.stringify({
      packageManager: "pnpm@11.17.0",
      engines: { node: "24.16.0", pnpm: "11.17.0" },
    }),
  });
  if (failBareExact.length !== 1 || failBareExact[0]?.ruleId !== "SC5") {
    throw new Error("self-test failed: SC5 negative (bare exact version '24.16.0') did not produce SC5 violation");
  }

  const failPrefixV = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: VALID_WORKSPACE,
    packageJsonContent: JSON.stringify({
      packageManager: "pnpm@11.17.0",
      engines: { node: "v24.16.0", pnpm: "11.17.0" },
    }),
  });
  if (failPrefixV.length !== 1 || failPrefixV[0]?.ruleId !== "SC5") {
    throw new Error("self-test failed: SC5 negative (bare exact version 'v24.16.0') did not produce SC5 violation");
  }

  const failMissing = checkSupplyChainControls({
    npmrcContent: VALID_NPMRC,
    workspaceYamlContent: VALID_WORKSPACE,
    packageJsonContent: JSON.stringify({
      packageManager: "pnpm@11.17.0",
      engines: { pnpm: "11.17.0" },
    }),
  });
  if (failMissing.length !== 1 || failMissing[0]?.ruleId !== "SC5") {
    throw new Error("self-test failed: SC5 negative (missing engines.node) did not produce SC5 violation");
  }
}

export function selfTest(): void {
  testPositiveBaseline();
  testSC1();
  testSC2();
  testSC3();
  testSC4();
  testSC5();
  console.log("check-supply-chain-controls: self-test passed");
}

function runCheck(repoRoot: string): void {
  try {
    const violations = checkSupplyChainControls({ repoRoot });
    if (violations.length > 0) {
      console.error("check-supply-chain-controls: FAIL");
      for (const v of violations) {
        console.error(`${v.filename}:${String(v.line)}: ${v.ruleId} ${v.message}`);
      }
      process.exitCode = 1;
    } else {
      console.log("check-supply-chain-controls: ok -- supply-chain controls SC1-SC5 pass");
    }
  } catch (error) {
    console.error(
      `check-supply-chain-controls: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 2;
  }
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    try {
      selfTest();
    } catch (error) {
      console.error(
        `check-supply-chain-controls: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
    return;
  }
  const pathArg = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const repoRoot = pathArg
    ? resolve(process.cwd(), pathArg)
    : join(dirname(fileURLToPath(import.meta.url)), "..");
  runCheck(repoRoot);
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  main();
}
