import {
  ENVELOPE_DIGEST_ALGORITHM,
  type CapabilityBundle,
  type PayloadEntry,
  type ValidationResult,
} from "./contract.ts";
import { sha256Bytes, sha256CanonicalJson } from "./digest.ts";
import type { RepositoryProfile } from "./repository-shape.ts";
import {
  Diagnostics,
  compareStrings,
  isRecord,
} from "./validation-helpers.ts";

export const TEST_HARNESS_CONTRACT_ID =
  "repo-template/test-harness/v1" as const;
export const TEST_HARNESS_SCHEMA_VERSION = "1.0.0" as const;
export const TEST_HARNESS_SCHEMA_ID =
  "https://schemas.repo-template.dev/test-harness/v1/test-harness.schema.json" as const;
export const TEST_HARNESS_BUNDLE_ID =
  "repo-template/test-harness" as const;
export const TEST_HARNESS_BUNDLE_VERSION = "1.0.0" as const;
export const VITEST_HARNESS_BUNDLE_ID = TEST_HARNESS_BUNDLE_ID;
export const DEFAULT_VITEST_VERSION = "3.0.7" as const;
export const DEFAULT_VITEST_CONFIG_PATH = "vitest.config.ts" as const;
export const DEFAULT_SMOKE_TEST_PATH = "test/smoke.test.ts" as const;

export interface TestHarnessProfile {
  readonly profileId: string;
  readonly monorepo?: boolean;
  readonly rootFamilies?: readonly string[];
  readonly declaredScripts?: readonly string[] | Readonly<Record<string, string>>;
  readonly language?: string;
  readonly testRunner?: string;
  readonly framework?: "vitest";
  readonly configPath?: string;
  readonly smokeTestPath?: string;
  readonly vitestVersion?: string;
}

export interface TestHarnessOptions {
  readonly configPath?: string;
  readonly smokeTestPath?: string;
  readonly vitestVersion?: string;
  readonly language?: string;
  readonly testRunner?: string;
  readonly passWithNoTests?: boolean;
}

export interface TestHarnessConfig {
  readonly $schema?: string;
  readonly schemaId?: string;
  readonly schemaVersion?: string;
  readonly contractId?: string;
  readonly profileId: string;
  readonly framework: "vitest";
  readonly language?: "typescript" | "javascript";
  readonly configPath: string;
  readonly smokeTestPath: string;
  readonly vitestVersion?: string;
  readonly declaredScripts?: readonly string[];
}

const NON_JS_TS_LANGUAGES = new Set([
  "c",
  "cpp",
  "csharp",
  "go",
  "java",
  "kotlin",
  "php",
  "python",
  "ruby",
  "rust",
  "swift",
]);

export function isTestHarnessApplicable(
  profile: RepositoryProfile | TestHarnessProfile,
  options?: TestHarnessOptions,
): boolean {
  const lang = (options?.language ?? (profile as TestHarnessProfile).language)?.toLowerCase();
  if (lang !== undefined && NON_JS_TS_LANGUAGES.has(lang)) {
    return false;
  }

  const runner = options?.testRunner ?? (profile as TestHarnessProfile).testRunner;
  if (runner === "none") {
    return false;
  }

  const scripts = profile.declaredScripts;
  const scriptList = Array.isArray(scripts)
    ? scripts
    : isRecord(scripts)
      ? Object.keys(scripts)
      : [];

  const hasTestScript = scriptList.includes("test");

  if (profile.profileId === "standalone" && !hasTestScript && runner !== "vitest") {
    return false;
  }

  if (runner === "vitest") {
    return true;
  }

  return hasTestScript;
}

function importFrom(clause: string, specifier: string): string {
  return ["import", clause, "from", `${JSON.stringify(specifier)};`].join(" ");
}

export function createVitestConfigContent(options?: TestHarnessOptions): string {
  const passWithNoTests = options?.passWithNoTests ?? true;
  return [
    importFrom("{ defineConfig }", "vitest/config"),
    "",
    "export default defineConfig({",
    "  test: {",
    '    environment: "node",',
    '    include: ["**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],',
    `    passWithNoTests: ${passWithNoTests ? "true" : "false"},`,
    "  },",
    "});",
    "",
  ].join("\n");
}

export function createSmokeTestContent(_options?: TestHarnessOptions): string {
  return [
    importFrom("{ describe, expect, it }", "vitest"),
    "",
    'describe("smoke test", () => {',
    '  it("verifies basic assertions work deterministically", () => {',
    "    expect(1 + 1).toBe(2);",
    "  });",
    "});",
    "",
  ].join("\n");
}

export function mergePackageJsonWithTestHarness(
  packageJson: string | Record<string, unknown>,
  options?: TestHarnessOptions,
): string {
  const parsed: unknown =
    typeof packageJson === "string" ? JSON.parse(packageJson) : packageJson;
  if (!isRecord(parsed)) {
    throw new TypeError("package.json content must be an object");
  }

  const result: Record<string, unknown> = { ...parsed };

  const currentScripts = isRecord(result["scripts"])
    ? { ...result["scripts"] }
    : {};

  if (currentScripts["test"] === undefined) {
    currentScripts["test"] = "vitest run";
  }

  const sortedScripts: Record<string, unknown> = {};
  for (const key of Object.keys(currentScripts).sort(compareStrings)) {
    sortedScripts[key] = currentScripts[key];
  }
  result["scripts"] = sortedScripts;

  const currentDevDeps = isRecord(result["devDependencies"])
    ? { ...result["devDependencies"] }
    : {};

  const vitestVer = options?.vitestVersion ?? DEFAULT_VITEST_VERSION;
  currentDevDeps["vitest"] = vitestVer;

  const sortedDevDeps: Record<string, unknown> = {};
  for (const key of Object.keys(currentDevDeps).sort(compareStrings)) {
    sortedDevDeps[key] = currentDevDeps[key];
  }
  result["devDependencies"] = sortedDevDeps;

  return `${JSON.stringify(result, null, 2)}\n`;
}

export function createVitestConfigPayloadEntry(
  bundleId: string | null = null,
  options?: TestHarnessOptions,
): PayloadEntry {
  const configPath = options?.configPath ?? DEFAULT_VITEST_CONFIG_PATH;
  const content = createVitestConfigContent(options);
  const bytes = Buffer.from(content, "utf8");
  return Object.freeze({
    path: configPath,
    kind: "file",
    mode: "100644",
    contentSha256: sha256Bytes(bytes),
    role: "capability-config",
    encoding: "utf-8",
    bundleId,
    contentBase64: Buffer.from(bytes).toString("base64"),
  });
}

export function createSmokeTestPayloadEntry(
  bundleId: string | null = null,
  options?: TestHarnessOptions,
): PayloadEntry {
  const testPath = options?.smokeTestPath ?? DEFAULT_SMOKE_TEST_PATH;
  const content = createSmokeTestContent(options);
  const bytes = Buffer.from(content, "utf8");
  return Object.freeze({
    path: testPath,
    kind: "file",
    mode: "100644",
    contentSha256: sha256Bytes(bytes),
    role: "capability-executable",
    encoding: "utf-8",
    bundleId,
    contentBase64: Buffer.from(bytes).toString("base64"),
  });
}

export function materializeTestHarnessEntries(
  profile: RepositoryProfile | TestHarnessProfile,
  options?: TestHarnessOptions,
  bundleId: string | null = null,
): readonly PayloadEntry[] {
  if (!isTestHarnessApplicable(profile, options)) {
    return Object.freeze([]);
  }

  const entries: PayloadEntry[] = [
    createSmokeTestPayloadEntry(bundleId, options),
    createVitestConfigPayloadEntry(bundleId, options),
  ];

  return Object.freeze(
    entries.toSorted((left, right) => compareStrings(left.path, right.path)),
  );
}

export function createTestHarnessBundle(
  profile: RepositoryProfile | TestHarnessProfile,
  options?: TestHarnessOptions & {
    id?: string;
    version?: string;
  },
): CapabilityBundle {
  const bundleId = options?.id ?? TEST_HARNESS_BUNDLE_ID;
  const version = options?.version ?? TEST_HARNESS_BUNDLE_VERSION;

  const isApplicable = isTestHarnessApplicable(profile, options);
  const artifacts: string[] = isApplicable
    ? [
        options?.smokeTestPath ?? DEFAULT_SMOKE_TEST_PATH,
        options?.configPath ?? DEFAULT_VITEST_CONFIG_PATH,
      ].sort(compareStrings)
    : [];

  const modes = isApplicable
    ? [
        {
          id: "test",
          entrypoint: options?.configPath ?? DEFAULT_VITEST_CONFIG_PATH,
          requiredPaths: artifacts,
        },
      ]
    : [];

  const bundleBody = {
    id: bundleId,
    version,
    digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    dependencies: [],
    artifacts,
    fixtures: [],
    goldens: [],
    modes,
  };

  return Object.freeze({
    ...bundleBody,
    digest: sha256CanonicalJson(bundleBody),
  });
}

export function composeTestHarnessReleaseEntries(
  profile: RepositoryProfile | TestHarnessProfile,
  baseEntries: readonly PayloadEntry[],
  options?: TestHarnessOptions,
  bundleId: string | null = TEST_HARNESS_BUNDLE_ID,
): readonly PayloadEntry[] {
  if (!isTestHarnessApplicable(profile, options)) {
    return baseEntries;
  }

  const harnessEntries = materializeTestHarnessEntries(profile, options, bundleId);
  const updatedEntries: PayloadEntry[] = [];
  let foundPackageJson = false;

  for (const entry of baseEntries) {
    if (entry.path === "package.json") {
      foundPackageJson = true;
      const rawContent = Buffer.from(entry.contentBase64, "base64").toString("utf8");
      const merged = mergePackageJsonWithTestHarness(rawContent, options);
      const mergedBytes = Buffer.from(merged, "utf8");
      updatedEntries.push(
        Object.freeze({
          ...entry,
          contentSha256: sha256Bytes(mergedBytes),
          contentBase64: Buffer.from(mergedBytes).toString("base64"),
        }),
      );
    } else {
      updatedEntries.push(entry);
    }
  }

  if (!foundPackageJson) {
    const minimalPackageJson = {
      name: profile.profileId,
      version: "0.0.0",
      private: true,
      type: "module",
    };
    const merged = mergePackageJsonWithTestHarness(minimalPackageJson, options);
    const mergedBytes = Buffer.from(merged, "utf8");
    updatedEntries.push(
      Object.freeze({
        path: "package.json",
        kind: "file",
        mode: "100644",
        contentSha256: sha256Bytes(mergedBytes),
        role: "generic-base-text",
        encoding: "utf-8",
        bundleId: null,
        contentBase64: Buffer.from(mergedBytes).toString("base64"),
      }),
    );
  }

  for (const harnessEntry of harnessEntries) {
    updatedEntries.push(harnessEntry);
  }

  return Object.freeze(
    updatedEntries.toSorted((left, right) => compareStrings(left.path, right.path)),
  );
}

function finish<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: rows };
}

function hasValidatedHarness(
  _value: unknown,
  diagnostics: Diagnostics,
): _value is TestHarnessConfig {
  return diagnostics.rows.length === 0;
}

export function validateTestHarnessConfig(
  value: unknown,
): ValidationResult<TestHarnessConfig> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId",
    "schemaVersion",
    "contractId",
    "profileId",
    "framework",
    "configPath",
    "smokeTestPath",
    "language",
    "vitestVersion",
    "declaredScripts",
  ];
  const required = [
    "schemaId",
    "schemaVersion",
    "contractId",
    "profileId",
    "framework",
    "configPath",
    "smokeTestPath",
  ];

  if (!diagnostics.object(value, "", fields, required) || !isRecord(value)) {
    return finish<TestHarnessConfig>(undefined, diagnostics);
  }

  diagnostics.string(value["schemaId"], "/schemaId", {
    constant: TEST_HARNESS_SCHEMA_ID,
  });
  diagnostics.string(value["schemaVersion"], "/schemaVersion", {
    constant: TEST_HARNESS_SCHEMA_VERSION,
  });
  diagnostics.string(value["contractId"], "/contractId", {
    constant: TEST_HARNESS_CONTRACT_ID,
  });
  diagnostics.string(value["profileId"], "/profileId", {
    min: 1,
    max: 80,
    pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  });
  diagnostics.string(value["framework"], "/framework", {
    constant: "vitest",
  });
  diagnostics.string(value["configPath"], "/configPath", {
    min: 1,
    max: 240,
  });
  diagnostics.string(value["smokeTestPath"], "/smokeTestPath", {
    min: 1,
    max: 240,
  });

  if (
    value["language"] !== undefined &&
    value["language"] !== "typescript" &&
    value["language"] !== "javascript"
  ) {
    diagnostics.add(
      "E_ENUM",
      "/language",
      "language must be typescript or javascript",
    );
  }

  if (value["vitestVersion"] !== undefined) {
    diagnostics.string(value["vitestVersion"], "/vitestVersion", {
      pattern: /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
    });
  }

  if (value["declaredScripts"] !== undefined) {
    diagnostics.array(value["declaredScripts"], "/declaredScripts", 0, 64);
  }

  return finish(
    hasValidatedHarness(value, diagnostics) ? value : undefined,
    diagnostics,
  );
}
