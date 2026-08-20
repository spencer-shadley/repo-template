// @stack-waiver id="eslint-config" reason="Starter ESLint flat config loaded directly by ESLint CLI"
/**
 * Starter ESLint flat config for template-bootstrapped repos.
 * Depend on the fleet quality kit; do not copy its factory into this repository.
 *
 * Adjust ignores/globals for your stack.
 * Grandfather existing debt: `pnpm exec eslint . --suppress-all`
 */
import {
  DEFAULT_FLEET_GLOBALS,
  DEFAULT_FLEET_IGNORES,
  qualityRules,
} from "@spencer-shadley/repo-quality";

export default [
  {
    ignores: [
      ...DEFAULT_FLEET_IGNORES,
      "artifacts/**",
      // intentional negative fixtures for user-surface lint
      "tests/fixtures/**",
    ],
  },
  ...qualityRules(),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...DEFAULT_FLEET_GLOBALS,
      },
    },
  },
  // CLI / scripts / tools: console output is intentional
  {
    files: ["scripts/**/*.{js,mjs,cjs,ts}", "tools/**/*.{js,mjs,cjs,ts}"],
    rules: {
      "no-console": "off",
    },
  },
  // Comprehensive schema/contract validators and fixture generators have higher statement count
  {
    files: ["packages/adoption-shell/src/**/*.ts", "tools/**/*.ts"],
    rules: {
      "max-statements": ["warn", 100],
    },
  },
];
