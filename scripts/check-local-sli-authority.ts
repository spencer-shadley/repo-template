#!/usr/bin/env node
/** Enforce sibling PRIORITIES.md as the only local SLI/SLO table surface (repo-template#326, #110). */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import {
  parsePrioritiesLocalSliTable,
  validateProductSliProbeContractV1,
} from "../packages/adoption-shell/src/product-sli-probe-v1.ts";

export type LocalSliRule = "LS1" | "LS2" | "LS3" | "LS4" | "LS5" | "LS6" | "LS7";

export interface LocalSliViolation {
  readonly rule: LocalSliRule;
  readonly file: "PRIORITIES.md" | "AGENTS.md" | "product-sli.json";
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
  let fence: { char: string; length: number } | null = null;
  return lines.map((line) => {
    const trimmed = line.trimStart();
    const match = /^(`{3,}|~{3,})/u.exec(trimmed);
    if (fence !== null) {
      if (match?.[1]?.[0] === fence.char && match[1].length >= fence.length) fence = null;
      return "";
    }
    if (match?.[1]) {
      fence = { char: match[1][0] ?? "`", length: match[1].length };
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

function checkPrioritiesSurface(priorityLines: readonly string[]): LocalSliViolation[] {
  const violations: LocalSliViolation[] = [];
  const headingIndex = priorityLines.findIndex((line) => /^##\s+Local SLI \/ SLO\s*$/u.test(line));

  if (headingIndex < 0) {
    violations.push({
      rule: "LS1",
      file: "PRIORITIES.md",
      line: 1,
      message: "LS1 PRIORITIES.md must contain '## Local SLI / SLO'",
    });
    return violations;
  }

  let validHeader = false;
  for (let index = headingIndex + 1; index < priorityLines.length - 1; index += 1) {
    if (/^##\s+/u.test(priorityLines[index] ?? "")) break;
    if (!isTableHeader(priorityLines, index)) continue;
    const rawCells = tableCells(priorityLines[index] ?? "") ?? [];
    const normalized = new Set(rawCells.map((cell) => cell.toLowerCase()));
    validHeader = REQUIRED_HEADER.every((required) => normalized.has(required));
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

  return violations;
}

function checkAgentsSurface(agentLines: readonly string[]): LocalSliViolation[] {
  const violations: LocalSliViolation[] = [];
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
        message: "LS3 fleet NORMS.md assigns local SLI/SLO rows to sibling PRIORITIES.md",
      });
    }
  }
  return violations;
}

export function checkProductSliBindings(
  priorities: string,
  productSliJson?: string,
): LocalSliViolation[] {
  const violations: LocalSliViolation[] = [];
  const rows = parsePrioritiesLocalSliTable(priorities);

  // Check duplicate IDs in PRIORITIES.md table
  const seenIds = new Set<string>();
  for (const row of rows) {
    if (row.id.startsWith("_(") && row.id.endsWith(")_")) continue;
    if (seenIds.has(row.id)) {
      violations.push({
        rule: "LS4",
        file: "PRIORITIES.md",
        line: row.line,
        message: `LS4 duplicate local SLI row ID '${row.id}' in PRIORITIES.md`,
      });
    } else {
      seenIds.add(row.id);
    }
  }

  const activeRows = rows.filter(
    (r) => !r.id.startsWith("_(") && r.status.toLowerCase() === "active",
  );

  if (productSliJson === undefined) {
    if (activeRows.length > 0) {
      for (const row of activeRows) {
        violations.push({
          rule: "LS5",
          file: "PRIORITIES.md",
          line: row.line,
          message: `LS5 active local row '${row.id}' requires product-sli.json probe binding or explicit report-only disposition`,
        });
      }
    }
    return violations;
  }

  let parsedContract: unknown;
  try {
    parsedContract = JSON.parse(productSliJson);
  } catch (error) {
    violations.push({
      rule: "LS7",
      file: "product-sli.json",
      line: 1,
      message: `LS7 invalid JSON in product-sli.json: ${error instanceof Error ? error.message : String(error)}`,
    });
    return violations;
  }

  const validation = validateProductSliProbeContractV1(parsedContract, priorities);
  if (!validation.ok) {
    for (const diag of validation.diagnostics) {
      let rule: LocalSliRule = "LS7";
      if (diag.code === "E_UNBOUND_ACTIVE_ROW") {
        rule = "LS5";
      } else if (diag.code === "E_PRINCIPLE_MISMATCH" || diag.code === "E_UNKNOWN_SLI_ROW") {
        rule = "LS6";
      } else if (diag.code === "E_DUPLICATE_ID" && diag.pointer.startsWith("/priorities/")) {
        rule = "LS4";
      }
      violations.push({
        rule,
        file: "product-sli.json",
        line: 1,
        message: `${rule} [${diag.code}] ${diag.pointer}: ${diag.message}`,
      });
    }
  }

  return violations;
}

export function checkLocalSliAuthority(
  priorities: string,
  agents: string,
  productSliJson?: string,
): LocalSliViolation[] {
  const priorityLines = visibleLines(priorities);
  const surfaceViolations = checkPrioritiesSurface(priorityLines);
  if (surfaceViolations.length > 0) return surfaceViolations;

  const agentLines = visibleLines(agents);
  const agentViolations = checkAgentsSurface(agentLines);
  const bindingViolations = checkProductSliBindings(priorities, productSliJson);

  return [...agentViolations, ...bindingViolations];
}

function runSelfTest(): void {
  const validPriorities = `# Priorities\n\n## Local SLI / SLO\n\n| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |\n|---|---|---|---|---|\n| _(none yet)_ | — | Use fleet principle SLIs | — | inherit |\n`;
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

  // Active row without product-sli.json -> LS5
  const activePriorities = `# Priorities\n\n## Local SLI / SLO\n\n| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |\n|---|---|---|---|---|\n| sli-draft | P1.1 | draft preservation | 100% | active |\n`;
  const ls5 = checkLocalSliAuthority(activePriorities, "");
  assert.ok(ls5.some(({ rule }) => rule === "LS5"));

  // Active row with valid product-sli.json -> ok
  const validProductSli = JSON.stringify({
    schemaId: "https://schemas.repo-template.dev/product-sli-probe/v1/product-sli-probe.schema.json",
    schemaVersion: "product-sli-probe/v1",
    contractId: "repo-template/product-sli-probe-v1",
    repository: "owner/repo",
    probes: [
      {
        sliId: "sli-draft",
        bindsPrinciple: "P1.1",
        kind: "boolean",
        sloReference: { target: "100%" },
        entrypoint: { path: "scripts/probe.ts", argv: [] },
        effects: { effectClass: "read-only" },
        cadence: { freshnessSeconds: 300 },
      },
    ],
  });
  assert.deepEqual(checkLocalSliAuthority(activePriorities, "", validProductSli), []);

  // Forbidden destructive effect -> LS7
  const destructiveProductSli = validProductSli.replace('"read-only"', '"destructive"');
  const ls7 = checkLocalSliAuthority(activePriorities, "", destructiveProductSli);
  assert.ok(ls7.some(({ rule }) => rule === "LS7"));

  // Principle mismatch -> LS6
  const mismatchedPrinciple = validProductSli.replace('"P1.1"', '"P2.1"');
  const ls6 = checkLocalSliAuthority(activePriorities, "", mismatchedPrinciple);
  assert.ok(ls6.some(({ rule }) => rule === "LS6"));

  // Duplicate ID in PRIORITIES.md -> LS4
  const duplicatePriorities = activePriorities + `| sli-draft | P1.1 | second | 100% | active |\n`;
  const ls4 = checkLocalSliAuthority(duplicatePriorities, "", validProductSli);
  assert.ok(ls4.some(({ rule }) => rule === "LS4"));

  process.stdout.write("check-local-sli-authority self-test: ok\n");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const prioritiesContent = readFileSync("PRIORITIES.md", "utf8");
  const agentsContent = readFileSync("AGENTS.md", "utf8");
  const productSliContent = existsSync("product-sli.json")
    ? readFileSync("product-sli.json", "utf8")
    : undefined;

  const violations = checkLocalSliAuthority(
    prioritiesContent,
    agentsContent,
    productSliContent,
  );
  for (const violation of violations) {
    process.stderr.write(`${violation.file}:${String(violation.line)}: ${violation.message}\n`);
  }
  if (violations.length > 0) process.exitCode = 1;
}

main();
