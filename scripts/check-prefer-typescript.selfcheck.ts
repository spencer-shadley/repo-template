#!/usr/bin/env node
/**
 * Self-check suite for fleet/prefer-typescript ESLint rule.
 *
 * Verifies that:
 * 1. TypeScript files (.ts, .tsx) pass cleanly.
 * 2. JavaScript files (.mjs, .js, .cjs, .jsx) trigger errors unless an explicit justification is present.
 * 3. Valid stack waivers (// @stack-waiver id=... reason="...") pass.
 * 4. Valid tracked GitHub issue comments pass.
 * 5. Inline ESLint configuration comments never waive the rule.
 */
import {
  preferTypeScriptRule,
  noEslintInlineConfigRule,
  fleetPlugin,
  RuleTester,
  typescriptEslint,
} from "@spencer-shadley/repo-quality";

const tester = new RuleTester({
  plugins: {
    fleet: fleetPlugin,
  },
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
});

console.log("[selfcheck] Running fleet/prefer-typescript rule tests...");

tester.run("fleet/prefer-typescript", preferTypeScriptRule, {
  valid: [
    // 1. TypeScript files
    {
      code: "const x: number = 42;\nexport default x;",
      filename: "src/module.ts",
      languageOptions: {
        parser: typescriptEslint.parser,
      },
    },
    {
      code: "export const Component = () => 'Hello';",
      filename: "src/Component.ts",
    },
    // 2. JavaScript files with valid stack-waiver
    {
      code: '// @stack-waiver id=code-bootstrap-cold-start reason="Runs before Node and TypeScript toolchain compatibility has been established."\nconst x = 1;\nexport default x;',
      filename: "bootstrap.mjs",
    },
    // 3. JavaScript files with explicit tracked issue comments
    {
      code: "// TODO gh issue #1234: Legacy script being migrated to TypeScript\nconsole.log('legacy');",
      filename: "legacy-tool.cjs",
    },
    {
      code: "/* TODO(gh#5678): migration in progress */\nconst foo = 'bar';",
      filename: "temp-script.mjs",
    },
  ],
  invalid: [
    // 1. Plain .mjs file without any comments
    {
      code: "export const x = 42;",
      filename: "tools/bad-script.mjs",
      errors: [
        {
          messageId: "preferTypescript",
        },
      ],
    },
    // 2. Plain .js file without any comments
    {
      code: "const a = 1;",
      filename: "src/unwaived.js",
      errors: [
        {
          messageId: "preferTypescript",
        },
      ],
    },
    // 3. Plain .cjs file without comments
    {
      code: "module.exports = {};",
      filename: "tools/unwaived.cjs",
      errors: [
        {
          messageId: "preferTypescript",
        },
      ],
    },
    // 4. File with ordinary non-waiver comment
    {
      code: "// Utility functions\nexport const x = 1;",
      filename: "tools/generic-comment.mjs",
      errors: [
        {
          messageId: "preferTypescript",
        },
      ],
    },
    // 5. File with incomplete stack-waiver (missing reason)
    {
      code: "// @stack-waiver id=incomplete-waiver\nexport const x = 1;",
      filename: "tools/incomplete-waiver.mjs",
      errors: [
        {
          messageId: "preferTypescript",
        },
      ],
    },
    // 6. File with a generic task marker without a GitHub issue number
    {
      code: "// TODO: migrate this file to typescript eventually\nexport const x = 1;",
      filename: "tools/generic-todo.mjs",
      errors: [
        {
          messageId: "preferTypescript",
        },
      ],
    },
    // 7. Unrelated rule disable comment (must not waive prefer-typescript)
    {
      code: "/* eslint-disable no-console -- needed for debugging */\nconsole.log(1);",
      filename: "tools/unrelated-disable.js",
      errors: [
        {
          messageId: "preferTypescript",
        },
      ],
    },
    // 8. Incomplete stack-waiver with empty reason
    {
      code: '// @stack-waiver reason=""\nconst x = 1;',
      filename: "tools/empty-reason-waiver.mjs",
      errors: [
        {
          messageId: "preferTypescript",
        },
      ],
    },
    // 9. A targeted inline directive is not a prefer-typescript waiver.
    {
      code: "/* eslint-disable fleet/prefer-typescript -- TODO gh issue #1690: Flat config root entrypoint */\nexport default [];",
      filename: "eslint.config.mjs",
      errors: [{ messageId: "preferTypescript" }],
    },
  ],
});

tester.run("fleet/no-eslint-inline-config", noEslintInlineConfigRule, {
  valid: [
    {
      code: "// @stack-waiver id=code-bootstrap-cold-start reason=\"Runs before Node and TypeScript toolchain compatibility has been established.\"\nexport default [];",
      filename: "bootstrap.mjs",
    },
  ],
  invalid: [
    {
      code: "/* eslint-disable no-console */\nconsole.log('legacy');",
      filename: "legacy.js",
      errors: [{ messageId: "noInlineConfig" }],
    },
    {
      code: "// eslint no-console: off\nconsole.log('legacy');",
      filename: "legacy.js",
      errors: [{ messageId: "noInlineConfig" }],
    },
  ],
});

console.log("[selfcheck] fleet/prefer-typescript rule tests PASSED cleanly.");
