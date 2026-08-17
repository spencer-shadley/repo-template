/**
 * Starter ESLint flat config for template-bootstrapped repos.
 * Requires the fleet quality gate (eslint.quality.mjs).
 *
 * Copy alongside eslint.quality.mjs. Adjust ignores/globals for your stack.
 * Grandfather existing debt: `pnpm exec eslint . --suppress-all`
 */
import globals from "globals";
import { qualityRules } from "./eslint.quality.mjs";

export default [
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/vendor/**",
      "**/playwright-report/**",
      "**/test-results/**",
      ".design-sync/**",
      "ds-bundle/**",
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
];
