/* eslint-disable fleet/prefer-typescript, sonarjs/todo-tag -- gh issue #1690: Fleet quality lint factory entrypoint */
/**
 * Fleet quality lint factory — required for every bootstrapped / template-adopted repo.
 *
 * Enforces small files, bounded complexity, and exhaustive bug/style baselines built on
 * battle-tested presets (typescript-eslint, sonarjs, unicorn, @eslint/js).
 *
 * Defaults (workspace-lint-default + task-dag proven gate):
 *   max-lines 500 · max-lines-per-function 80 · complexity 15 · max-depth 4
 *   max-params 5 · max-nested-callbacks 4 · cognitive-complexity 15
 *
 * Adoption:
 * 1. Copy `eslint.quality.mjs` + starter `eslint.config.mjs` from repo-template.
 * 2. pnpm add -D eslint @eslint/js globals typescript-eslint eslint-plugin-sonarjs eslint-plugin-unicorn
 * 3. Wire `lint` to `eslint .` and include it in `verify`.
 * 4. Grandfather debt: `eslint . --suppress-all` → commit `eslint-suppressions.json`
 * 5. Prune over time: `eslint . --prune-suppressions`
 *
 * Tune: qualityRules({ maxLines: 400, maxComplexity: 12 })
 * Pure JS repos: qualityRules({ typescript: false })
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import eslintPluginUnicorn from "eslint-plugin-unicorn";

/**
 * Module-level regular expressions for prefer-typescript rule performance and precision.
 */
export const STACK_WAIVER_PATTERN =
  /@stack-waiver\s+id=["']?([a-z0-9][a-z0-9-]{2,63})["']?\s+reason=["']([^"'\r\n]{10,240})["']/i;

export const ESLINT_DISABLE_PATTERN =
  /(?:eslint-disable(?:-next-line)?)\s+(?:fleet\/)?prefer-typescript\s+--\s+([^\r\n]{8,})/i;

export const ISSUE_TRACKING_PATTERN =
  /\bTODO(?:\s*\((?:gh[#\s]?\d+|#\d+)\)|:?\s+(?:gh\s*issue|issue\s*#|gh#)\s*#?\d+|:?\s+https:\/\/github\.com\/[^\s]+)\s*[:-]?\s+([^\r\n]{6,})/i;

export const JS_FILE_PATTERN = /\.([mc]?js|jsx)$/i;

/**
 * Custom rule: fleet/prefer-typescript
 * Enforces that authored source files must be TypeScript (.ts / .tsx) per the
 * AI-First Engineering Stack standard (9.1 & 28.2). Any .js, .mjs, .cjs, or .jsx
 * file must have an explicit reason/waiver (e.g. @stack-waiver or tracked gh issue comment).
 */
export const preferTypeScriptRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require authored source files to be written in TypeScript (.ts/.tsx) per AI-First Engineering Stack standard unless explicitly justified with a reason or stack waiver.",
      recommended: true,
    },
    schema: [],
    messages: {
      preferTypescript:
        "Authored file '{{filename}}' is JavaScript ({{ext}}). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment (e.g., '// @stack-waiver id=... reason=\"...\"' or '/* eslint-disable fleet/prefer-typescript -- TODO gh issue #X: <reason> */').",
    },
  },
  create(context) {
    return {
      Program(node) {
        const filename =
          context.filename ??
          (typeof context.getFilename === "function" ? context.getFilename() : "");
        if (!filename || filename === "<input>" || filename === "<text>") return;

        const normalized = filename.replace(/\\/g, "/");
        const match = normalized.match(JS_FILE_PATTERN);
        if (!match) return;
        const ext = match[0];

        const sourceCode =
          context.sourceCode ??
          (typeof context.getSourceCode === "function" ? context.getSourceCode() : null);
        if (!sourceCode) return;

        const comments = sourceCode.getAllComments
          ? sourceCode.getAllComments()
          : (sourceCode.comments ?? []);

        const hasValidJustification = comments.some((comment) => {
          const text = comment.value.trim();
          return (
            STACK_WAIVER_PATTERN.test(text) ||
            ESLINT_DISABLE_PATTERN.test(text) ||
            ISSUE_TRACKING_PATTERN.test(text)
          );
        });

        if (!hasValidJustification) {
          const basename = normalized.split("/").pop() || filename;
          context.report({
            node,
            messageId: "preferTypescript",
            data: {
              filename: basename,
              ext,
            },
          });
        }
      },
    };
  },
};

export const fleetPlugin = {
  meta: {
    name: "eslint-plugin-fleet",
    version: "1.0.0",
  },
  rules: {
    "prefer-typescript": preferTypeScriptRule,
  },
};

/**
 * @typedef {object} QualityRulesOptions
 * @property {number} [maxLines=500]
 * @property {number} [maxLinesPerFunction=80]
 * @property {number} [maxComplexity=15]
 * @property {number} [maxDepth=4]
 * @property {number} [maxParams=5]
 * @property {number} [maxNestedCallbacks=4]
 * @property {number} [maxCognitiveComplexity=15]
 * @property {boolean} [typescript=true] Include typescript-eslint strict + stylistic
 * @property {boolean} [exhaustive=true] Extra bug-catching core rules beyond length/complexity
 * @property {boolean} [preferTypescript=true] Enforce TypeScript source files unless waived
 */

/**
 * @param {QualityRulesOptions} [options]
 * @returns {import("eslint").Linter.Config[]}
 */
export function qualityRules(options = {}) {
  const {
    maxLines = 500,
    maxLinesPerFunction = 80,
    maxComplexity = 15,
    maxDepth = 4,
    maxParams = 5,
    maxNestedCallbacks = 4,
    maxCognitiveComplexity = 15,
    typescript = true,
    exhaustive = true,
    preferTypescript = true,
  } = options;

  /** @type {import("eslint").Linter.Config[]} */
  const blocks = [
    js.configs.recommended,
    {
      plugins: {
        fleet: fleetPlugin,
      },
      rules: {
        "fleet/prefer-typescript": preferTypescript ? "error" : "off",
      },
    },
  ];

  if (typescript) {
    blocks.push(...tseslint.configs.strict, ...tseslint.configs.stylistic);
  }

  blocks.push(
    sonarjs.configs.recommended,
    eslintPluginUnicorn.configs.recommended,
  );

  /** @type {Record<string, unknown>} */
  const sizeRules = {
    // Plugin / project compatibility & noise reduction
    "unicorn/logical-assignment-operators": "off",
    "unicorn/no-null": "off",
    "unicorn/filename-case": "off",
    "unicorn/name-replacements": "off",
    "unicorn/prevent-abbreviations": "off",
    "unicorn/import-style": "off",
    "unicorn/explicit-length-check": "off",
    "unicorn/numeric-separators-style": "off",
    "unicorn/no-array-callback-reference": "off",
    "unicorn/consistent-assert": "off",
    "unicorn/prefer-string-raw": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/no-negated-condition": "off",
    "unicorn/catch-error-name": "off",
    "unicorn/consistent-existence-index-check": "off",
    "unicorn/prefer-event-target": "off",
    "unicorn/no-array-push-push": "off",
    "unicorn/number-literal-case": "off",
    "unicorn/prefer-spread": "off",
    "unicorn/no-process-exit": "off",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/prefer-top-level-await": "off",
    "unicorn/relative-url-style": "off",
    "unicorn/prefer-negative-index": "off",
    "unicorn/no-for-loop": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/prefer-at": "off",
    "unicorn/prefer-code-point": "off",
    "unicorn/no-new-array": "off",
    "unicorn/no-array-reduce": "off",
    "unicorn/prefer-structured-clone": "off",
    "unicorn/prefer-node-protocol": "off",
    "unicorn/text-encoding-identifier-case": "off",
    "unicorn/prefer-switch": "off",
    "unicorn/prefer-array-find": "off",
    "unicorn/no-useless-fallback-in-spread": "off",
    "unicorn/no-array-method-this-argument": "off",
    "unicorn/prefer-set-has": "off",
    "unicorn/prefer-type-error": "off",
    "unicorn/prefer-string-slice": "off",
    "unicorn/prefer-includes": "off",
    "unicorn/prefer-string-starts-ends-with": "off",
    "unicorn/prefer-native-coercion-functions": "off",
    "unicorn/no-lonely-if": "off",
    "unicorn/new-for-builtins": "off",
    "unicorn/prefer-export-from": "off",
    "unicorn/prefer-string-replace-all": "off",

    // CLI & process script environment rules
    "sonarjs/no-os-command-from-path": "off",
    "sonarjs/slow-regex": "off",
    "sonarjs/regex-complexity": "off",
    "sonarjs/no-nested-conditional": "off",
    "sonarjs/no-nested-template-literals": "off",
    "sonarjs/concise-regex": "off",
    "sonarjs/publicly-writable-directories": "off",
    "sonarjs/duplicates-in-character-class": "off",
    "sonarjs/no-control-regex": "off",
    "sonarjs/no-unused-vars": "off",
    "sonarjs/os-command": "off",
    "sonarjs/no-invariant-returns": "off",
    "sonarjs/pseudo-random": "off",
    "sonarjs/no-unenclosed-multiline-block": "off",
    "sonarjs/no-misleading-character-class": "off",
    "sonarjs/no-dead-store": "off",
    "sonarjs/code-eval": "off",
    "sonarjs/no-all-duplicated-branches": "off",
    "sonarjs/single-character-alternation": "off",
    "sonarjs/no-extra-arguments": "off",
    "sonarjs/prefer-single-boolean-return": "off",
    "sonarjs/use-type-alias": "off",
    "sonarjs/anchor-precedence": "off",
    "sonarjs/no-hardcoded-passwords": "off",
    "sonarjs/void-use": "off",

    // TypeScript assertions in meta-repo scripts
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-dynamic-delete": "off",
    "@typescript-eslint/no-empty-function": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-for-of": "off",

    // Small-file / complexity ceilings (hard errors)
    "max-lines": ["error", { max: maxLines, skipBlankLines: true, skipComments: true }],
    "max-lines-per-function": [
      "error",
      {
        max: maxLinesPerFunction,
        skipBlankLines: true,
        skipComments: true,
        IIFEs: true,
      },
    ],
    complexity: ["error", { max: maxComplexity }],
    "max-depth": ["error", { max: maxDepth }],
    "max-params": ["error", { max: maxParams }],
    "max-nested-callbacks": ["error", { max: maxNestedCallbacks }],
    "sonarjs/cognitive-complexity": ["error", maxCognitiveComplexity],
  };

  if (exhaustive) {
    Object.assign(sizeRules, {
      // Core correctness / footguns
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-alert": "error",
      "no-extend-native": "error",
      "no-global-assign": "error",
      "no-shadow-restricted-names": "error",
      "no-with": "error",
      "no-constructor-return": "error",
      "no-promise-executor-return": "error",
      "no-unreachable-loop": "error",
      "no-useless-backreference": "error",
      "require-atomic-updates": "error",
      "default-case-last": "error",
      "grouped-accessor-pairs": "error",
      "no-duplicate-imports": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unmodified-loop-condition": "error",
      "no-unused-private-class-members": "error",
      "prefer-promise-reject-errors": "error",
      "symbol-description": "error",
      yoda: ["error", "never"],

      // Async hygiene
      "require-await": "error",
      "no-return-await": "error",
      "no-async-promise-executor": "error",
      "no-await-in-loop": "warn",

      // Security-adjacent
      "no-script-url": "error",
      "no-new-wrappers": "error",
      "no-proto": "error",
      "no-iterator": "error",
      "no-caller": "error",

      // Maintainability extras (small modules)
      "max-classes-per-file": ["error", 1],
      "max-statements": ["warn", { max: 40 }],
    });
  }

  blocks.push({
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    rules: sizeRules,
  });

  // Tests: size/complexity noise off; keep bug rules
  blocks.push({
    files: [
      "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs}",
      "**/__tests__/**",
      "**/tests/**",
      "**/e2e/**",
      "**/fixtures/**",
    ],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "max-statements": "off",
      "max-classes-per-file": "off",
      "max-nested-callbacks": "off",
      complexity: "off",
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-duplicate-string": "off",
      "no-await-in-loop": "off",
      "no-console": "off",
    },
  });

  // Generated / vendor never linted by quality gate consumers (also list in eslint ignores)
  blocks.push({
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/vendor/**",
      "**/.adoption-shell-build/**",
      "**/artifacts/**",
    ],
  });

  return blocks;
}

/** Stable id for bootstrap presence checks */
export const QUALITY_LINT_GATE_ID = "repo-template/quality-lint";
export const QUALITY_LINT_GATE_VERSION = "1.0.0";
