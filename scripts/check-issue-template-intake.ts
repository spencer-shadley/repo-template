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
const TAXONOMY_RANKS = [
  "Subspecies",
  "Species",
  "Genus",
  "Family",
  "Order",
  "Class",
  "Phylum",
  "Kingdom",
  "Domain",
] as const;
const CAUSAL_CLIMB_COLUMNS = ["Rank", "Finding", "Disposition", "Reified as"] as const;
const PREVENTION_HEADING = "Prevention — never again";
const DETECT_HEADING = "Detect / self-heal / recover — if it still happens";
const PREVENTION_COLUMNS = ["Rank", "Preventive control", "Status"] as const;
const DETECT_COLUMNS = [
  "Rank",
  "Notice",
  "Self-heal / contain",
  "Restore",
  "Escalate if no progress",
  "Status",
] as const;
const STATUS_TOKENS = [
  "landed",
  "assigned-issue",
  "already-owned",
  "inherited",
  "N/A",
  "evidence-ceiling",
  "TBD — triage",
] as const;

interface ValidateResult {
  readonly ok: boolean;
  readonly missing?: readonly string[];
  readonly schemaVersion: string;
}

function escapeRegExp(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function stripFrontmatter(markdown: string): string {
  const text = markdown.replaceAll("\r\n", "\n").replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return text;
  return text.slice(end + "\n---\n".length);
}

function provenanceValue(line: string, field: string): string | undefined {
  const withoutBullet = line.trimStart().replace(/^(?:[-*])\s+/, "");
  const withoutBold = withoutBullet.startsWith("**") ? withoutBullet.slice(2) : withoutBullet;
  if (!withoutBold.toLowerCase().startsWith(field)) return undefined;
  let remaining = withoutBold.slice(field.length);
  if (remaining.startsWith("**")) remaining = remaining.slice(2);
  if (!remaining.trimStart().startsWith(":")) return undefined;
  return remaining.slice(remaining.indexOf(":") + 1);
}

function validateProvenance(text: string, missing: string[]): void {
  const lines = text.split("\n");
  const hasRepo = lines.some((line) => provenanceValue(line, "repository") !== undefined);
  const hasCommit = lines.some((line) => provenanceValue(line, "commit") !== undefined);
  const pathValue = lines.map((line) => provenanceValue(line, "path")).find(Boolean);
  const lowerText = text.toLowerCase();
  const hasPath = pathValue?.toLowerCase().includes(".github/issue_template/") === true
    || lowerText.includes("issue_template/task.md")
    || lowerText.includes("issue_template/task.yaml")
    || lowerText.includes("issue_template/task.yml");
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
  const causalHeader = `| ${CAUSAL_CLIMB_COLUMNS.join(" | ")} |`;
  if (!section.includes(causalHeader)) {
    missing.push(`causal climb columns: ${CAUSAL_CLIMB_COLUMNS.join(", ")}`);
  }
  if (section.includes("| Fix or next action |")) {
    missing.push("causal climb still uses Fix or next action; use Defect ladders A and B");
  }
  if (!section.includes(PREVENTION_HEADING)) {
    missing.push(`Defect ladder A: ${PREVENTION_HEADING}`);
  }
  if (!section.includes(DETECT_HEADING)) {
    missing.push(`Defect ladder B: ${DETECT_HEADING}`);
  }
  const preventionHeader = `| ${PREVENTION_COLUMNS.join(" | ")} |`;
  const detectHeader = `| ${DETECT_COLUMNS.join(" | ")} |`;
  if (!section.includes(preventionHeader)) {
    missing.push(`prevention columns: ${PREVENTION_COLUMNS.join(", ")}`);
  }
  if (!section.includes(detectHeader)) {
    missing.push(`detect/heal/recover columns: ${DETECT_COLUMNS.join(", ")}`);
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
  for (const token of STATUS_TOKENS) {
    if (!text.includes("`" + token + "`")) {
      missing.push(`status token: ${token}`);
    }
  }
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
