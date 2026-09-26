// repo-template#431: the hermetic-test preload must be typechecked and linted like
// the rest of repo-quality, not carried behind the eslint tip-green ignore (#433).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string): string =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

void test("repo-quality tsconfig includes the hermetic-test-preload sources", () => {
  const parsed: unknown = JSON.parse(read("packages/repo-quality/tsconfig.json"));
  const include =
    typeof parsed === "object" && parsed !== null && "include" in parsed ? parsed.include : [];
  assert.ok(Array.isArray(include));
  assert.ok(include.includes("./hermetic-test-preload/*.ts"));
});

void test("eslint no longer ignores the hermetic-test-preload tree", () => {
  assert.doesNotMatch(read("eslint.config.ts"), /packages\/repo-quality\/hermetic-test-preload\//);
});

void test("seeded eslint config enables the hermetic-test lint by default (#431 item 3)", () => {
  const config = read("eslint.config.ts");
  assert.match(config, /from "@spencer-shadley\/repo-quality\/hermetic-test-preload\/lint"/);
  assert.match(config, /\.\.\.hermeticTestRules\(\)/);
});

void test("consumer install docs pin repo-quality to a commit carrying the hermetic lint", () => {
  assert.match(
    read("docs/QUALITY-LINT.md"),
    /github:spencer-shadley\/repo-template#[0-9a-f]{40}&path:packages\/repo-quality/,
  );
});
