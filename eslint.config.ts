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
  // CLI / scripts / tools: console output is intentional, tools can be large builders
  {
    files: ["scripts/**/*.{js,mjs,cjs,ts}", "tools/**/*.{js,mjs,cjs,ts}"],
    rules: {
      "no-console": "off",
      "max-lines": "off",
      "unicorn/no-exports-in-scripts": "off",
    },
  },
  // Comprehensive schema/contract validators and fixture generators
  {
    files: ["packages/adoption-shell/src/**/*.ts", "tools/**/*.ts"],
    rules: {
      "max-statements": ["warn", 100],
      // RFC 8785 canonical JSON and artifact policies require UTF-16 code unit ordering, forbidding localeCompare
      "sonarjs/no-alphabetical-sort": "off",
      "unicorn/prefer-simple-sort-comparator": "off",
      "unicorn/no-array-sort": "off",
    },
  },
  {
    files: ["packages/adoption-shell/test/**/*.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "sonarjs/no-alphabetical-sort": "off",
      "unicorn/prefer-simple-sort-comparator": "off",
      "unicorn/no-array-sort": "off",
    },
  },
];
