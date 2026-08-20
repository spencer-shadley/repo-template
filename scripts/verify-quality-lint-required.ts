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
const localFactoryPath = join(root, "eslint.quality.mjs");
const templateRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = join(templateRoot, "packages", "repo-quality");
const isKitPackage = root === kitRoot;
const isTemplateRepository = root === templateRoot;

const localKnipConfigPath = join(root, "knip.json");
if (!isKitPackage && existsSync(localKnipConfigPath)) {
  const localKnipConfig = read(localKnipConfigPath);
  const cyclesMatch = localKnipConfig.match(/"cycles"\s*:\s*"([^"]+)"/);
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
    const localJscpdConfig = JSON.parse(read(localJscpdConfigPath)) as Record<string, unknown>;
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
    `missing eslint.config.mjs (or .js) that imports qualityRules from ${kitName}`,
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
  const pkg = JSON.parse(read(pkgPath)) as {
    readonly scripts?: Record<string, string>;
    readonly devDependencies?: Record<string, string>;
    readonly dependencies?: Record<string, string>;
  };
  const scripts = pkg.scripts || {};
  const lintScript = String(scripts["lint"] || "");
  const verifyScript = String(scripts["verify"] || scripts["verify:self"] || "");
  const verifySelfScript = String(scripts["verify:self"] || "");
  const knipScript = String(scripts["knip"] || "");
  const jscpdScript = String(scripts["dup"] || "");
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
  if (!verifyScript.includes("knip")) {
    errors.push("package.json verify must run the kit Knip wrapper");
  }
  if (!verifyScript.includes("dup")) {
    errors.push("package.json verify must run the kit jscpd wrapper");
  }
  if (isTemplateRepository && !verifySelfScript.includes("knip")) {
    errors.push("template package.json verify:self must run the kit Knip wrapper");
  }
  if (isTemplateRepository && !verifySelfScript.includes("dup")) {
    errors.push("template package.json verify:self must run the kit jscpd wrapper");
  }
  const dev = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
  const kitDependency = dev[kitName];
  if (!kitDependency) {
    errors.push(`missing dependency ${kitName} (see docs/QUALITY-LINT.md)`);
  } else if (kitDependency === "workspace:*" && !isTemplateRepository) {
    errors.push(`${kitName} may use workspace:* only in the repo-template workspace`);
  }
}

if (process.argv.includes("--self-test")) {
  const kitPackagePath = join(kitRoot, "package.json");
  const templateConfigPath = join(templateRoot, "eslint.config.mjs");
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
    !existsSync(templateConfigPath) || !read(templateConfigPath).includes(kitName)
      ? `eslint.config.mjs must import from ${kitName}`
      : undefined,
    existsSync(join(templateRoot, "eslint.quality.mjs"))
      ? "template root must not ship a copied eslint.quality.mjs factory"
      : undefined,
    disablesNoInlineConfig("linterOptions: { noInlineConfig: false }")
      ? undefined
      : "self-test must detect a noInlineConfig opt-out",
  ].filter((error): error is string => error !== undefined);
  if (selfTestErrors.length > 0) {
    console.error("verify-quality-lint-required self-test: FAIL");
    for (const error of selfTestErrors) console.error(`  - ${error}`);
    process.exit(2);
  }
  console.log("verify-quality-lint-required: self-test ok (kit ESLint + Knip + jscpd paths present)");
  process.exit(0);
}

if (errors.length) {
  console.error("verify-quality-lint-required: FAIL — quality lint bootstrap incomplete:");
  for (const e of errors) console.error(`  - ${e}`);
  console.error("See docs/QUALITY-LINT.md");
  process.exit(1);
}

console.log("verify-quality-lint-required: ok — quality lint present and wired");
