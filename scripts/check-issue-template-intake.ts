#!/usr/bin/env node
/**
 * Guard the account-wide issue-intake SSOT.
 *
 * Normal fleet repositories MUST NOT define repo-local issue templates: any valid
 * .github/ISSUE_TEMPLATE entry suppresses the defaults inherited from the public
 * spencer-shadley/.github repository. repo-template therefore guards absence
 * instead of copying or validating a local task.md.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { isIssueTemplateOverride } from "../packages/adoption-shell/src/path-policy.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const issueTemplateDir = path.join(root, ".github", "ISSUE_TEMPLATE");
const failures: string[] = [];

if (existsSync(issueTemplateDir)) {
  failures.push(`working tree contains forbidden local override path: ${issueTemplateDir}`);
}

const manifestRaw: unknown = JSON.parse(
  readFileSync(path.join(root, "template-manifest.json"), "utf8"),
);
if (manifestRaw === null || typeof manifestRaw !== "object" || Array.isArray(manifestRaw)) {
  failures.push("template-manifest.json must contain an object");
} else {
  const overlayKeys = Object.keys(manifestRaw).filter((key) => isIssueTemplateOverride(key));
  if (overlayKeys.length > 0) {
    failures.push(
      `template-manifest.json overlays local issue-template path(s): ${overlayKeys.join(", ")}`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    [
      "issue-template-intake: FAIL — repo-local issue-template overrides are forbidden",
      ...failures.map((row) => `  ${row}`),
      "  source: https://github.com/spencer-shadley/.github/tree/main/.github/ISSUE_TEMPLATE",
      "  rationale: local templates suppress account-wide defaults",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  "issue-template-intake: ok — no local override; GitHub inherits spencer-shadley/.github defaults",
);
process.exit(0);
