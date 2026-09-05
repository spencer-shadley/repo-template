#!/usr/bin/env node
/**
 * Validate CHANGELOG.md structural rules R1-R6 (Issue #323).
 *
 * Rules:
 *   R1: The first `## ` heading in the file is exactly `## [Unreleased]`
 *   R2: Every `## ` heading other than the first matches `^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$`
 *   R3: Release versions appear in strictly descending SemVer order below `[Unreleased]`
 *   R4: Within one `## ` block, each `### ` heading text appears at most once
 *   R5: Every `### ` heading text is in the closed set Added, Changed, Deprecated, Removed, Fixed, Security, Unchanged (intentional — frozen)
 *   R6: The highest bracketed release version equals the trimmed contents of TEMPLATE_VERSION
 *
 * Headings inside fenced code blocks are not headings; skip fenced regions.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

export interface ChangelogViolation {
  readonly filename: string;
  readonly line: number;
  readonly ruleId: RuleId;
  readonly message: string;
}

export interface CheckOptions {
  readonly changelogContent: string;
  readonly templateVersion: string;
  readonly filename?: string;
}

export const ALLOWED_SUBHEADINGS: ReadonlySet<string> = new Set([
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
  "Unchanged (intentional \u{2014} frozen)",
]);

const H2_RELEASE_PATTERN = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/;
const BRACKETED_RELEASE_PATTERN = /^## \[(\d+\.\d+\.\d+)\]/;
const FENCE_START_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const H2_HEADING_PATTERN = /^##(?:[ \t]+(.*)|$)/;
const H3_HEADING_PATTERN = /^###(?:[ \t]+(.*)|$)/;

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

export function parseSemVer(version: string): [number, number, number] {
  const parts = version.split(".").map((n) => Math.trunc(Number(n)));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareSemVer(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseSemVer(a);
  const [bMaj, bMin, bPat] = parseSemVer(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

interface HeadingH2 {
  readonly line: number;
  readonly trimmedHeading: string;
}

interface HeadingH3 {
  readonly line: number;
  readonly text: string;
  readonly h2Index: number;
}

interface ScannedHeadings {
  readonly h2Headings: readonly HeadingH2[];
  readonly h3Headings: readonly HeadingH3[];
}

function scanHeadings(lines: readonly string[]): ScannedHeadings {
  let activeFence: FenceInfo | null = null;
  const h2Headings: HeadingH2[] = [];
  const h3Headings: HeadingH3[] = [];

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
      h2Headings.push({ line: lineNum, trimmedHeading: line.trim() });
      continue;
    }

    const h3Match = H3_HEADING_PATTERN.exec(line);
    if (h3Match !== null) {
      const text = (h3Match[1] ?? "").trim();
      h3Headings.push({ line: lineNum, text, h2Index: h2Headings.length - 1 });
    }
  }

  return { h2Headings, h3Headings };
}

function validateR1(firstH2: HeadingH2 | undefined, filename: string): ChangelogViolation[] {
  if (!firstH2) {
    return [
      {
        filename,
        line: 1,
        ruleId: "R1",
        message: "The first '## ' heading in the file is missing; expected '## [Unreleased]'",
      },
    ];
  }
  if (firstH2.trimmedHeading !== "## [Unreleased]") {
    return [
      {
        filename,
        line: firstH2.line,
        ruleId: "R1",
        message: `The first '## ' heading in the file is '${firstH2.trimmedHeading}'; expected '## [Unreleased]'`,
      },
    ];
  }
  return [];
}

function validateR2(h2Headings: readonly HeadingH2[], filename: string): ChangelogViolation[] {
  const violations: ChangelogViolation[] = [];
  for (let i = 1; i < h2Headings.length; i += 1) {
    const h2 = h2Headings[i];
    if (h2 && !H2_RELEASE_PATTERN.test(h2.trimmedHeading)) {
      violations.push({
        filename,
        line: h2.line,
        ruleId: "R2",
        message: String.raw`Release heading '${h2.trimmedHeading}' does not match '^## [(\d+\.\d+\.\d+)] - (\d{4}-\d{2}-\d{2})$'`,
      });
    }
  }
  return violations;
}

function validateR3(h2Headings: readonly HeadingH2[], filename: string): ChangelogViolation[] {
  const violations: ChangelogViolation[] = [];
  const unreleasedIdx = h2Headings.findIndex((h) => h.trimmedHeading === "## [Unreleased]");
  if (unreleasedIdx === -1) return violations;

  let prevVersion: string | null = null;
  for (let i = unreleasedIdx + 1; i < h2Headings.length; i += 1) {
    const h2 = h2Headings[i];
    if (!h2) continue;
    const versionMatch = BRACKETED_RELEASE_PATTERN.exec(h2.trimmedHeading);
    if (!versionMatch?.[1]) continue;
    const currentVersion = versionMatch[1];
    if (prevVersion !== null && compareSemVer(prevVersion, currentVersion) <= 0) {
      violations.push({
        filename,
        line: h2.line,
        ruleId: "R3",
        message: `Release version '${currentVersion}' does not appear in strictly descending SemVer order after '${prevVersion}'`,
      });
    }
    prevVersion = currentVersion;
  }
  return violations;
}

function validateR4(h3Headings: readonly HeadingH3[], filename: string): ChangelogViolation[] {
  const violations: ChangelogViolation[] = [];
  const h3ByBlock = new Map<number, HeadingH3[]>();
  for (const h3 of h3Headings) {
    const list = h3ByBlock.get(h3.h2Index) ?? [];
    list.push(h3);
    h3ByBlock.set(h3.h2Index, list);
  }

  for (const h3List of h3ByBlock.values()) {
    const seen = new Set<string>();
    for (const h3 of h3List) {
      if (seen.has(h3.text)) {
        violations.push({
          filename,
          line: h3.line,
          ruleId: "R4",
          message: `Duplicate '### ${h3.text}' heading within '## ' block`,
        });
      } else {
        seen.add(h3.text);
      }
    }
  }
  return violations;
}

function validateR5(h3Headings: readonly HeadingH3[], filename: string): ChangelogViolation[] {
  const violations: ChangelogViolation[] = [];
  for (const h3 of h3Headings) {
    if (!ALLOWED_SUBHEADINGS.has(h3.text)) {
      violations.push({
        filename,
        line: h3.line,
        ruleId: "R5",
        message: `'### ${h3.text}' is not in the allowed set: Added, Changed, Deprecated, Removed, Fixed, Security, Unchanged (intentional \u{2014} frozen)`,
      });
    }
  }
  return violations;
}

interface BracketedRelease {
  readonly line: number;
  readonly version: string;
}

function findHighestRelease(releases: readonly BracketedRelease[]): BracketedRelease | null {
  if (releases.length === 0) return null;
  let highest = releases[0];
  if (!highest) return null;
  for (let i = 1; i < releases.length; i += 1) {
    const rel = releases[i];
    if (rel && compareSemVer(rel.version, highest.version) > 0) {
      highest = rel;
    }
  }
  return highest;
}

function validateR6(
  h2Headings: readonly HeadingH2[],
  templateVersion: string,
  filename: string,
): ChangelogViolation[] {
  const trimmedTemplateVersion = templateVersion.trim();
  const bracketedReleases: BracketedRelease[] = [];
  for (const h2 of h2Headings) {
    const match = BRACKETED_RELEASE_PATTERN.exec(h2.trimmedHeading);
    if (match?.[1]) {
      bracketedReleases.push({ line: h2.line, version: match[1] });
    }
  }

  const highest = findHighestRelease(bracketedReleases);
  if (!highest) {
    return [
      {
        filename,
        line: 1,
        ruleId: "R6",
        message: `No bracketed release version found; expected highest version to match TEMPLATE_VERSION '${trimmedTemplateVersion}'`,
      },
    ];
  }
  if (highest.version !== trimmedTemplateVersion) {
    return [
      {
        filename,
        line: highest.line,
        ruleId: "R6",
        message: `Highest bracketed release version '${highest.version}' does not match TEMPLATE_VERSION '${trimmedTemplateVersion}'`,
      },
    ];
  }
  return [];
}

export function checkChangelogStructure(options: CheckOptions): ChangelogViolation[] {
  const filename = options.filename ?? "CHANGELOG.md";
  const lines = options.changelogContent.split(/\r?\n/);
  const { h2Headings, h3Headings } = scanHeadings(lines);

  return [
    ...validateR1(h2Headings[0], filename),
    ...validateR2(h2Headings, filename),
    ...validateR3(h2Headings, filename),
    ...validateR4(h3Headings, filename),
    ...validateR5(h3Headings, filename),
    ...validateR6(h2Headings, options.templateVersion, filename),
  ];
}

function testPositiveBaseline(): void {
  const validChangelog = `# Changelog

Format: [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Added
- Feature A

### Changed
- Refactor B

### Deprecated
- Deprecate C

### Removed
- Remove D

### Fixed
- Fix E

### Security
- Patch F

### Unchanged (intentional \u{2014} frozen)
- Locked module

## [3.1.0] - 2026-07-29

### Added
- Initial release

## [3.0.0] - 2026-07-28

### Added
- Legacy v3
`;

  const violations = checkChangelogStructure({
    changelogContent: validChangelog,
    templateVersion: "3.1.0",
  });
  if (violations.length !== 0) {
    throw new Error(
      `self-test failed: positive baseline had unexpected violations: ${JSON.stringify(violations)}`,
    );
  }
}

function testR1(): void {
  const r1Negative = `# Changelog

## 1.8.0
- Bullet

## [Unreleased]
`;
  const violations = checkChangelogStructure({
    changelogContent: r1Negative,
    templateVersion: "1.8.0",
  });
  if (violations.every((v) => v.ruleId !== "R1")) {
    throw new Error("self-test failed: R1 negative fixture did not produce an R1 violation");
  }
}

function testR2(): void {
  const r2Negative = `# Changelog

## [Unreleased]

## 1.8.0
- Bullet
`;
  const violations = checkChangelogStructure({
    changelogContent: r2Negative,
    templateVersion: "1.8.0",
  });
  if (violations.every((v) => v.ruleId !== "R2")) {
    throw new Error("self-test failed: R2 negative fixture did not produce an R2 violation");
  }
}

function testR3(): void {
  const r3Negative = `# Changelog

## [Unreleased]

## [2.0.0] - 2026-01-01

## [3.0.0] - 2026-02-01
`;
  const violations = checkChangelogStructure({
    changelogContent: r3Negative,
    templateVersion: "3.0.0",
  });
  if (violations.every((v) => v.ruleId !== "R3")) {
    throw new Error("self-test failed: R3 negative fixture did not produce an R3 violation");
  }
}

function testR4(): void {
  const r4Negative = `# Changelog

## [Unreleased]

### Fixed
- Bug 1

### Fixed
- Bug 2

## [3.1.0] - 2026-07-29
`;
  const violations = checkChangelogStructure({
    changelogContent: r4Negative,
    templateVersion: "3.1.0",
  });
  if (violations.every((v) => v.ruleId !== "R4")) {
    throw new Error("self-test failed: R4 negative fixture did not produce an R4 violation");
  }
}

function testR5(): void {
  const r5Negative = `# Changelog

## [Unreleased]

### Maintenance
- Cleanup

## [3.1.0] - 2026-07-29
`;
  const violations = checkChangelogStructure({
    changelogContent: r5Negative,
    templateVersion: "3.1.0",
  });
  if (violations.every((v) => v.ruleId !== "R5")) {
    throw new Error("self-test failed: R5 negative fixture did not produce an R5 violation");
  }
}

function testR6(): void {
  const r6Negative = `# Changelog

## [Unreleased]

## [3.0.0] - 2026-07-28
`;
  const violations = checkChangelogStructure({
    changelogContent: r6Negative,
    templateVersion: "3.1.0",
  });
  if (violations.every((v) => v.ruleId !== "R6")) {
    throw new Error("self-test failed: R6 negative fixture did not produce an R6 violation");
  }
}

function testFenced(): void {
  const fencedChangelog = `# Changelog

## [Unreleased]

\`\`\`markdown
## 1.8.0
### Maintenance
## [4.0.0] - 2026-01-01
\`\`\`

## [3.1.0] - 2026-07-29

### Added
- Item
`;
  const violations = checkChangelogStructure({
    changelogContent: fencedChangelog,
    templateVersion: "3.1.0",
  });
  if (violations.length !== 0) {
    throw new Error(
      `self-test failed: fenced code block headings were not ignored: ${JSON.stringify(violations)}`,
    );
  }
}

export function selfTest(): void {
  testPositiveBaseline();
  testR1();
  testR2();
  testR3();
  testR4();
  testR5();
  testR6();
  testFenced();
  console.log("check-changelog-structure: self-test passed");
}

function runCheck(repoRoot: string, customFile?: string): void {
  try {
    const changelogPath = customFile
      ? resolve(process.cwd(), customFile)
      : join(repoRoot, "CHANGELOG.md");
    if (!existsSync(changelogPath)) {
      console.error(`check-changelog-structure: missing ${changelogPath}`);
      process.exitCode = 2;
      return;
    }
    const templateVersionPath = join(repoRoot, "TEMPLATE_VERSION");
    if (!existsSync(templateVersionPath)) {
      console.error(`check-changelog-structure: missing ${templateVersionPath}`);
      process.exitCode = 2;
      return;
    }
    const changelogContent = readFileSync(changelogPath, "utf8");
    const templateVersion = readFileSync(templateVersionPath, "utf8").trim();
    const violations = checkChangelogStructure({
      changelogContent,
      templateVersion,
      filename: "CHANGELOG.md",
    });
    if (violations.length > 0) {
      console.error("check-changelog-structure: FAIL");
      for (const v of violations) {
        console.error(`${v.filename}:${String(v.line)}: ${v.ruleId} ${v.message}`);
      }
      process.exitCode = 1;
    } else {
      console.log(
        "check-changelog-structure: ok -- CHANGELOG.md conforms to structural rules R1-R6",
      );
    }
  } catch (error) {
    console.error(
      `check-changelog-structure: ${error instanceof Error ? error.message : String(error)}`,
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
        `check-changelog-structure: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
    return;
  }
  const customFile = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  runCheck(repoRoot, customFile);
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  main();
}
