#!/usr/bin/env node
// Fail closed when living documentation pins mutable technology versions (§1.2).
//
// Scan set:
// Tracked *.md files at the repository root, plus tracked docs/**/*.md,
// excluding: CHANGELOG.md, docs/adr/**, docs/adoption-status*,
// docs/operations/**, docs/template-fleet-adoption-*, and plans/**.
//
// Rationale: ADRs, adoption-status snapshots and plan files are dated historical records;
// §1.2's audit targets living prose.
//
// Config: scripts/mutable-version-allowlist.json
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface AllowlistEntry {
  readonly token: string;
  readonly reason: string;
  readonly reviewTrigger: string;
}

export interface Violation {
  readonly path: string;
  readonly line: number;
  readonly token: string;
}

export const TECHNOLOGY_NAMES = [
  "Node.js",
  "Node",
  "pnpm",
  "npm",
  "TypeScript",
  "ESLint",
  "Python",
  "Java",
  "Go",
  "React",
  "Vite",
  "PostgreSQL",
  "Postgres",
  "WSL",
  "PowerShell",
  "Manifest",
  "Tauri",
  "Electron",
  "Fastify",
  "Zod",
  "Kysely",
] as const;

function escapeRegex(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function buildTechnologyRegex(): RegExp {
  const sortedNames = [...TECHNOLOGY_NAMES].toSorted((a, b) => b.length - a.length);
  const patternString = sortedNames.map(escapeRegex).join("|");
  return new RegExp(String.raw`\b(?:${patternString})\s*v?\d+(?:\.\d+)*\b`, "gi");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAllowlistEntry(entry: unknown, index: number): AllowlistEntry {
  if (!isRecord(entry)) {
    throw new Error(`allowlist entry at index ${String(index)} must be an object`);
  }
  const token = entry["token"];
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error(`allowlist entry at index ${String(index)} missing required non-empty 'token'`);
  }
  const reason = entry["reason"];
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error(`allowlist entry at index ${String(index)} ('${token}') missing required non-empty 'reason'`);
  }
  const reviewTrigger = entry["reviewTrigger"];
  if (typeof reviewTrigger !== "string" || reviewTrigger.trim().length === 0) {
    throw new Error(`allowlist entry at index ${String(index)} ('${token}') missing required non-empty 'reviewTrigger'`);
  }
  return { token, reason, reviewTrigger };
}

export function validateAllowlist(raw: unknown): AllowlistEntry[] {
  let entries: unknown[];
  if (Array.isArray(raw)) {
    entries = raw;
  } else if (isRecord(raw) && Array.isArray(raw["entries"])) {
    entries = raw["entries"];
  } else if (isRecord(raw) && Array.isArray(raw["allowlist"])) {
    entries = raw["allowlist"];
  } else {
    throw new Error("allowlist must be an array of entries (or an object with an 'entries' or 'allowlist' array)");
  }

  const result: AllowlistEntry[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    result.push(validateAllowlistEntry(entries[i], i));
  }
  return result;
}

export function loadAllowlist(filePath: string): AllowlistEntry[] {
  if (!existsSync(filePath)) {
    throw new Error(`missing allowlist file at ${filePath}`);
  }
  const text = readFileSync(filePath, "utf8");
  const parsed: unknown = JSON.parse(text);
  return validateAllowlist(parsed);
}

function tokensMatch(matchedToken: string, allowlistToken: string): boolean {
  const normMatched = matchedToken.trim().replaceAll(/\s+/g, " ").toLowerCase();
  const normAllowlist = allowlistToken.trim().replaceAll(/\s+/g, " ").toLowerCase();
  if (normMatched === normAllowlist) return true;
  if (normMatched.replaceAll(" ", "") === normAllowlist.replaceAll(" ", "")) return true;
  return false;
}

export function isAllowed(token: string, allowlist: readonly AllowlistEntry[]): boolean {
  return allowlist.some((entry) => tokensMatch(token, entry.token));
}

function findCloseDelimiter(chars: readonly string[], startIndex: number, delimiterLength: number): number {
  let j = startIndex;
  while (j < chars.length) {
    if (chars[j] !== "`") {
      j += 1;
      continue;
    }
    let closeLen = 0;
    while (j + closeLen < chars.length && chars[j + closeLen] === "`") {
      closeLen += 1;
    }
    if (closeLen === delimiterLength) {
      return j;
    }
    j += closeLen;
  }
  return -1;
}

function maskRange(chars: string[], from: number, to: number): void {
  for (let k = from; k < to; k += 1) {
    if (chars[k] !== "\n" && chars[k] !== "\r") {
      chars[k] = " ";
    }
  }
}

function maskInlineCodeSpans(text: string): string {
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    if (chars[i] !== "`") {
      i += 1;
      continue;
    }
    let openLen = 0;
    while (i + openLen < chars.length && chars[i + openLen] === "`") {
      openLen += 1;
    }
    const closeIndex = findCloseDelimiter(chars, i + openLen, openLen);
    if (closeIndex !== -1) {
      maskRange(chars, i, closeIndex + openLen);
      i = closeIndex + openLen;
    } else {
      i += openLen;
    }
  }
  return chars.join("");
}

function parseOpenFence(lineWithoutCr: string): { fenceChar: string; fenceLength: number } | null {
  const trimmedLeading = lineWithoutCr.replace(/^ {0,3}/, "");
  if (trimmedLeading.startsWith("```")) {
    let len = 0;
    while (len < trimmedLeading.length && trimmedLeading[len] === "`") {
      len += 1;
    }
    const rest = trimmedLeading.slice(len);
    if (!rest.includes("`")) {
      return { fenceChar: "`", fenceLength: len };
    }
  } else if (trimmedLeading.startsWith("~~~")) {
    let len = 0;
    while (len < trimmedLeading.length && trimmedLeading[len] === "~") {
      len += 1;
    }
    return { fenceChar: "~", fenceLength: len };
  }
  return null;
}

function isCloseFence(lineWithoutCr: string, fenceChar: string, fenceLength: number): boolean {
  const trimmed = lineWithoutCr.trimStart();
  if (lineWithoutCr.length - trimmed.length > 3) return false;
  let len = 0;
  while (len < trimmed.length && trimmed[len] === fenceChar) {
    len += 1;
  }
  if (len < fenceLength) return false;
  const rest = trimmed.slice(len).trim();
  return rest.length === 0;
}

interface FenceState {
  inFence: boolean;
  fenceChar: string;
  fenceLength: number;
}

function processFenceLine(lineWithoutCr: string, state: FenceState): boolean {
  if (state.inFence) {
    if (isCloseFence(lineWithoutCr, state.fenceChar, state.fenceLength)) {
      state.inFence = false;
    }
    return true;
  }

  const openMatch = parseOpenFence(lineWithoutCr);
  if (openMatch !== null) {
    state.inFence = true;
    state.fenceChar = openMatch.fenceChar;
    state.fenceLength = openMatch.fenceLength;
    return true;
  }

  return false;
}

export function stripCodeBlocksAndSpans(markdownText: string): string {
  const lines = markdownText.split("\n");
  const maskedLines: string[] = [];
  const state: FenceState = { inFence: false, fenceChar: "", fenceLength: 0 };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const hasCr = rawLine.endsWith("\r");
    const lineWithoutCr = hasCr ? rawLine.slice(0, -1) : rawLine;

    const isFenceLine = processFenceLine(lineWithoutCr, state);
    if (isFenceLine) {
      maskedLines.push(" ".repeat(lineWithoutCr.length) + (hasCr ? "\r" : ""));
    } else {
      maskedLines.push(rawLine);
    }
  }

  const maskedFences = maskedLines.join("\n");
  return maskInlineCodeSpans(maskedFences);
}

export function checkMarkdownText(
  filePath: string,
  content: string,
  allowlist: readonly AllowlistEntry[],
): Violation[] {
  const sanitized = stripCodeBlocksAndSpans(content);
  const lines = sanitized.split(/\r?\n/);
  const violations: Violation[] = [];
  const regex = buildTechnologyRegex();

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const line = lines[lineIdx] ?? "";
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const token = match[0];
      if (!isAllowed(token, allowlist)) {
        violations.push({
          path: filePath,
          line: lineIdx + 1,
          token,
        });
      }
    }
  }

  return violations;
}

export function filterScanSet(files: readonly string[]): string[] {
  return files.filter((file) => {
    const normalized = file.replaceAll("\\", "/");
    const isRootMd = !normalized.includes("/") && normalized.endsWith(".md");
    const isDocsMd = normalized.startsWith("docs/") && normalized.endsWith(".md");

    if (!isRootMd && !isDocsMd) return false;

    if (normalized === "CHANGELOG.md") return false;
    if (normalized.startsWith("docs/adr/")) return false;
    if (normalized.startsWith("docs/adoption-status")) return false;
    if (normalized.startsWith("docs/operations/")) return false;
    if (normalized.startsWith("docs/template-fleet-adoption-")) return false;
    if (normalized.startsWith("plans/")) return false;

    return true;
  });
}

export function getTrackedFiles(repoRoot: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean).map((f) => f.replaceAll("\\", "/"));
}

function testAllowedGuardrails(allowlist: readonly AllowlistEntry[]): void {
  const allowedDoc = [
    "# Windows Setup",
    "Use PowerShell 7 for all host operator commands.",
    "Install WSL2 on Windows 11.",
    "Extensions must target Manifest V3.",
  ].join("\n");
  const allowedViolations = checkMarkdownText("docs/TEST.md", allowedDoc, allowlist);
  if (allowedViolations.length !== 0) {
    throw new Error(`self-test failed: allowed guardrail tokens were rejected: ${JSON.stringify(allowedViolations)}`);
  }
}

function testUnallowedTokens(allowlist: readonly AllowlistEntry[]): void {
  const unallowedDoc = [
    "# Requirements",
    "We recommend Node 20 or Node.js 22.0.0 for development.",
    "Python 3.11 is also required.",
  ].join("\n");
  const unallowedViolations = checkMarkdownText("docs/TEST.md", unallowedDoc, allowlist);
  if (unallowedViolations.length !== 3) {
    throw new Error(`self-test failed: expected 3 violations for unallowed tokens, got: ${JSON.stringify(unallowedViolations)}`);
  }
  const [first, second, third] = unallowedViolations;
  if (!first || first.token !== "Node 20" || first.line !== 2) {
    throw new Error(`self-test failed: unexpected first violation: ${JSON.stringify(first)}`);
  }
  if (!second || second.token !== "Node.js 22.0.0" || second.line !== 2) {
    throw new Error(`self-test failed: unexpected second violation: ${JSON.stringify(second)}`);
  }
  if (!third || third.token !== "Python 3.11" || third.line !== 3) {
    throw new Error(`self-test failed: unexpected third violation: ${JSON.stringify(third)}`);
  }
}

function testFencedAndInlineCode(allowlist: readonly AllowlistEntry[]): void {
  const fencedDoc = [
    "# Commands",
    "```bash",
    "node 20 is here",
    "npm 10 is here",
    "python 3.11 is here",
    "```",
    "~~~ts",
    "const nodeVersion = 'Node 20';",
    "~~~",
  ].join("\n");
  const fencedViolations = checkMarkdownText("docs/TEST.md", fencedDoc, allowlist);
  if (fencedViolations.length !== 0) {
    throw new Error(`self-test failed: tokens inside fenced code blocks were flagged: ${JSON.stringify(fencedViolations)}`);
  }

  const inlineDoc = [
    "# Tools",
    "Use `Node 20` and `` `Python 3.11` `` for local verification.",
    "Run `npm 10 install` in the directory.",
  ].join("\n");
  const inlineViolations = checkMarkdownText("docs/TEST.md", inlineDoc, allowlist);
  if (inlineViolations.length !== 0) {
    throw new Error(`self-test failed: tokens inside inline code spans were flagged: ${JSON.stringify(inlineViolations)}`);
  }
}

function testAllowlistValidation(): void {
  let emptyTriggerFailed = false;
  try {
    validateAllowlist([{ token: "PowerShell 7", reason: "reason", reviewTrigger: "" }]);
  } catch (error) {
    emptyTriggerFailed = true;
    if (!(error instanceof Error) || !error.message.includes("reviewTrigger")) {
      throw new Error(`self-test failed: unexpected error message for empty reviewTrigger: ${String(error)}`, { cause: error });
    }
  }
  if (!emptyTriggerFailed) {
    throw new Error("self-test failed: allowlist entry with empty reviewTrigger was not rejected");
  }

  let whitespaceTriggerFailed = false;
  try {
    validateAllowlist([{ token: "PowerShell 7", reason: "reason", reviewTrigger: " ".repeat(3) }]);
  } catch {
    whitespaceTriggerFailed = true;
  }
  if (!whitespaceTriggerFailed) {
    throw new Error("self-test failed: allowlist entry with whitespace-only reviewTrigger was not rejected");
  }

  let omittedTriggerFailed = false;
  try {
    validateAllowlist([{ token: "PowerShell 7", reason: "reason" }]);
  } catch {
    omittedTriggerFailed = true;
  }
  if (!omittedTriggerFailed) {
    throw new Error("self-test failed: allowlist entry with omitted reviewTrigger was not rejected");
  }
}

function testScanSetFiltering(): void {
  const candidatePaths = [
    "README.md",
    "AGENTS.md",
    "docs/ARCHITECTURE.md",
    "docs/RUNBOOK.md",
    "docs/sub/guide.md",
    "CHANGELOG.md",
    "docs/adr/0001-design.md",
    "docs/adoption-status.md",
    "docs/adoption-status-2026-07-28.md",
    "docs/operations/README.md",
    "docs/template-fleet-adoption-refresh.md",
    "plans/001.md",
    "plans/archive/001.md",
    "packages/adoption-shell/README.md",
    "scripts/check-dir-breadth.ts",
  ];
  const filtered = filterScanSet(candidatePaths);
  const expectedFiltered = [
    "README.md",
    "AGENTS.md",
    "docs/ARCHITECTURE.md",
    "docs/RUNBOOK.md",
    "docs/sub/guide.md",
  ];
  if (JSON.stringify(filtered) !== JSON.stringify(expectedFiltered)) {
    throw new Error(`self-test failed: scan set filter mismatch: expected ${JSON.stringify(expectedFiltered)}, got ${JSON.stringify(filtered)}`);
  }
}

export function selfTest(): void {
  const allowlist: AllowlistEntry[] = [
    {
      token: "PowerShell 7",
      reason: "retained guardrail numeral",
      reviewTrigger: "a PowerShell generation after 7 becomes the Windows default shell",
    },
    {
      token: "WSL2",
      reason: "retained guardrail numeral",
      reviewTrigger: "a WSL generation after 2 becomes the default install",
    },
    {
      token: "Manifest V3",
      reason: "retained guardrail numeral",
      reviewTrigger: "Chrome ships an extension manifest generation after V3",
    },
  ];

  testAllowedGuardrails(allowlist);
  testUnallowedTokens(allowlist);
  testFencedAndInlineCode(allowlist);
  testAllowlistValidation();
  testScanSetFiltering();

  console.log("check-mutable-versions: self-test passed");
}

export function runCheck(repoRoot: string): void {
  const allowlistPath = join(repoRoot, "scripts", "mutable-version-allowlist.json");
  let allowlist: AllowlistEntry[];
  try {
    allowlist = loadAllowlist(allowlistPath);
  } catch (error) {
    console.error(`check-mutable-versions: invalid allowlist: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  let trackedFiles: string[];
  try {
    trackedFiles = getTrackedFiles(repoRoot);
  } catch (error) {
    console.error(`check-mutable-versions: failed to list git files: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }

  const scanSet = filterScanSet(trackedFiles);
  const allViolations: Violation[] = [];

  for (const relativePath of scanSet) {
    const fullPath = join(repoRoot, ...relativePath.split("/"));
    let content: string;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch (error) {
      console.error(`check-mutable-versions: cannot read ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 2;
      return;
    }

    const violations = checkMarkdownText(relativePath, content, allowlist);
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    console.error("check-mutable-versions: FAIL -- unallowed mutable version(s) in living prose:");
    for (const v of allViolations) {
      console.error(`${v.path}:${String(v.line)}: ${v.token}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`check-mutable-versions: ok -- ${String(scanSet.length)} file(s) scanned, 0 violations`);
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    try {
      selfTest();
    } catch (error) {
      console.error(`check-mutable-versions: ${error instanceof Error ? error.message : String(error)}`);
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
