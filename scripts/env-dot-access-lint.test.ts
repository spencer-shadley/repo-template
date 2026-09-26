/**
 * repo-template#435 prevention: `process.env.X` dot access in repository TypeScript
 * fails `pnpm typecheck` with TS4111 under `noPropertyAccessFromIndexSignature`, and a
 * land that skipped typecheck left master tip-red (#434). ESLint now flags the pattern
 * during `pnpm lint` too. The config is resolved from this repository's real
 * eslint.config.ts; the rule is then run in isolation on in-memory source (hermetic).
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint, Linter } from "eslint";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isRuleEntry(value: unknown): value is Linter.RuleEntry {
  return typeof value === "string" || typeof value === "number" || Array.isArray(value);
}

async function restrictedSyntaxFor(relPath: string): Promise<Linter.RuleEntry | undefined> {
  const eslint = new ESLint({ cwd: root });
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

const TARGETS = ["scripts/check-fleet-law-sync.ts", "tools/artifact-build.ts", "packages/repo-quality/index.ts"];

for (const rel of TARGETS) {
  void test(`process.env dot access is flagged in ${rel}`, async () => {
    const entry = await restrictedSyntaxFor(rel);
    assert.ok(entry, `no-restricted-syntax is not configured for ${rel}`);
    const messages = lint(entry, "const root = process.env.CODE_REPO_ROOT;\n");
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.match(messages[0]?.message ?? "", /process\.env\[/u);
  });
}

void test("bracket access and whole-object use stay allowed", async () => {
  const entry = await restrictedSyntaxFor("scripts/check-fleet-law-sync.ts");
  assert.ok(entry);
  const ok = [
    'const a = process.env["CODE_REPO_ROOT"];',
    "const env = { ...process.env };",
    "const b = process.env[name];",
    "const c = other.env.X;",
  ].join("\n");
  assert.deepEqual(lint(entry, ok), []);
});
