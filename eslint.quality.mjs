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
  } = options;

  /** @type {import("eslint").Linter.Config[]} */
  const blocks = [
    js.configs.recommended,
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
    // Plugin / project compatibility (same set as task-dag proven gate)
    "unicorn/logical-assignment-operators": "off",
    "unicorn/no-null": "off",
    "unicorn/filename-case": "off",
    "unicorn/name-replacements": "off",

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
