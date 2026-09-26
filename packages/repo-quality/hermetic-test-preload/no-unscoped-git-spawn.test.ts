// repo-template#431 item (1): test code must not spawn Git outside the hermetic helper.
import test from "node:test";
import { RuleTester, typescriptEslint } from "../index.ts";
import { hermeticTestRules, noUnscopedGitSpawnRule } from "./lint.ts";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module", parser: typescriptEslint.parser },
});

const file = "tests/repo.test.ts";

void test("hermetic/no-unscoped-git-spawn", () => {
  tester.run("no-unscoped-git-spawn", noUnscopedGitSpawnRule, {
    valid: [
      {
        filename: file,
        code: 'const h = buildHermeticTestEnvironment();\nexecFileSync("git", ["init"], { cwd: h.root, env: h.env });',
      },
      {
        filename: file,
        code: 'spawnSync("git", ["status"], { env: hermeticEnv });',
      },
      {
        filename: file,
        code: 'cp.execFileSync("git", ["log"], { env: buildHermeticTestEnvironment().env });',
      },
      {
        filename: file,
        code: '// @hermetic-boundary reason="reads the real checkout HEAD on purpose"\nexecFileSync("git", ["rev-parse", "HEAD"]);',
      },
      { filename: file, code: 'execFileSync("node", ["--version"]);' },
      { filename: file, code: 'execSync("github-cli --help");' },
    ],
    invalid: [
      {
        filename: file,
        code: 'execFileSync("git", ["init"], { cwd: dir });',
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
      {
        filename: file,
        code: 'spawnSync("git", ["config", "user.name", "x"]);',
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
      {
        filename: file,
        code: 'child_process.spawn("git", ["commit"], { env: { ...process.env, GIT_DIR: d } });',
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
      {
        filename: file,
        code: 'execSync("git config --global user.email x");',
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
      {
        filename: file,
        code: "execSync(`git -C $" + "{dir} init`);",
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
      {
        filename: file,
        code: '// @hermetic-boundary\nexecFileSync("git", ["init"]);',
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
    ],
  });
});

void test("hermeticTestRules() enables the rule for test files only", () => {
  const blocks = hermeticTestRules();
  const block = blocks.find((b) => b.rules?.["hermetic/no-unscoped-git-spawn"] !== undefined);
  if (!block) throw new Error("hermeticTestRules must enable hermetic/no-unscoped-git-spawn");
  if (block.rules?.["hermetic/no-unscoped-git-spawn"] !== "error") throw new Error("rule must be error");
  if (!block.files?.some((f) => typeof f === "string" && f.includes("test"))) {
    throw new Error("rule must be scoped to test files");
  }
});
