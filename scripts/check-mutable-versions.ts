#!/usr/bin/env node
/**
 * Enforce AI-First stack guide §1.2 mutable-version policy (repo-template#325).
 *
 * The audit targets living prose: tracked root *.md plus docs/**/*.md. ADRs,
 * adoption-status snapshots, operations snapshots, template-fleet-adoption snapshots,
 * CHANGELOG.md, and plans are dated/history surfaces and are intentionally excluded.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

interface AllowlistEntry {
  readonly token: string;
  readonly reason: string;
  readonly reviewTrigger: string;
}

interface Violation {
  readonly path: string;
  readonly line: number;
  readonly token: string;
}

const TECHNOLOGY_NAMES = [
  "Node.js",
  "PostgreSQL",
  "TypeScript",
  "PowerShell",
  "Electron",
  "Fastify",
  "Manifest",
  "Postgres",
  "ESLint",
  "Python",
  "React",
  "Tauri",
  "Kysely",
  "Node",
  "pnpm",
  "npm",
  "Java",
  "Vite",
  "WSL",
  "Zod",
  "Go",
] as const;

const REQUIRED_ALLOWLIST = new Set(["PowerShell 7", "WSL2", "Manifest V3"]);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const TOKEN_PATTERN = new RegExp(
  String.raw`\b(?:${TECHNOLOGY_NAMES.map(escapeRegex).join("|")})\s*v?\d+(?:\.\d+)*\b`,
  "giu",
);

function normalizeToken(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function isScanPath(path: string): boolean {
  if (path === "CHANGELOG.md") return false;
  if (path.startsWith("plans/")) return false;
  if (path.startsWith("docs/adr/")) return false;
  if (path.startsWith("docs/adoption-status")) return false;
  if (path.startsWith("docs/operations/")) return false;
  if (path.startsWith("docs/template-fleet-adoption-")) return false;
  if (!path.endsWith(".md")) return false;
  return !path.includes("/") || path.startsWith("docs/");
}

function maskInlineCode(line: string): string {
  return line.replace(/`[^`]*`/gu, (value) => " ".repeat(value.length));
}

function scanMarkdown(path: string, content: string, allowed: ReadonlySet<string>): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split(/\r?\n/u);
  let fence: { char: "`" | "~"; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trimStart();
    const fenceMatch = /^(`{3,}|~{3,})/u.exec(trimmed);
    if (fence !== null) {
      if (fenceMatch?.[1]?.[0] === fence.char && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = { char: fenceMatch[1][0] as "`" | "~", length: fenceMatch[1].length };
      continue;
    }

    const visible = maskInlineCode(line);
    TOKEN_PATTERN.lastIndex = 0;
    for (const match of visible.matchAll(TOKEN_PATTERN)) {
      const token = match[0];
      if (!allowed.has(normalizeToken(token))) {
        violations.push({ path, line: index + 1, token });
      }
    }
  }
  return violations;
}

function parseAllowlist(raw: string): AllowlistEntry[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("mutable-version allowlist must be an array");
  const entries: AllowlistEntry[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) throw new Error("allowlist entry must be an object");
    const record = item as Record<string, unknown>;
    for (const field of ["token", "reason", "reviewTrigger"] as const) {
      if (typeof record[field] !== "string" || record[field].trim() === "") {
        throw new Error(`allowlist entry requires non-empty ${field}`);
      }
    }
    entries.push({
      token: String(record.token),
      reason: String(record.reason),
      reviewTrigger: String(record.reviewTrigger),
    });
  }
  const actual = new Set(entries.map((entry) => entry.token));
  assert.deepEqual(actual, REQUIRED_ALLOWLIST, "allowlist must contain exactly the three guide guardrails");
  return entries;
}

function allowedTokens(entries: readonly AllowlistEntry[]): Set<string> {
  return new Set(entries.map((entry) => normalizeToken(entry.token)));
}

function runSelfTest(): void {
  const entries = parseAllowlist(JSON.stringify([
    { token: "PowerShell 7", reason: "guard", reviewTrigger: "next shell generation" },
    { token: "WSL2", reason: "guard", reviewTrigger: "next WSL generation" },
    { token: "Manifest V3", reason: "guard", reviewTrigger: "next manifest generation" },
  ]));
  const allowed = allowedTokens(entries);
  assert.equal(scanMarkdown("README.md", "PowerShell 7 and WSL2 and Manifest V3", allowed).length, 0);
  assert.deepEqual(scanMarkdown("README.md", "Use Node 24 today", allowed).map((v) => v.token), ["Node 24"]);
  assert.equal(scanMarkdown("README.md", "```\nNode 24\n```", allowed).length, 0);
  assert.equal(scanMarkdown("README.md", "Use `Node 24` exactly", allowed).length, 0);
  assert.throws(
    () => parseAllowlist(JSON.stringify([
      { token: "PowerShell 7", reason: "guard", reviewTrigger: "" },
      { token: "WSL2", reason: "guard", reviewTrigger: "next" },
      { token: "Manifest V3", reason: "guard", reviewTrigger: "next" },
    ])),
    /reviewTrigger/u,
  );
  assert.equal(isScanPath("README.md"), true);
  assert.equal(isScanPath("docs/guide.md"), true);
  assert.equal(isScanPath("docs/adr/0001.md"), false);
  assert.equal(isScanPath("CHANGELOG.md"), false);
  process.stdout.write("check-mutable-versions self-test: ok\n");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const entries = parseAllowlist(readFileSync("scripts/mutable-version-allowlist.json", "utf8"));
  const allowed = allowedTokens(entries);
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "" && isScanPath(path));
  const violations = tracked.flatMap((path) => scanMarkdown(path, readFileSync(path, "utf8"), allowed));
  for (const violation of violations) {
    process.stderr.write(`${violation.path}:${String(violation.line)}: ${violation.token}\n`);
  }
  if (violations.length > 0) process.exitCode = 1;
}

main();
