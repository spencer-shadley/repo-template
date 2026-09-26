/**
 * repo-template#435: `process.env.X` dot access under `noPropertyAccessFromIndexSignature`
 * is TS4111 and turned master typecheck red (#434). Lint must refuse it in scripts/tools
 * so the mistake is caught by `pnpm lint`, not only by a typecheck a land may skip.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

// Virtual .mjs path: a .ts path not on disk is rejected by the typed project service.
const eslint = new ESLint();

async function envRuleMessages(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: "scripts/env-dot-access-probe.mjs" });
  assert.ok(result);
  return result.messages
    .filter((m) => m.ruleId === "no-restricted-syntax")
    .map((m) => m.message);
}

void test("process.env dot access in scripts is refused", async () => {
  const messages = await envRuleMessages('console.log(process.env.CODE_REPO_ROOT ?? "");\n');
  assert.equal(messages.length, 1);
  assert.match(messages[0] ?? "", /repo-template#435/);
});

void test("process.env bracket access in scripts is allowed", async () => {
  const messages = await envRuleMessages('console.log(process.env["CODE_REPO_ROOT"] ?? "");\n');
  assert.deepEqual(messages, []);
});
