import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { classifyDirective, normalizeCommentLogicalLine, parseTodoDirective } from "./classify.ts";
import { extractComments } from "./extractors.ts";
import { resolveLanguageClass } from "./registry.ts";
import type { TodoFindingV1, TodoScanResultV1 } from "./types.ts";

const DEFAULT_IGNORES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".git",
  "artifacts",
  "worktrees",
  ".worktrees",
]);

function isGeneratedOrVendor(relPath: string): boolean {
  const lower = relPath.replaceAll("\\", "/").toLowerCase();
  return (
    lower.includes("/vendor/") ||
    lower.includes("/generated/") ||
    lower.includes("/dist/") ||
    lower.endsWith(".min.js") ||
    lower.endsWith(".lock") ||
    lower.endsWith("pnpm-lock.yaml") ||
    lower.endsWith("package-lock.json")
  );
}

function walkFiles(rootDir: string, out: string[]): void {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (DEFAULT_IGNORES.has(entry.name)) continue;
    const full = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (entry.isFile()) out.push(full);
  }
}

export interface ScanOptions {
  readonly rootDir: string;
  readonly mode?: "full-tree" | "changed-files";
  readonly paths?: readonly string[];
  readonly repository?: string | null;
}

export function scanTodoIssueLinks(options: ScanOptions): TodoScanResultV1 {
  const mode = options.mode ?? (options.paths ? "changed-files" : "full-tree");
  const files = options.paths
    ? options.paths.map((p) => (p.startsWith("/") ? p : join(options.rootDir, p)))
    : (() => {
        const collected: string[] = [];
        walkFiles(options.rootDir, collected);
        return collected;
      })();

  const findings: TodoFindingV1[] = [];
  const unsupportedPaths: { path: string; languageId: string | null }[] = [];
  let scanned = 0;

  for (const filePath of files) {
    try {
      if (!statSync(filePath).isFile()) continue;
    } catch {
      continue;
    }
    const rel = relative(options.rootDir, filePath).replaceAll("\\", "/") || filePath.replaceAll("\\", "/");
    if (isGeneratedOrVendor(rel)) continue;

    const language = resolveLanguageClass(rel);
    if (!language) {
      // Unknown authored extension: fail closed as unsupported (never silent pass).
      if (/\.[a-z0-9]+$/i.test(rel) && !rel.endsWith(".json") && !rel.endsWith(".toml")) {
        unsupportedPaths.push({ path: rel, languageId: null });
      }
      continue;
    }
    if (language.coverage === "skipped") continue;
    if (language.coverage === "unsupported") {
      unsupportedPaths.push({ path: rel, languageId: language.id });
      continue;
    }

    scanned += 1;
    const source = readFileSync(filePath, "utf8");
    const spans = extractComments(language.extractorId, source);
    for (const span of spans) {
      // Evaluate each logical line so mid-block comments with leading * still work.
      const logicalLines = span.text.split(/\r?\n/);
      for (let li = 0; li < logicalLines.length; li += 1) {
        const normalized = normalizeCommentLogicalLine(logicalLines[li]!);
        const parsed = parseTodoDirective(normalized);
        if (!parsed.isDirective) continue;
        const classified = classifyDirective(parsed);
        if (classified.ok) continue;
        findings.push({
          schema: "TodoIssueLinkFindingV1",
          version: 1,
          repository: options.repository ?? null,
          path: rel,
          line: span.line + li,
          column: span.column,
          languageId: language.id,
          normalizedCommentText: normalized,
          violationReason: classified.reason!,
          linkedIssueUrl: classified.linkedIssueUrl,
          extractorId: language.extractorId,
          coverageStatus: language.coverage,
        });
      }
    }
  }

  return {
    schema: "TodoIssueLinkScanResultV1",
    version: 1,
    mode,
    ok: findings.length === 0 && unsupportedPaths.length === 0,
    findings,
    unsupportedPaths,
    scannedFileCount: scanned,
  };
}
