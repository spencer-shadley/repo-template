import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyDirective,
  hasFullGithubIssueUrl,
  normalizeCommentLogicalLine,
  parseTodoDirective,
} from "./classify.ts";
import { extractCFamilyComments, extractHashLineComments } from "./extractors.ts";
import { scanTodoIssueLinks } from "./scan.ts";

test("directive grammar accepts TODO: / TODO(...) / TODO - forms case-insensitively", () => {
  for (const sample of [
    "TODO: migrate later",
    "todo - migrate later",
    "TODO(https://github.com/o/r/issues/1): migrate",
    "TODO (owner): note",
  ]) {
    assert.equal(parseTodoDirective(normalizeCommentLogicalLine(sample)).isDirective, true, sample);
  }
  assert.equal(parseTodoDirective(normalizeCommentLogicalLine("see the TODO later in docs")).isDirective, false);
});

test("full GitHub issue URL is required; shorthand and PR/commit/discussion fail", () => {
  const good = classifyDirective(
    parseTodoDirective("TODO(https://github.com/spencer-shadley/repo-template/issues/345): ship"),
  );
  assert.equal(good.ok, true);
  assert.equal(good.linkedIssueUrl, "https://github.com/spencer-shadley/repo-template/issues/345");

  assert.equal(classifyDirective(parseTodoDirective("TODO: migrate later")).reason, "missing-issue-url");
  assert.equal(classifyDirective(parseTodoDirective("TODO gh issue: migrate later")).reason, "shorthand-only");
  assert.equal(classifyDirective(parseTodoDirective("TODO gh#: migrate")).reason, "shorthand-only");
  assert.equal(
    classifyDirective(parseTodoDirective("TODO see github.com/ eventually")).reason,
    "shorthand-only",
  );
  assert.equal(
    classifyDirective(parseTodoDirective("TODO(https://github.com/o/r/pull/9): no")).reason,
    "non-issue-github-url",
  );
  assert.equal(
    classifyDirective(parseTodoDirective("TODO(https://github.com/o/r/commit/abc): no")).reason,
    "non-issue-github-url",
  );
  assert.equal(hasFullGithubIssueUrl("TODO(https://github.com/o/r/issues/2): x"), true);
  assert.equal(hasFullGithubIssueUrl("TODO gh issue 2"), false);
});

test("C-family extractor ignores TODO inside strings and captures block * decoration", () => {
  const source = [
    'const x = "TODO: not a comment";',
    "/*",
    " * TODO: missing url",
    " */",
    "// TODO(https://github.com/o/r/issues/3): ok",
  ].join("\n");
  const spans = extractCFamilyComments(source);
  assert.equal(spans.some((s) => s.text.includes("not a comment")), false);
  const result = scanTodoIssueLinks({
    rootDir: "/tmp",
    paths: [],
  });
  assert.ok(result);
  const normalized = spans.map((s) => normalizeCommentLogicalLine(s.text));
  assert.ok(normalized.some((n) => n.startsWith("TODO: missing")));
});

test("hash-line extractor ignores quoted # and TODO in strings", () => {
  const source = [
    'msg = "TODO: still a string # not comment"',
    "# TODO: needs url",
  ].join("\n");
  const spans = extractHashLineComments(source);
  assert.equal(spans.length, 1);
  assert.match(spans[0]!.text, /TODO: needs url/);
});

test("scan emits machine-readable findings for unlinked TODOs and accepts valid ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "todo-link-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "a.ts"),
      [
        "// TODO: unlinked",
        "// TODO(https://github.com/spencer-shadley/repo-template/issues/345): linked",
        'const s = "TODO: string";',
      ].join("\n"),
      "utf8",
    );
    writeFileSync(join(dir, "src", "b.py"), "# TODO gh issue: migrate later\n", "utf8");
    writeFileSync(join(dir, "README.md"), "Discuss TODO policy here.\n", "utf8");
    const result = scanTodoIssueLinks({
      rootDir: dir,
      repository: "spencer-shadley/repo-template",
    });
    assert.equal(result.schema, "TodoIssueLinkScanResultV1");
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.path.endsWith("a.ts") && f.violationReason === "missing-issue-url"));
    assert.ok(result.findings.some((f) => f.path.endsWith("b.py") && f.violationReason === "shorthand-only"));
    assert.equal(result.findings.some((f) => f.path.endsWith("README.md")), false);
    assert.ok(result.findings.every((f) => f.schema === "TodoIssueLinkFindingV1"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
