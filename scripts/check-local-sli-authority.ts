#!/usr/bin/env node
/**
 * Validate local SLI/SLO authority boundaries (Issue #326).
 *
 * Rules:
 *   LS1: PRIORITIES.md contains a `## Local SLI / SLO` heading
 *   LS2: A Markdown table follows that heading whose header row carries cells:
 *        `ID`, `Binds principle`, `SLI (how observed here)`, `SLO (target)`, `Status`
 *   LS3: AGENTS.md contains NO Markdown table whose header row has both an SLI cell
 *        and an SLO cell (^SLI\b / ^SLO\b case-insensitively).
 *
 * Fenced code blocks are skipped when locating headings and tables.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export type RuleId = "LS1" | "LS2" | "LS3";

export interface AuthorityViolation {
  readonly filename: string;
  readonly line: number;
  readonly ruleId: RuleId;
  readonly message: string;
}

export interface CheckOptions {
  readonly prioritiesContent: string;
  readonly agentsContent: string;
  readonly prioritiesFilename?: string;
  readonly agentsFilename?: string;
}

export const REQUIRED_COLUMNS: readonly string[] = [
  "ID",
  "Binds principle",
  "SLI (how observed here)",
  "SLO (target)",
  "Status",
];

const FENCE_START_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const H2_HEADING_PATTERN = /^##(?:[ \t]+(.*)|$)/;
const LOCAL_SLI_HEADING_PATTERN = /^##[ \t]+Local SLI \/ SLO\s*$/;
const SLI_CELL_PATTERN = /^SLI\b/i;
const SLO_CELL_PATTERN = /^SLO\b/i;

interface FenceInfo {
  readonly char: string;
  readonly length: number;
}

function getFenceStart(line: string): FenceInfo | null {
  const match = FENCE_START_PATTERN.exec(line);
  if (!match?.[1]) return null;
  const fenceStr = match[1];
  const char = fenceStr[0];
  if (!char) return null;
  const length = fenceStr.length;
  if (char === "`") {
    const remainder = line.slice(match[0].length);
    if (remainder.includes("`")) return null;
  }
  return { char, length };
}

function isFenceEnd(line: string, fence: FenceInfo): boolean {
  const charPattern = fence.char === "`" ? "`" : "~";
  const pattern = new RegExp(String.raw`^ {0,3}${charPattern}{${String(fence.length)},}\s*$`);
  return pattern.test(line);
}

export function splitTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;

  let text = trimmed;
  if (text.startsWith("|")) {
    text = text.slice(1);
  }
  if (text.endsWith("|") && !text.endsWith(String.raw`\|`)) {
    text = text.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
      current += char;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function isDelimiterRow(cells: readonly string[]): boolean {
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-+:?$/.test(cell));
}

interface TableHeader {
  readonly line: number;
  readonly text: string;
  readonly cells: readonly string[];
}

interface HeadingH2 {
  readonly line: number;
  readonly trimmedHeading: string;
}

interface ScannedMarkdown {
  readonly tableHeaders: readonly TableHeader[];
  readonly h2Headings: readonly HeadingH2[];
}

function tryParseTableHeader(
  line: string,
  nextLine: string | undefined,
  lineNum: number,
): TableHeader | null {
  if (nextLine === undefined) return null;
  const cells = splitTableCells(line);
  if (cells === null || isDelimiterRow(cells)) return null;

  const nextCells = splitTableCells(nextLine);
  if (
    nextCells === null ||
    nextCells.length !== cells.length ||
    !isDelimiterRow(nextCells)
  ) {
    return null;
  }

  return { line: lineNum, text: line, cells };
}

function scanMarkdown(content: string): ScannedMarkdown {
  const lines = content.split(/\r?\n/);
  let activeFence: FenceInfo | null = null;
  const tableHeaders: TableHeader[] = [];
  const h2Headings: HeadingH2[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    const line = lines[i] ?? "";

    if (activeFence !== null) {
      if (isFenceEnd(line, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    const fence = getFenceStart(line);
    if (fence !== null) {
      activeFence = fence;
      continue;
    }

    const h2Match = H2_HEADING_PATTERN.exec(line);
    if (h2Match !== null) {
      h2Headings.push({
        line: lineNum,
        trimmedHeading: line.trim(),
      });
      continue;
    }

    const header = tryParseTableHeader(line, lines[i + 1], lineNum);
    if (header !== null) {
      tableHeaders.push(header);
    }
  }

  return { tableHeaders, h2Headings };
}

function validateLS1AndLS2(
  prioritiesContent: string,
  prioritiesFilename: string,
): AuthorityViolation[] {
  const { tableHeaders, h2Headings } = scanMarkdown(prioritiesContent);
  const violations: AuthorityViolation[] = [];

  const headingIndex = h2Headings.findIndex((h) =>
    LOCAL_SLI_HEADING_PATTERN.test(h.trimmedHeading),
  );

  if (headingIndex === -1) {
    violations.push({
      filename: prioritiesFilename,
      line: 1,
      ruleId: "LS1",
      message: "PRIORITIES.md missing required '## Local SLI / SLO' heading",
    });
    return violations;
  }

  const currentH2 = h2Headings[headingIndex];
  if (!currentH2) return violations;

  const nextH2 = h2Headings[headingIndex + 1];
  const sectionEndLine = nextH2 ? nextH2.line : Infinity;

  const sectionTable = tableHeaders.find(
    (th) => th.line > currentH2.line && th.line < sectionEndLine,
  );

  if (!sectionTable) {
    violations.push({
      filename: prioritiesFilename,
      line: currentH2.line,
      ruleId: "LS2",
      message: "No Markdown table found following '## Local SLI / SLO' heading",
    });
    return violations;
  }

  const missingColumns = REQUIRED_COLUMNS.filter(
    (col) => !sectionTable.cells.includes(col),
  );

  if (missingColumns.length > 0) {
    violations.push({
      filename: prioritiesFilename,
      line: sectionTable.line,
      ruleId: "LS2",
      message: `Markdown table header row is missing required column(s): ${missingColumns.map((col) => `'${col}'`).join(", ")}`,
    });
  }

  return violations;
}

function validateLS3(
  agentsContent: string,
  agentsFilename: string,
): AuthorityViolation[] {
  const violations: AuthorityViolation[] = [];
  const { tableHeaders } = scanMarkdown(agentsContent);

  for (const th of tableHeaders) {
    const hasSli = th.cells.some((cell) => SLI_CELL_PATTERN.test(cell.trim()));
    const hasSlo = th.cells.some((cell) => SLO_CELL_PATTERN.test(cell.trim()));
    if (hasSli && hasSlo) {
      violations.push({
        filename: agentsFilename,
        line: th.line,
        ruleId: "LS3",
        message: `table header row '${th.text.trim()}' contains both SLI and SLO cells; fleet NORMS.md assigns local SLI/SLO rows to sibling PRIORITIES.md`,
      });
    }
  }

  return violations;
}

export function checkLocalSliAuthority(options: CheckOptions): AuthorityViolation[] {
  const prioritiesFilename = options.prioritiesFilename ?? "PRIORITIES.md";
  const agentsFilename = options.agentsFilename ?? "AGENTS.md";

  return [
    ...validateLS1AndLS2(options.prioritiesContent, prioritiesFilename),
    ...validateLS3(options.agentsContent, agentsFilename),
  ];
}

function testPositiveBaseline(): void {
  const priorities = `# {{NAME}} — priorities, SLI, SLO

## Fleet inheritance
Fleet principles.

## Local SLI / SLO

Domain- or repo-specific measurement of the fleet principles.

| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|---|
| _(none yet)_ | — | Use fleet principle SLIs until a local row is ratified | — | inherit |

## Related
Related links.
`;

  const agents = `# Agent Constitution

## Mission
Template definition.

## Product principles
Every principle has a durable SLI: definition and a tunable SLO: target.
`;

  const violations = checkLocalSliAuthority({
    prioritiesContent: priorities,
    agentsContent: agents,
  });
  if (violations.length !== 0) {
    throw new Error(
      `self-test failed: positive baseline had unexpected violations: ${JSON.stringify(violations)}`,
    );
  }
}

function testMissingLocalSliHeading(): void {
  const priorities = `# {{NAME}} — priorities, SLI, SLO

## Fleet inheritance
Fleet principles.

## Local Metrics

| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|---|
`;
  const agents = `# Agent Constitution\n`;

  const violations = checkLocalSliAuthority({
    prioritiesContent: priorities,
    agentsContent: agents,
  });
  if (violations.length !== 1 || violations[0]?.ruleId !== "LS1") {
    throw new Error(
      `self-test failed: missing ## Local SLI / SLO heading should trigger LS1, got: ${JSON.stringify(violations)}`,
    );
  }
}

function testHeaderMissingRequiredColumn(): void {
  const priorities = `# {{NAME}} — priorities, SLI, SLO

## Local SLI / SLO

| ID | Binds principle | SLI (how observed here) | Status |
|---|---|---|---|
| 1 | P0.1 | sli | active |
`;
  const agents = `# Agent Constitution\n`;

  const violations = checkLocalSliAuthority({
    prioritiesContent: priorities,
    agentsContent: agents,
  });
  if (violations.length !== 1 || violations[0]?.ruleId !== "LS2") {
    throw new Error(
      `self-test failed: header row missing required column should trigger LS2, got: ${JSON.stringify(violations)}`,
    );
  }
  if (!violations[0].message.includes("SLO (target)")) {
    throw new Error(
      `self-test failed: LS2 message should mention missing column 'SLO (target)', got: ${violations[0].message}`,
    );
  }
}

function testNoTableFollowingLocalSliHeading(): void {
  const priorities = `# {{NAME}} — priorities, SLI, SLO

## Local SLI / SLO

No table here, just prose.

## Related
`;
  const agents = `# Agent Constitution\n`;

  const violations = checkLocalSliAuthority({
    prioritiesContent: priorities,
    agentsContent: agents,
  });
  if (violations.length !== 1 || violations[0]?.ruleId !== "LS2") {
    throw new Error(
      `self-test failed: missing table following heading should trigger LS2, got: ${JSON.stringify(violations)}`,
    );
  }
}

function testAgentsWithSliSloTable(): void {
  const priorities = `# {{NAME}} — priorities, SLI, SLO

## Local SLI / SLO

| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|---|
| 1 | P0.1 | sli | slo | active |
`;
  const agents = `# Agent Constitution

## Mission
Something.

| ID | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|
| 1 | sli | slo | active |
`;

  const violations = checkLocalSliAuthority({
    prioritiesContent: priorities,
    agentsContent: agents,
  });
  if (violations.length !== 1 || violations[0]?.ruleId !== "LS3") {
    throw new Error(
      `self-test failed: AGENTS.md with SLI+SLO table should trigger LS3, got: ${JSON.stringify(violations)}`,
    );
  }
  if (violations[0].line !== 6) {
    throw new Error(
      `self-test failed: LS3 line number should be 6, got: ${String(violations[0].line)}`,
    );
  }
  if (
    !violations[0].message.includes(
      "fleet NORMS.md assigns local SLI/SLO rows to sibling PRIORITIES.md",
    )
  ) {
    throw new Error(
      `self-test failed: LS3 message should mention fleet NORMS.md assignment, got: ${violations[0].message}`,
    );
  }
}

function testAgentsProseMentioningSli(): void {
  const priorities = `# {{NAME}} — priorities, SLI, SLO

## Local SLI / SLO

| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|---|
| 1 | P0.1 | sli | slo | active |
`;
  const agents = `# Agent Constitution

## Mission
Something.

Every principle has a durable SLI: definition and a tunable SLO: target.
The system verifies SLI health and monitors SLO breaches across runs.
`;

  const violations = checkLocalSliAuthority({
    prioritiesContent: priorities,
    agentsContent: agents,
  });
  if (violations.length !== 0) {
    throw new Error(
      `self-test failed: AGENTS.md with prose mentioning SLI should pass, got: ${JSON.stringify(violations)}`,
    );
  }
}

function testFencedCodeBlockTable(): void {
  const priorities = `# {{NAME}} — priorities, SLI, SLO

## Local SLI / SLO

| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|---|
| 1 | P0.1 | sli | slo | active |
`;
  const agents = `# Agent Constitution

## Mission
Something.

Here is an example in markdown:

\`\`\`markdown
| ID | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|
| 1 | sli | slo | active |
\`\`\`

And another in tildes:

~~~markdown
| ID | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|
| 1 | sli | slo | active |
~~~
`;

  const violations = checkLocalSliAuthority({
    prioritiesContent: priorities,
    agentsContent: agents,
  });
  if (violations.length !== 0) {
    throw new Error(
      `self-test failed: SLI+SLO table inside fenced code block should pass, got: ${JSON.stringify(violations)}`,
    );
  }
}

function selfTest(): void {
  testPositiveBaseline();
  testMissingLocalSliHeading();
  testHeaderMissingRequiredColumn();
  testNoTableFollowingLocalSliHeading();
  testAgentsWithSliSloTable();
  testAgentsProseMentioningSli();
  testFencedCodeBlockTable();
  console.log("check-local-sli-authority: self-test passed");
}

function runCheck(repoRoot: string): void {
  try {
    const prioritiesPath = join(repoRoot, "PRIORITIES.md");
    if (!existsSync(prioritiesPath)) {
      console.error(`check-local-sli-authority: missing ${prioritiesPath}`);
      process.exitCode = 2;
      return;
    }

    const agentsPath = join(repoRoot, "AGENTS.md");
    if (!existsSync(agentsPath)) {
      console.error(`check-local-sli-authority: missing ${agentsPath}`);
      process.exitCode = 2;
      return;
    }

    const prioritiesContent = readFileSync(prioritiesPath, "utf8");
    const agentsContent = readFileSync(agentsPath, "utf8");

    const violations = checkLocalSliAuthority({
      prioritiesContent,
      agentsContent,
      prioritiesFilename: "PRIORITIES.md",
      agentsFilename: "AGENTS.md",
    });

    if (violations.length > 0) {
      console.error("check-local-sli-authority: FAIL");
      for (const v of violations) {
        console.error(`${v.filename}:${String(v.line)}: ${v.ruleId} ${v.message}`);
      }
      process.exitCode = 1;
    } else {
      console.log(
        "check-local-sli-authority: ok -- local SLI/SLO authority conforms to rules LS1-LS3",
      );
    }
  } catch (error) {
    console.error(
      `check-local-sli-authority: ${error instanceof Error ? error.message : String(error)}`,
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
        `check-local-sli-authority: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
    return;
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  runCheck(repoRoot);
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  main();
}
