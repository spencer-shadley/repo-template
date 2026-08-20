/**
 * Starter ESLint flat config for template-bootstrapped repos.
 * Requires the fleet quality gate (eslint.quality.mjs).
 *
 * Copy alongside eslint.quality.mjs. Adjust ignores/globals for your stack.
 * Grandfather existing debt: `pnpm exec eslint . --suppress-all`
 */
import globals from "globals";
import { DEFAULT_FLEET_IGNORES, qualityRules } from "./eslint.quality.mjs";

export default [
  {
    ignores: [
      ...DEFAULT_FLEET_IGNORES,
      // intentional negative fixtures for user-surface lint
      "tests/fixtures/**",
    ],
  },
  ...qualityRules(),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
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
