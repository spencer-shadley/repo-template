/**
 * repo-template#435 / #452: `process.env.X` dot access is TS4111 under
 * `noPropertyAccessFromIndexSignature` and turned master typecheck red (#434). Lint must refuse it
 * in all repository TypeScript (scripts, tools, packages, tests), so the mistake is caught by
 * `pnpm lint`, not only by a typecheck a land may skip. The rule entry is resolved from the real
 * eslint.config.ts for real files, then run in isolation on in-memory source (hermetic).
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint, Linter } from "eslint";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: root });

function isRuleEntry(value: unknown): value is Linter.RuleEntry {
  return typeof value === "string" || typeof value === "number" || Array.isArray(value);
}

async function restrictedSyntaxFor(relPath: string): Promise<Linter.RuleEntry | undefined> {
  const config: unknown = await eslint.calculateConfigForFile(path.join(root, relPath));
  if (typeof config !== "object" || config === null || !("rules" in config)) return undefined;
  const rules: unknown = config.rules;
  if (typeof rules !== "object" || rules === null) return undefined;
  const entry: unknown = Reflect.get(rules, "no-restricted-syntax");
  return isRuleEntry(entry) ? entry : undefined;
}

function lint(entry: Linter.RuleEntry, code: string): Linter.LintMessage[] {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(code, [
    { languageOptions: { ecmaVersion: "latest", sourceType: "module" }, rules: { "no-restricted-syntax": entry } },
  ]);
}

const TARGETS = [
  "scripts/check-fleet-law-sync.ts",
  "tools/artifact-build.ts",
  "packages/repo-quality/index.ts",
  "packages/adoption-shell/src/index.ts",
  "tests/env-dot-access-lint.test.ts",
];

for (const rel of TARGETS) {
  void test(`process.env dot access is flagged in ${rel}`, async () => {
    const entry = await restrictedSyntaxFor(rel);
    assert.ok(entry, `no-restricted-syntax is not configured for ${rel}`);
    const messages = lint(entry, "const root = process.env.CODE_REPO_ROOT;\n");
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.match(messages[0]?.message ?? "", /repo-template#435/u);
  });
}

void test("bracket access, whole-object use and non-process env stay allowed", async () => {
  const entry = await restrictedSyntaxFor("packages/repo-quality/index.ts");
  assert.ok(entry);
  const ok = [
    'const a = process.env["CODE_REPO_ROOT"];',
    "const env = { ...process.env };",
    "const name = \"X\";",
    "const b = process.env[name];",
    "const other = { env: { X: 1 } };",
    "const c = other.env.X;",
  ].join("\n");
  assert.deepEqual(lint(entry, ok), []);
});
