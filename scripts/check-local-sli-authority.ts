#!/usr/bin/env node
/** Enforce sibling PRIORITIES.md as the only local SLI/SLO table surface (repo-template#326). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import process from "node:process";

export type LocalSliRule = "LS1" | "LS2" | "LS3";

export interface LocalSliViolation {
  readonly rule: LocalSliRule;
  readonly file: "PRIORITIES.md" | "AGENTS.md";
  readonly line: number;
  readonly message: string;
}

const REQUIRED_HEADER = [
  "id",
  "binds principle",
  "sli (how observed here)",
  "slo (target)",
  "status",
] as const;

function visibleLines(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/u);
  let fence: { char: "`" | "~"; length: number } | null = null;
  return lines.map((line) => {
    const trimmed = line.trimStart();
    const match = /^(`{3,}|~{3,})/u.exec(trimmed);
    if (fence !== null) {
      if (match?.[1]?.[0] === fence.char && match[1].length >= fence.length) fence = null;
      return "";
    }
    if (match?.[1]) {
      fence = { char: match[1][0] as "`" | "~", length: match[1].length };
      return "";
    }
    return line;
  });
}

function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells !== null && cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function isTableHeader(lines: readonly string[], index: number): boolean {
  return tableCells(lines[index] ?? "") !== null && isSeparator(lines[index + 1] ?? "");
}

export function checkLocalSliAuthority(priorities: string, agents: string): LocalSliViolation[] {
  const violations: LocalSliViolation[] = [];
  const priorityLines = visibleLines(priorities);
  const headingIndex = priorityLines.findIndex((line) => /^##\s+Local SLI \/ SLO\s*$/u.test(line));

  if (headingIndex < 0) {
    violations.push({
      rule: "LS1",
      file: "PRIORITIES.md",
      line: 1,
      message: "LS1 PRIORITIES.md must contain '## Local SLI / SLO'",
    });
  } else {
    let validHeader = false;
    for (let index = headingIndex + 1; index < priorityLines.length - 1; index += 1) {
      if (/^##\s+/u.test(priorityLines[index] ?? "")) break;
      if (!isTableHeader(priorityLines, index)) continue;
      const normalized = (tableCells(priorityLines[index] ?? "") ?? []).map((cell) => cell.toLowerCase());
      validHeader = REQUIRED_HEADER.every((required) => normalized.includes(required));
      break;
    }
    if (!validHeader) {
      violations.push({
        rule: "LS2",
        file: "PRIORITIES.md",
        line: headingIndex + 1,
        message: "LS2 Local SLI / SLO must be followed by a table with ID, Binds principle, SLI (how observed here), SLO (target), Status",
      });
    }
  }

  const agentLines = visibleLines(agents);
  for (let index = 0; index < agentLines.length - 1; index += 1) {
    if (!isTableHeader(agentLines, index)) continue;
    const cells = tableCells(agentLines[index] ?? "") ?? [];
    const hasSli = cells.some((cell) => /^SLI\b/iu.test(cell));
    const hasSlo = cells.some((cell) => /^SLO\b/iu.test(cell));
    if (hasSli && hasSlo) {
      violations.push({
        rule: "LS3",
        file: "AGENTS.md",
        line: index + 1,
        message: `LS3 fleet NORMS.md assigns local SLI/SLO rows to sibling PRIORITIES.md`,
      });
    }
  }

  return violations;
}

function runSelfTest(): void {
  const validPriorities = `# Priorities\n\n## Local SLI / SLO\n\n| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |\n|---|---|---|---|---|\n| x | P1 | count | 1 | active |\n`;
  assert.deepEqual(checkLocalSliAuthority(validPriorities, "SLI is discussed in prose only."), []);

  const missingHeading = validPriorities.replace("## Local SLI / SLO", "## Metrics");
  assert.ok(checkLocalSliAuthority(missingHeading, "").some(({ rule }) => rule === "LS1"));

  const missingColumn = validPriorities.replace(" | Status |", " |");
  assert.ok(checkLocalSliAuthority(missingColumn, "").some(({ rule }) => rule === "LS2"));

  const agentsTable = `| Name | SLI value | SLO target |\n|---|---|---|\n| x | y | z |`;
  const ls3 = checkLocalSliAuthority(validPriorities, agentsTable);
  assert.equal(ls3[0]?.rule, "LS3");
  assert.equal(ls3[0]?.line, 1);

  assert.deepEqual(checkLocalSliAuthority(validPriorities, "The SLI is described here, without a table."), []);
  assert.deepEqual(
    checkLocalSliAuthority(validPriorities, "```md\n| SLI | SLO |\n|---|---|\n| x | y |\n```"),
    [],
  );
  process.stdout.write("check-local-sli-authority self-test: ok\n");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const violations = checkLocalSliAuthority(
    readFileSync("PRIORITIES.md", "utf8"),
    readFileSync("AGENTS.md", "utf8"),
  );
  for (const violation of violations) {
    process.stderr.write(`${violation.file}:${String(violation.line)}: ${violation.message}\n`);
  }
  if (violations.length > 0) process.exitCode = 1;
}

main();
