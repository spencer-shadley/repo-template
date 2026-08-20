#!/usr/bin/env node
/**
 * Fail when .github/ISSUE_TEMPLATE/task.md no longer scaffolds governed-intake-body-v1.
 * Invoked by `npm run verify` (AO#1645 recurrence guard).
 *
 * Contract mirrors cli-wrappers `validateIssueTemplateForIntake` / `check issue-template-intake`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, ".github", "ISSUE_TEMPLATE", "task.md");

const REQUIRED_HEADINGS = [
  "Work type",
  "What happened or what is needed?",
  "Initial priority guess",
  "Why this initial priority?",
  "Relevant details",
  "Root-cause taxonomy and disposition",
  "Durable fix and acceptance",
  "Human-decision state",
] as const;
const TAXONOMY_RANKS = ["Subspecies", "Species", "Genus", "Family", "Phylum"] as const;

interface ValidateResult {
  readonly ok: boolean;
  readonly missing?: readonly string[];
  readonly schemaVersion: string;
}

function escapeRegExp(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function stripFrontmatter(markdown: string): string {
  const text = String(markdown || "").replaceAll("\r\n", "\n").replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return text;
  return text.slice(end + "\n---\n".length);
}

function validateProvenance(text: string, missing: string[]): void {
  const hasRepo = /(?:^|\n)\s*(?:[-*]\s+)?(?:\*\*)?repository(?:\*\*)?\s*:/i.test(text);
  const hasCommit = /(?:^|\n)\s*(?:[-*]\s+)?(?:\*\*)?commit(?:\*\*)?\s*:/i.test(text);
  const hasPath =
    /(?:^|\n)\s*(?:[-*]\s+)?(?:\*\*)?path(?:\*\*)?\s*:.*\.github\/ISSUE_TEMPLATE\//i.test(text)
    || /ISSUE_TEMPLATE\/task\.(md|ya?ml)/i.test(text);
  if (!(hasRepo && hasCommit && hasPath)) {
    missing.push("template provenance scaffold (repository, commit, path)");
  }
}

function extractTaxonomySection(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^##\s+Root-cause taxonomy and disposition\s*$/i.test(l));
  if (start === -1) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && /^##\s+/.test(line)) break;
    out.push(line ?? "");
  }
  return out.join("\n");
}

function validateTaxonomySection(text: string, missing: string[]): void {
  const section = extractTaxonomySection(text);
  if (!/\|/.test(section)) {
    missing.push("Root-cause taxonomy table");
    return;
  }
  for (const rank of TAXONOMY_RANKS) {
    if (!new RegExp(String.raw`\|\s*` + escapeRegExp(rank) + String.raw`\s*\|`, "i").test(section)) {
      missing.push(`taxonomy rank row: ${rank}`);
    }
  }
}

function validate(templateMarkdown: string): ValidateResult {
  const text = stripFrontmatter(templateMarkdown);
  const missing: string[] = [];
  for (const h of REQUIRED_HEADINGS) {
    if (!new RegExp(String.raw`^##\s+` + escapeRegExp(h) + String.raw`\s*$`, "im").test(text)) {
      missing.push(`## ${h}`);
    }
  }
  validateProvenance(text, missing);
  validateTaxonomySection(text, missing);
  return missing.length
    ? { ok: false, missing, schemaVersion: "governed-intake-body-v1" }
    : { ok: true, schemaVersion: "governed-intake-body-v1" };
}

if (!existsSync(templatePath)) {
  console.error(`issue-template-intake: missing ${templatePath}`);
  process.exit(2);
}
const result = validate(readFileSync(templatePath, "utf8"));
if (!result.ok) {
  console.error(
    `issue-template-intake: FAIL ${templatePath}\n  missing: ${(result.missing ?? []).join(", ")}\n  schema: ${result.schemaVersion}`,
  );
  process.exit(1);
}
console.log(`issue-template-intake: ok ${templatePath} (${result.schemaVersion})`);
process.exit(0);
