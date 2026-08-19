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

const qualityPath = join(root, "eslint.quality.mjs");
if (!existsSync(qualityPath)) {
  errors.push("missing eslint.quality.mjs (copy from repo-template; docs/QUALITY-LINT.md)");
} else {
  const body = read(qualityPath);
  if (!body.includes("export function qualityRules") && !body.includes("qualityRules")) {
    errors.push("eslint.quality.mjs does not export qualityRules()");
  }
  if (!body.includes("max-lines") && !body.includes("maxLines")) {
    errors.push("eslint.quality.mjs missing max-lines / small-file ceilings");
  }
  if (!body.includes("prefer-typescript") && !body.includes("preferTypeScriptRule")) {
    errors.push("eslint.quality.mjs missing fleet/prefer-typescript rule");
  }
  if (!body.includes("QUALITY_LINT_GATE_ID") && !body.includes("repo-template/quality-lint")) {
    // soft: older copies ok if qualityRules present
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
    "missing eslint.config.mjs (or .js) that imports qualityRules from ./eslint.quality.mjs",
  );
} else {
  const cfg = read(configPath);
  if (!cfg.includes("qualityRules") || !cfg.includes("eslint.quality")) {
    errors.push(
      `${configPath.replace(root + "\\", "").replace(root + "/", "")} must import and spread qualityRules() from eslint.quality.mjs`,
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
  const dev = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
  const need = ["eslint", "eslint-plugin-sonarjs", "eslint-plugin-unicorn"];
  for (const dep of need) {
    if (!dev[dep]) {
      errors.push(`missing devDependency ${dep} (see docs/QUALITY-LINT.md)`);
    }
  }
}

if (process.argv.includes("--self-test")) {
  // In-template: quality files must exist for the gate to be shippable
  if (!existsSync(qualityPath)) {
    console.error("verify-quality-lint-required self-test: eslint.quality.mjs must ship in template");
    process.exit(2);
  }
  console.log("verify-quality-lint-required: self-test ok (artifact present)");
  process.exit(0);
}

if (errors.length) {
  console.error("verify-quality-lint-required: FAIL — quality lint bootstrap incomplete:");
  for (const e of errors) console.error(`  - ${e}`);
  console.error("See docs/QUALITY-LINT.md");
  process.exit(1);
}

console.log("verify-quality-lint-required: ok — quality lint present and wired");
