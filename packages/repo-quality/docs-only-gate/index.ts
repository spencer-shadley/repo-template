/**
 * RT#422 — portable docs-only LocalCi simpleDiff gate.
 *
 * Policy (shared across former leaf copies):
 * - changed-path set must be non-empty
 * - every path must be Markdown (`.md` / `.markdown`)
 * - every path must be readable and non-empty
 * - when `AGENTS.md` is in the changed set, it must still contain the three
 *   canonical charter headings: Mission, Responsibilities, Non-responsibilities
 *
 * Dependency-free: safe for `requiresDependencies: false` LocalCi legs.
 */

import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

export const DOCS_ONLY_GATE_SCHEMA = "DocsOnlySimpleDiffGateV1" as const;

export const AGENTS_CHARTER_HEADINGS = Object.freeze([
  "Mission",
  "Responsibilities",
  "Non-responsibilities",
] as const);

export type DocsOnlyGateCode =
  | "empty-changed-paths"
  | "non-markdown-path"
  | "unreadable-path"
  | "empty-file"
  | "agents-charter-heading-missing";

export interface DocsOnlyGateViolation {
  readonly code: DocsOnlyGateCode;
  readonly path?: string;
  readonly detail: string;
}

export interface DocsOnlyGateResult {
  readonly schema: typeof DOCS_ONLY_GATE_SCHEMA;
  readonly ok: boolean;
  readonly changedPaths: readonly string[];
  readonly violations: readonly DocsOnlyGateViolation[];
}

const MARKDOWN_EXTS = new Set([".md", ".markdown"]);

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTS.has(extname(path).toLowerCase());
}

export function missingAgentsCharterHeadings(content: string): string[] {
  const missing: string[] = [];
  for (const heading of AGENTS_CHARTER_HEADINGS) {
    const re = new RegExp(`^#{1,6}\\s+${heading}\\s*$`, "mi");
    if (!re.test(content)) missing.push(heading);
  }
  return missing;
}

/**
 * Evaluate the docs-only policy over a changed-path set relative to `cwd`.
 */
export function evaluateDocsOnlyGate(
  changedPaths: readonly string[],
  options: { readonly cwd?: string } = {},
): DocsOnlyGateResult {
  const cwd = options.cwd || process.cwd();
  const paths = changedPaths.map((p) => String(p || "").trim()).filter(Boolean);
  const violations: DocsOnlyGateViolation[] = [];

  if (paths.length === 0) {
    violations.push({
      code: "empty-changed-paths",
      detail: "docs-only gate requires a non-empty changed-path set",
    });
    return { schema: DOCS_ONLY_GATE_SCHEMA, ok: false, changedPaths: paths, violations };
  }

  for (const rel of paths) {
    if (!isMarkdownPath(rel)) {
      violations.push({
        code: "non-markdown-path",
        path: rel,
        detail: `docs-only gate allows Markdown paths only (got ${rel})`,
      });
      continue;
    }
    const abs = resolve(cwd, rel);
    let st;
    try {
      st = statSync(abs);
    } catch (error) {
      violations.push({
        code: "unreadable-path",
        path: rel,
        detail: `cannot read ${rel}: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    if (!st.isFile() || st.size <= 0) {
      violations.push({
        code: "empty-file",
        path: rel,
        detail: `${rel} must be a readable non-empty file`,
      });
      continue;
    }
    if (/(^|\/)AGENTS\.md$/i.test(rel.replaceAll("\\", "/"))) {
      let body = "";
      try {
        body = readFileSync(abs, "utf8");
      } catch (error) {
        violations.push({
          code: "unreadable-path",
          path: rel,
          detail: `cannot read ${rel}: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }
      const missing = missingAgentsCharterHeadings(body);
      for (const heading of missing) {
        violations.push({
          code: "agents-charter-heading-missing",
          path: rel,
          detail: `AGENTS.md missing required charter heading: ${heading}`,
        });
      }
    }
  }

  return {
    schema: DOCS_ONLY_GATE_SCHEMA,
    ok: violations.length === 0,
    changedPaths: paths,
    violations,
  };
}

/** CLI entry: argv after node script are changed paths. */
export function main(argv: readonly string[] = process.argv.slice(2), cwd = process.cwd()): number {
  const result = evaluateDocsOnlyGate(argv, { cwd });
  if (!result.ok) {
    for (const v of result.violations) {
      const loc = v.path ? `${v.path}: ` : "";
      console.error(`docs-only-gate: ${loc}${v.detail}`);
    }
    return 1;
  }
  console.log(`docs-only-gate: ok (${result.changedPaths.length} markdown path(s))`);
  return 0;
}
