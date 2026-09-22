import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AGENTS_CHARTER_HEADINGS,
  evaluateDocsOnlyGate,
  isMarkdownPath,
  missingAgentsCharterHeadings,
} from "./index.ts";

test("RT#422: markdown path helper", () => {
  assert.equal(isMarkdownPath("docs/a.md"), true);
  assert.equal(isMarkdownPath("AGENTS.md"), true);
  assert.equal(isMarkdownPath("src/a.ts"), false);
});

test("RT#422: empty changed paths fail closed", () => {
  const result = evaluateDocsOnlyGate([]);
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, "empty-changed-paths");
});

test("RT#422: non-markdown path fails", () => {
  const result = evaluateDocsOnlyGate(["src/foo.ts"]);
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, "non-markdown-path");
});

test("RT#422: markdown files ok; AGENTS.md requires charter headings", () => {
  const root = mkdtempSync(join(tmpdir(), "rt422-docs-"));
  writeFileSync(join(root, "README.md"), "# hello\n", "utf8");
  writeFileSync(
    join(root, "AGENTS.md"),
    ["# Agent", "", "## Mission", "m", "", "## Responsibilities", "r", "", "## Non-responsibilities", "n", ""].join("\n"),
    "utf8",
  );
  const ok = evaluateDocsOnlyGate(["README.md", "AGENTS.md"], { cwd: root });
  assert.equal(ok.ok, true);

  writeFileSync(join(root, "AGENTS.md"), "# Agent\n\n## Mission\nonly\n", "utf8");
  const bad = evaluateDocsOnlyGate(["AGENTS.md"], { cwd: root });
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some((v) => v.code === "agents-charter-heading-missing"));
  assert.deepEqual(
    missingAgentsCharterHeadings("# Agent\n"),
    [...AGENTS_CHARTER_HEADINGS],
  );
});
