#!/usr/bin/env node
/**
 * Guard the account-wide issue-intake SSOT.
 *
 * Normal fleet repositories MUST NOT define repo-local issue templates: any valid
 * .github/ISSUE_TEMPLATE entry suppresses the defaults inherited from the public
 * spencer-shadley/.github repository. repo-template therefore guards absence
 * instead of copying or validating a local task.md.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const issueTemplateDir = path.join(root, ".github", "ISSUE_TEMPLATE");

const entries = existsSync(issueTemplateDir)
  ? readdirSync(issueTemplateDir).filter((name) => !name.startsWith("."))
  : [];

if (entries.length > 0) {
  console.error(
    [
      "issue-template-intake: FAIL — repo-local issue-template overrides are forbidden",
      `  directory: ${issueTemplateDir}`,
      `  entries: ${entries.join(", ")}`,
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
