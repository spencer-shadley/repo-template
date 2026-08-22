#!/usr/bin/env node
// @stack-waiver id=bootstrap-verifier reason="Bootstrap verifier for template adoption"
/**
 * Fail closed if a repository has not bootstrapped the fleet quality lint gate.
 * Used by repo-template self-verify and recommended as a consumer bootstrap check.
 *
 * Exit 0 = present and wired; 1 = missing; 2 = usage/config error.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const pathArg = process.argv.slice(2).find((a) => !a.startsWith("-"));
const root = pathArg
  ? join(process.cwd(), pathArg)
  : join(dirname(fileURLToPath(import.meta.url)), "..");

const errors: string[] = [];

function read(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function disablesNoInlineConfig(config: string): boolean {
  return /\bnoInlineConfig\s*:\s*false\b/.test(config);
}

function hasTrackedIssue(text: string): boolean {
  return /https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/issues\/\d+/.test(text);
}

const kitName = "@spencer-shadley/repo-quality";
const kitKnipPath = `${kitName}/knip.mjs`;
const kitJscpdPath = `${kitName}/jscpd.mjs`;
const kitSecretScanPath = `${kitName}/secret-scan.mjs`;
const localFactoryPath = join(root, "eslint.quality.mjs");
const templateRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = join(templateRoot, "packages", "repo-quality");
const isKitPackage = root === kitRoot;
const isTemplateRepository = root === templateRoot;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonRecord(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(read(filePath));
  if (!isRecord(parsed)) throw new Error(`${filePath} must contain a JSON object`);
  return parsed;
}

function globMatches(pattern: string, value: string): boolean {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
    }
  }
  return new RegExp(`${source}$`, "u").test(value);
}

function hasBlockingLintCommand(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).some((command) =>
    isRecord(command)
    && command["executable"] === "pnpm"
    && Array.isArray(command["args"])
    && command["args"].length === 1
    && command["args"][0] === "lint"
    && command["failureDisposition"] === "fail-gate",
  );
}

function canonicalQualityLintClass(): Record<string, unknown> | undefined {
  const declarationPath = isTemplateRepository
    ? join(kitRoot, "quality-lint-simple-diff.json")
    : join(root, "node_modules", "@spencer-shadley", "repo-quality", "quality-lint-simple-diff.json");
  if (!existsSync(declarationPath)) return undefined;
  try {
    const declaration = readJsonRecord(declarationPath);
    const candidate = declaration["quality-lint"];
    return isRecord(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function isUsableQualityLintClass(value: Record<string, unknown> | undefined): boolean {
  const paths = value?.["paths"];
  return value !== undefined
    && Array.isArray(paths)
    && paths.length > 0
    && paths.every((path) => typeof path === "string")
    && hasBlockingLintCommand(value["commands"]);
}

function readSimpleDiff(): Record<string, unknown> | undefined {
  const localCiPath = join(root, "local-ci.json");
  if (!existsSync(localCiPath)) return undefined;
  try {
    const localCi = readJsonRecord(localCiPath);
    return isRecord(localCi["simpleDiff"]) ? localCi["simpleDiff"] : undefined;
  } catch {
    return undefined;
  }
}

function coversQualityLint(simpleDiff: Record<string, unknown>): boolean {
  const representativePaths = [
    "eslint.config.ts",
    "eslint.quality.mjs",
    "eslint-suppressions.json",
    "package.json",
    "pnpm-lock.yaml",
    "package-lock.json",
    "docs/QUALITY-LINT.md",
    "scripts/verify-quality-lint-required.ts",
  ];
  return Object.values(simpleDiff).some((candidate) => {
    if (!isRecord(candidate) || !Array.isArray(candidate["paths"])) return false;
    const patterns = candidate["paths"].filter((path): path is string => typeof path === "string");
    return hasBlockingLintCommand(candidate["commands"])
      && representativePaths.every((path) => patterns.some((pattern) => globMatches(pattern, path)));
  });
}

function qualityLintSimpleDiffErrors(): string[] {
  if (isKitPackage) return [];
  const canonicalClass = canonicalQualityLintClass();
  if (
    !isUsableQualityLintClass(canonicalClass)
  ) {
    return [`${kitName}/quality-lint-simple-diff.json must declare blocking quality-lint paths and pnpm lint`];
  }
  const simpleDiff = readSimpleDiff();
  if (!simpleDiff) return ["local-ci.json must declare simpleDiff.quality-lint or a covering superset"];
  if (!coversQualityLint(simpleDiff)) {
    return ["local-ci.json must declare blocking simpleDiff.quality-lint or a covering superset"];
  }
  if (
    isTemplateRepository
    && JSON.stringify(simpleDiff["quality-lint"]) !== JSON.stringify(canonicalClass)
  ) {
    return ["template local-ci.json quality-lint must exactly project the repo-quality declaration"];
  }
  return [];
}

const localKnipConfigPath = join(root, "knip.json");
if (!isKitPackage && existsSync(localKnipConfigPath)) {
  const localKnipConfig = read(localKnipConfigPath);
  const cyclesMatch = /"cycles"\s*:\s*"([^"]+)"/.exec(localKnipConfig);
  if (cyclesMatch?.[1] === "error") {
    errors.push(
      "knip.json copies the cycles policy; invoke the repo-quality Knip wrapper instead of vendoring kit policy",
    );
  } else if (cyclesMatch && !hasTrackedIssue(localKnipConfig)) {
    errors.push(
      "knip.json changes rules.cycles without a tracked GitHub issue URL; the repo-quality wrapper requires cycles:error",
    );
  }
}

const localJscpdConfigPath = join(root, ".jscpd.json");
if (!isKitPackage && existsSync(localJscpdConfigPath)) {
  try {
    const localJscpdConfig = readJsonRecord(localJscpdConfigPath);
    const minLines = localJscpdConfig["minLines"];
    const minTokens = localJscpdConfig["minTokens"];
    const hasFailThreshold = Object.hasOwn(localJscpdConfig, "threshold");
    const hasIssue = hasTrackedIssue(read(localJscpdConfigPath));
    if (typeof minLines === "number" && minLines < 10) {
      errors.push(".jscpd.json lowers minLines below the kit policy minimum of 10");
    }
    if (typeof minTokens === "number" && minTokens < 100) {
      errors.push(".jscpd.json lowers minTokens below the kit policy minimum of 100");
    }
    if (hasFailThreshold && !hasIssue) {
      errors.push(".jscpd.json adds a fail threshold without a tracked GitHub issue URL");
    }
  } catch {
    errors.push(".jscpd.json must be valid JSON when present");
  }
}

const localBetterleaksConfigPath = join(root, ".betterleaks.toml");
const hasUntrackedBetterleaksConfig =
  !isKitPackage &&
  existsSync(localBetterleaksConfigPath) &&
  !hasTrackedIssue(read(localBetterleaksConfigPath));
if (hasUntrackedBetterleaksConfig) {
  errors.push(
    ".betterleaks.toml may add only repo-specific allowlist entries with a tracked GitHub issue URL; Betterleaks defaults and the kit wrapper remain the policy source of truth",
  );
}

if (!isKitPackage && existsSync(localFactoryPath)) {
  const body = read(localFactoryPath);
  if (body.includes("export function qualityRules")) {
    errors.push(
      "local eslint.quality.mjs exports qualityRules(); depend on @spencer-shadley/repo-quality instead of copying the factory",
    );
  }
}

const configCandidates = [
  "eslint.config.mjs",
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.ts",
];
const configPath = configCandidates.map((n) => join(root, n)).find((p) => existsSync(p));
if (!configPath) {
  errors.push(
    `missing eslint.config.ts (or .mjs/.js) that imports qualityRules from ${kitName}`,
  );
} else {
  const cfg = read(configPath);
  if (!cfg.includes("qualityRules") || !cfg.includes(kitName)) {
    errors.push(
      `${configPath.replace(root + "\\", "").replace(root + "/", "")} must import and spread qualityRules() from ${kitName}`,
    );
  }
  if (disablesNoInlineConfig(cfg)) {
    errors.push(
      `${configPath.replace(root + "\\", "").replace(root + "/", "")} sets linterOptions.noInlineConfig: false; the fleet quality kit requires inline ESLint configuration to stay disabled`,
    );
  }
}

const pkgPath = join(root, "package.json");
if (!existsSync(pkgPath)) {
  errors.push("missing package.json");
} else {
  const pkg = readJsonRecord(pkgPath);
  const scripts = isRecord(pkg["scripts"]) ? pkg["scripts"] : {};
  const script = (name: string): string => typeof scripts[name] === "string" ? scripts[name] : "";
  const lintScript = script("lint");
  const verifyScript = script("verify") || script("verify:self");
  const verifySelfScript = script("verify:self");
  const knipScript = script("knip");
  const jscpdScript = script("dup");
  const secretDirScript = script("secret:dir");
  const directDev = isRecord(pkg["devDependencies"]) ? pkg["devDependencies"] : {};
  const dependencies = isRecord(pkg["dependencies"]) ? pkg["dependencies"] : {};
  const dev = { ...directDev, ...dependencies };
  if (!lintScript.includes("eslint") && !verifyScript.includes("eslint")) {
    errors.push(
      'package.json scripts must run eslint (e.g. "lint": "eslint ." and verify must call lint)',
    );
  }
  if (verifyScript && !verifyScript.includes("lint") && !verifyScript.includes("eslint")) {
    errors.push(
      "package.json verify (or verify:self) should run lint so quality gate is land-blocking",
    );
  }
  if (!knipScript.includes(kitKnipPath)) {
    errors.push(
      `package.json "knip" must invoke ${kitKnipPath}; the kit wrapper runs both knip and knip --strict`,
    );
  }
  if (!jscpdScript.includes(kitJscpdPath)) {
    errors.push(
      `package.json "dup" must invoke ${kitJscpdPath}; the kit owns advisory jscpd policy`,
    );
  }
  if (!secretDirScript.includes(kitSecretScanPath)) {
    errors.push(
      `package.json "secret:dir" must invoke ${kitSecretScanPath}; the kit owns the Betterleaks scan recipe`,
    );
  }
  if (!dev["eslint"]) {
    errors.push("missing direct eslint dependency required to run the blocking lint script under pnpm");
  }
  if (!verifyScript.includes("knip")) {
    errors.push("package.json verify must run the kit Knip wrapper");
  }
  if (!verifyScript.includes("dup")) {
    errors.push("package.json verify must run the kit jscpd wrapper");
  }
  if (!verifyScript.includes("secret:dir")) {
    errors.push("package.json verify must run the kit Betterleaks dir wrapper");
  }
  if (!verifyScript.includes("verify-quality-lint-required")) {
    errors.push("package.json verify must run verify-quality-lint-required so missing simpleDiff classes fail closed");
  }
  if (isTemplateRepository && !verifySelfScript.includes("knip")) {
    errors.push("template package.json verify:self must run the kit Knip wrapper");
  }
  if (isTemplateRepository && !verifySelfScript.includes("dup")) {
    errors.push("template package.json verify:self must run the kit jscpd wrapper");
  }
  const kitDependency = dev[kitName];
  if (!kitDependency) {
    errors.push(`missing dependency ${kitName} (see docs/QUALITY-LINT.md)`);
  } else if (kitDependency === "workspace:*" && !isTemplateRepository) {
    errors.push(`${kitName} may use workspace:* only in the repo-template workspace`);
  }
}

errors.push(...qualityLintSimpleDiffErrors());

if (process.argv.includes("--self-test")) {
  const kitPackagePath = join(kitRoot, "package.json");
  const templateConfigPath = join(templateRoot, "eslint.config.ts");
  const selfTestErrors = [
    !existsSync(kitPackagePath)
      ? "packages/repo-quality/package.json must ship in template"
      : undefined,
    !existsSync(join(kitRoot, "index.mjs"))
      ? "packages/repo-quality/index.mjs must ship in template"
      : undefined,
    !existsSync(join(kitRoot, "knip.mjs")) || !existsSync(join(kitRoot, "knip.json"))
      ? "packages/repo-quality must ship the Knip wrapper and config"
      : undefined,
    !existsSync(join(kitRoot, "jscpd.mjs")) || !existsSync(join(kitRoot, "jscpd.json"))
      ? "packages/repo-quality must ship the jscpd wrapper and config"
      : undefined,
    !existsSync(join(kitRoot, "secret-scan.mjs"))
      ? "packages/repo-quality must ship the Betterleaks secret-scan wrapper"
      : undefined,
    !existsSync(templateConfigPath) || !read(templateConfigPath).includes(kitName)
      ? `eslint.config.ts must import from ${kitName}`
      : undefined,
    existsSync(join(templateRoot, "eslint.quality.mjs"))
      ? "template root must not ship a copied eslint.quality.mjs factory"
      : undefined,
    disablesNoInlineConfig("linterOptions: { noInlineConfig: false }")
      ? undefined
      : "self-test must detect a noInlineConfig opt-out",
    ...qualityLintSimpleDiffErrors(),
  ].filter((error): error is string => error !== undefined);
  if (selfTestErrors.length > 0) {
    console.error("verify-quality-lint-required self-test: FAIL");
    for (const error of selfTestErrors) console.error(`  - ${error}`);
    process.exit(2);
  }
  console.log("verify-quality-lint-required: self-test ok (kit ESLint + Knip + jscpd + Betterleaks paths present)");
  process.exit(0);
}

if (errors.length) {
  console.error("verify-quality-lint-required: FAIL — quality lint bootstrap incomplete:");
  for (const e of errors) console.error(`  - ${e}`);
  console.error("See docs/QUALITY-LINT.md");
  process.exit(1);
}

console.log("verify-quality-lint-required: ok — quality lint present and wired");
