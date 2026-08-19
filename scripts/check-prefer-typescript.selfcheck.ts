#!/usr/bin/env node
/* eslint-disable sonarjs/todo-tag -- selfcheck tests TODO comment matching in rule tester */
/**
 * Self-check suite for fleet/prefer-typescript ESLint rule.
 *
 * Verifies that:
 * 1. TypeScript files (.ts, .tsx) pass cleanly.
 * 2. JavaScript files (.mjs, .js, .cjs, .jsx) trigger errors unless an explicit justification is present.
 * 3. Valid stack waivers (// @stack-waiver id=... reason="...") pass.
 * 4. Valid disable comments with reasons (/* eslint-disable ... -- <reason> *\/ or tracked gh issue) pass.
 * 5. Empty disable directives without valid reasons fail.
 */
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
// @ts-expect-error untyped mjs module in selfcheck
import { preferTypeScriptRule, fleetPlugin } from "../eslint.quality.mjs";

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
        parser: tseslint.parser,
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
    // 3. JavaScript files with eslint-disable directive and description
    {
      code: "/* eslint-disable fleet/prefer-typescript -- TODO gh issue #1690: Flat config root entrypoint */\nexport default [];",
      filename: "eslint.config.mjs",
    },
    {
      code: "// eslint-disable-next-line fleet/prefer-typescript -- Bootstrapping script before TS\nconst a = 1;",
      filename: "scripts/bootstrap.js",
    },
    // 4. JavaScript files with explicit TODO tracking issue comment
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
          message:
            "Authored file 'bad-script.mjs' is JavaScript (.mjs). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
        },
      ],
    },
    // 2. Plain .js file without any comments
    {
      code: "const a = 1;",
      filename: "src/unwaived.js",
      errors: [
        {
          message:
            "Authored file 'unwaived.js' is JavaScript (.js). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
        },
      ],
    },
    // 3. Plain .cjs file without comments
    {
      code: "module.exports = {};",
      filename: "tools/unwaived.cjs",
      errors: [
        {
          message:
            "Authored file 'unwaived.cjs' is JavaScript (.cjs). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
        },
      ],
    },
    // 4. File with ordinary non-waiver comment
    {
      code: "// Utility functions\nexport const x = 1;",
      filename: "tools/generic-comment.mjs",
      errors: [
        {
          message:
            "Authored file 'generic-comment.mjs' is JavaScript (.mjs). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
        },
      ],
    },
    // 5. File with incomplete stack-waiver (missing reason)
    {
      code: "// @stack-waiver id=incomplete-waiver\nexport const x = 1;",
      filename: "tools/incomplete-waiver.mjs",
      errors: [
        {
          message:
            "Authored file 'incomplete-waiver.mjs' is JavaScript (.mjs). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
        },
      ],
    },
    // 6. File with generic TODO without gh issue number
    {
      code: "// TODO: migrate this file to typescript eventually\nexport const x = 1;",
      filename: "tools/generic-todo.mjs",
      errors: [
        {
          message:
            "Authored file 'generic-todo.mjs' is JavaScript (.mjs). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
        },
      ],
    },
    // 7. Unrelated rule disable comment (must not waive prefer-typescript)
    {
      code: "/* eslint-disable no-console -- needed for debugging */\nconsole.log(1);",
      filename: "tools/unrelated-disable.js",
      errors: [
        {
          message:
            "Authored file 'unrelated-disable.js' is JavaScript (.js). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
        },
      ],
    },
    // 8. Incomplete stack-waiver with empty reason
    {
      code: '// @stack-waiver reason=""\nconst x = 1;',
      filename: "tools/empty-reason-waiver.mjs",
      errors: [
        {
          message:
            "Authored file 'empty-reason-waiver.mjs' is JavaScript (.mjs). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
        },
      ],
    },
  ],
});

console.log("[selfcheck] fleet/prefer-typescript rule tests PASSED cleanly.");

