/*
 * @stack-waiver id="quality-kit-js" reason="Git-consumable ESLint factory entrypoint."
 */
/**
 * Fleet quality lint kit — required for every bootstrapped / template-adopted repo.
 *
 * Enforces small files, bounded complexity, and exhaustive bug/style baselines built on
 * battle-tested presets (typescript-eslint, sonarjs, unicorn, @eslint/js).
 *
 * Defaults (workspace-lint-default + task-dag proven gate):
 *   max-lines 500 · max-lines-per-function 80 · complexity 15 · max-depth 4
 *   max-params 5 · max-nested-callbacks 4 · cognitive-complexity 15
 *
 * Adoption:
 * 1. Depend on `@spencer-shadley/repo-quality` from the repo-template Git source.
 * 2. Import `qualityRules()` and `DEFAULT_FLEET_IGNORES` from the kit in `eslint.config.mjs`.
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
import globals from "globals";

// Runtime helpers used by the template's rule self-check. They keep ESLint implementation
// dependencies behind the kit boundary for consumers as well as the starter config.
export { RuleTester } from "eslint";
export const typescriptEslint = tseslint;

/**
 * Module-level regular expressions for prefer-typescript rule performance and precision.
 */
export const STACK_WAIVER_PATTERN =
  /@stack-waiver\s+id=["']?([a-z0-9][a-z0-9-]{2,63})["']?\s+reason=["']([^"'\r\n]{10,240})["']/i;

export const ESLINT_INLINE_CONFIG_PATTERN =
  /^\s*eslint(?:-(?:disable(?:-(?:next|line))?|enable|env|global))?(?:\s|$)/i;

export const ISSUE_TRACKING_PATTERN =
  /\bTODO\b/i;

function hasIssueTrackingReference(text) {
  if (!ISSUE_TRACKING_PATTERN.test(text)) return false;
  const detail = text.slice(text.search(ISSUE_TRACKING_PATTERN) + 4).toLowerCase();
  return (
    detail.includes("github.com/") ||
    detail.includes("gh#") ||
    detail.includes("gh issue") ||
    detail.includes("issue #") ||
    detail.includes("(#")
  );
}

export const JS_FILE_PATTERN = /\.([mc]?js|jsx)$/i;

/** Knip policy shared by every TypeScript/JavaScript consumer. */
export const KNIP_CONFIG = Object.freeze({
  rules: Object.freeze({
    cycles: "error",
  }),
});

/** Return a mutable config copy for tooling that imports rather than reads knip.json. */
export function knipConfig() {
  return {
    rules: { ...KNIP_CONFIG.rules },
  };
}

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
      url: "https://github.com/spencer-shadley/code/blob/master/skills/js-to-ts-migration/SKILL.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
          },
          maxLeadingLine: {
            type: "integer",
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferTypescript:
        "Authored file '{{filename}}' is JavaScript ({{ext}}). All authored source must be TypeScript (.ts / .tsx) per the AI-First Engineering Stack standard (9.1 & 28.2). If this file must remain JavaScript (e.g., bootstrapping or config boundary), provide an explicit justification comment: a @stack-waiver with an id and reason, or a tracked GitHub issue comment.",
    },
  },
  create(context) {
    return {
      Program(node) {
        const filename =
          context.filename ??
          (typeof context.getFilename === "function" ? context.getFilename() : "");
        if (!filename || filename === "<input>" || filename === "<text>") return;

        // Skip virtual/processor files (e.g., markdown code blocks README.md/0_0.js)
        const physicalFilename = context.physicalFilename ?? "";
        if (physicalFilename && filename && physicalFilename !== filename && !JS_FILE_PATTERN.test(physicalFilename)) {
          return;
        }

        const normalized = filename.replace(/\\/g, "/");
        const match = normalized.match(JS_FILE_PATTERN);
        if (!match) return;
        const ext = match[0];

        // Check configurable allowlist
        const options = context.options?.[0] || {};
        const allowList = Array.isArray(options.allow) ? options.allow : [];
        if (
          allowList.some(
            (pattern) =>
              normalized === pattern ||
              normalized.endsWith(pattern) ||
              (pattern.startsWith("*") && normalized.endsWith(pattern.slice(1))) ||
              normalized.includes(pattern),
          )
        ) {
          return;
        }

        const sourceCode =
          context.sourceCode ??
          (typeof context.getSourceCode === "function" ? context.getSourceCode() : null);
        if (!sourceCode) return;

        const comments = sourceCode.getAllComments
          ? sourceCode.getAllComments()
          : (sourceCode.comments ?? []);

        // Restrict waiver/justification comments to the leading file header (default: first 30 lines)
        const maxLeadingLine = typeof options.maxLeadingLine === "number" ? options.maxLeadingLine : 30;
        const hasValidJustification = comments.some((comment) => {
          if (comment.loc && typeof comment.loc.start?.line === "number" && comment.loc.start.line > maxLeadingLine) {
            return false;
          }
          // Normalize JSDoc / multi-line comment text by stripping leading '*' and trimming lines
          const text = comment.value
            .split("\n")
            .map((l) => l.replace(/^\s*\*?\s?/, "").trim())
            .join(" ")
            .trim();
          return (
            !ESLINT_INLINE_CONFIG_PATTERN.test(text) &&
            (STACK_WAIVER_PATTERN.test(text) || hasIssueTrackingReference(text))
          );
        });

        if (!hasValidJustification) {
          const basename = normalized.split("/").pop() || filename;
          context.report({
            node,
            loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
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

/** Custom rule: fleet/no-eslint-inline-config. */
export const noEslintInlineConfigRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow inline ESLint configuration; use eslint-suppressions.json or @stack-waiver instead.",
      recommended: true,
    },
    schema: [],
    messages: {
      noInlineConfig:
        "Inline ESLint configuration is forbidden. Use eslint-suppressions.json for grandfathered lint debt or @stack-waiver for an allowed JavaScript boundary.",
    },
  },
  create(context) {
    const sourceCode =
      context.sourceCode ??
      (typeof context.getSourceCode === "function" ? context.getSourceCode() : null);
    if (!sourceCode) return {};

    return {
      Program() {
        const comments = sourceCode.getAllComments
          ? sourceCode.getAllComments()
          : (sourceCode.comments ?? []);
        for (const comment of comments) {
          const text = comment.value
            .split("\n")
            .map((line) => line.replace(/^\s*\*?\s?/, ""))
            .join("\n");
          if (ESLINT_INLINE_CONFIG_PATTERN.test(text)) {
            context.report({
              loc: comment.loc,
              messageId: "noInlineConfig",
            });
          }
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
    "no-eslint-inline-config": noEslintInlineConfigRule,
  },
  configs: {
    get recommended() {
      return qualityRules();
    },
    get quality() {
      return qualityRules();
    },
  },
};

/**
 * Standard fleet ignores for generated code, build output, vendor, test artifacts, and worktrees.
 */
export const DEFAULT_FLEET_IGNORES = Object.freeze([
  "node_modules/**",
  "**/dist/**",
  "**/build/**",
  "artifacts/**",
  "**/coverage/**",
  "**/vendor/**",
  "**/playwright-report/**",
  "**/test-results/**",
  "**/.worktrees/**",
  "**/worktrees/**",
  "**/.claude/worktrees/**",
  "**/.codex-worktrees/**",
  "**/.local/**",
  "**/.ops/**",
  "**/scratchpad/**",
  "**/scratch/**",
  "**/.scratch/**",
  ".design-sync/**",
  "ds-bundle/**",
]);

/** Standard globals for the starter flat config. */
export const DEFAULT_FLEET_GLOBALS = Object.freeze({
  ...globals.node,
  ...globals.browser,
});

/**
 * @typedef {object} QualityRulesOptions
 * @property {number} [maxLines=500]
 * @property {number} [maxLinesPerFunction=80]
 * @property {number} [maxComplexity=15]
 * @property {number} [maxDepth=4]
 * @property {number} [maxParams=5]
 * @property {number} [maxNestedCallbacks=4]
 * @property {number} [maxCognitiveComplexity=15]
 * @property {boolean} [typescript=true] Include typescript-eslint strict type-checked rules
 * @property {boolean} [exhaustive=true] Extra bug-catching core rules beyond length/complexity
 * @property {boolean} [preferTypescript=true] Enforce TypeScript source files unless waived
 * @property {boolean} [includeDefaultIgnores=true] Prepend default fleet ignore patterns
 * @property {string[]} [ignores=[]] Additional global ignore patterns to prepend
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
    includeDefaultIgnores = true,
    ignores = [],
  } = options;

  const combinedIgnores = [
    ...(includeDefaultIgnores ? DEFAULT_FLEET_IGNORES : []),
    ...(Array.isArray(ignores) ? ignores : []),
  ];

  /** @type {import("eslint").Linter.Config[]} */
  const blocks = [];

  if (combinedIgnores.length > 0) {
    blocks.push({
      ignores: combinedIgnores,
    });
  }

  blocks.push(
    {
      linterOptions: {
        noInlineConfig: true,
        reportUnusedDisableDirectives: "error",
      },
    },
    js.configs.recommended,
    {
      plugins: {
        fleet: fleetPlugin,
      },
      rules: {
        "fleet/prefer-typescript": preferTypescript ? "error" : "off",
        "fleet/no-eslint-inline-config": "error",
      },
    },
  );

  if (typescript) {
    blocks.push(
      ...tseslint.configs.strictTypeChecked,
      {
        files: ["**/*.{ts,tsx,mts,cts}"],
        languageOptions: {
          parserOptions: {
            projectService: true,
          },
        },
        rules: {
          "@typescript-eslint/no-unsafe-type-assertion": "error",
          "@typescript-eslint/switch-exhaustiveness-check": "error",
        },
      },
      {
        files: ["**/*.{js,jsx,mjs,cjs}", "eslint.config.*"],
        ...tseslint.configs.disableTypeChecked,
      },
    );
  }

  blocks.push(
    sonarjs.configs.recommended,
    eslintPluginUnicorn.configs.unopinionated,
  );

  /** @type {Record<string, unknown>} */
  const sizeRules = {
    // Representation-only Unicorn rules. Keep the unopinionated preset's bug and mutation checks.
    "unicorn/consistent-compound-words": "off",
    "unicorn/consistent-existence-index-check": "off",
    "unicorn/consistent-export-decorator-position": "off",
    "unicorn/dom-node-dataset": "off",
    "unicorn/escape-case": "off",
    "unicorn/import-style": "off",
    "unicorn/number-literal-case": "off",
    "unicorn/numeric-separators-style": "off",
    "unicorn/text-encoding-identifier-case": "off",
    "unicorn/relative-url-style": "off",
    "unicorn/no-negated-comparison": "off",
    "unicorn/no-negated-condition": "off",
    "unicorn/prefer-top-level-await": "off",
    "unicorn/prefer-switch": "off",
    "unicorn/prefer-ternary": "off",

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

  blocks.push(
    {
      files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
      rules: sizeRules,
    },
    // Tests: size/complexity noise off; keep bug rules
    {
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
    },
  );

  return blocks;
}

/** Stable id for bootstrap presence checks */
export const QUALITY_LINT_GATE_ID = "repo-template/quality-lint";
export const QUALITY_LINT_GATE_VERSION = "1.0.0";
