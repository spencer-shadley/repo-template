import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  FULL_STACK_PROFILE,
  LIBRARY_PROFILE,
  SERVICE_PROFILE,
  STANDALONE_PROFILE,
} from "../src/repository-shape.ts";

import {
  DEFAULT_SMOKE_TEST_PATH,
  DEFAULT_VITEST_CONFIG_PATH,
  DEFAULT_VITEST_VERSION,
  TEST_HARNESS_BUNDLE_ID,
  TEST_HARNESS_CONTRACT_ID,
  TEST_HARNESS_SCHEMA_ID,
  TEST_HARNESS_SCHEMA_VERSION,
  VITEST_HARNESS_BUNDLE_ID,
  composeTestHarnessReleaseEntries,
  createSmokeTestContent,
  createTestHarnessBundle,
  createVitestConfigContent,
  isTestHarnessApplicable,
  materializeTestHarnessEntries,
  mergePackageJsonWithTestHarness,
  resolveEffectiveTestHarnessSettings,
  validateTestHarnessConfig,
  type TestHarnessProfile,
} from "../src/test-harness.ts";

import {
  canonicalizeJson,
  materializeAdoptionShellV2,
  validateMaterializerInputV2,
  type PayloadEntry,
} from "../src/index.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

function readJson(relativePath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as unknown;
}

function isJsonSchema(value: unknown): value is AnySchema {
  return (
    typeof value === "boolean" ||
    (value !== null && typeof value === "object" && !Array.isArray(value))
  );
}

void test("full-stack, service, and library profiles materialize expected Vitest harness", () => {
  for (const profile of [FULL_STACK_PROFILE, SERVICE_PROFILE, LIBRARY_PROFILE]) {
    assert.equal(isTestHarnessApplicable(profile), true);
    const entries = materializeTestHarnessEntries(profile, undefined, TEST_HARNESS_BUNDLE_ID);
    assert.equal(entries.length, 2);

    const paths = entries.map((e) => e.path);
    assert.deepEqual(paths, ["test/smoke.test.ts", "vitest.config.ts"]);

    const smokeEntry = entries.find((e) => e.path === "test/smoke.test.ts");
    assert.ok(smokeEntry);
    assert.equal(smokeEntry.role, "capability-executable");
    assert.equal(smokeEntry.bundleId, TEST_HARNESS_BUNDLE_ID);
    assert.equal(smokeEntry.mode, "100644");
    assert.equal(
      Buffer.from(smokeEntry.contentBase64, "base64").toString("utf8"),
      createSmokeTestContent(),
    );

    const configEntry = entries.find((e) => e.path === "vitest.config.ts");
    assert.ok(configEntry);
    assert.equal(configEntry.role, "capability-config");
    assert.equal(configEntry.bundleId, TEST_HARNESS_BUNDLE_ID);
    assert.equal(configEntry.mode, "100644");
    assert.equal(
      Buffer.from(configEntry.contentBase64, "base64").toString("utf8"),
      createVitestConfigContent(),
    );
  }
});

void test("standalone and non-JS/TS profiles omit Vitest machinery", () => {
  // Standalone profile (no test script declared)
  assert.equal(isTestHarnessApplicable(STANDALONE_PROFILE), false);
  const standaloneEntries = materializeTestHarnessEntries(STANDALONE_PROFILE);
  assert.deepEqual(standaloneEntries, []);

  // Python profile declaring test script
  const pythonProfile: TestHarnessProfile = {
    profileId: "python-service",
    declaredScripts: ["test"],
    language: "python",
  };
  assert.equal(isTestHarnessApplicable(pythonProfile), false);
  assert.deepEqual(materializeTestHarnessEntries(pythonProfile), []);

  // Go profile declaring test script
  const goProfile: TestHarnessProfile = {
    profileId: "go-service",
    declaredScripts: ["test"],
    language: "go",
  };
  assert.equal(isTestHarnessApplicable(goProfile), false);
  assert.deepEqual(materializeTestHarnessEntries(goProfile), []);

  // Rust profile declaring test script
  const rustProfile: TestHarnessProfile = {
    profileId: "rust-service",
    declaredScripts: ["test"],
    language: "rust",
  };
  assert.equal(isTestHarnessApplicable(rustProfile), false);
  assert.deepEqual(materializeTestHarnessEntries(rustProfile), []);

  // TypeScript profile without test script
  const tsNoTestProfile: TestHarnessProfile = {
    profileId: "ts-tool",
    declaredScripts: ["build", "lint"],
    language: "typescript",
  };
  assert.equal(isTestHarnessApplicable(tsNoTestProfile), false);
  assert.deepEqual(materializeTestHarnessEntries(tsNoTestProfile), []);

  // Profile with testRunner explicitly set to none
  const noRunnerProfile: TestHarnessProfile = {
    ...FULL_STACK_PROFILE,
    testRunner: "none",
  };
  assert.equal(isTestHarnessApplicable(noRunnerProfile), false);
  assert.deepEqual(materializeTestHarnessEntries(noRunnerProfile), []);
});

void test("mergePackageJsonWithTestHarness non-destructively wires test script and exact-pinned Vitest", () => {
  // Case 1: Minimal package.json with no test script
  const basePkg = JSON.stringify({
    name: "consumer-pkg",
    version: "1.0.0",
    private: true,
    scripts: {
      build: "tsc",
      lint: "eslint .",
    },
  });

  const merged = mergePackageJsonWithTestHarness(basePkg);
  const parsed = JSON.parse(merged) as Record<string, unknown>;
  const scripts = parsed["scripts"] as Record<string, string>;
  const devDeps = parsed["devDependencies"] as Record<string, string>;

  assert.equal(scripts["test"], "vitest run");
  assert.equal(scripts["build"], "tsc");
  assert.equal(scripts["lint"], "eslint .");
  assert.equal(devDeps["vitest"], DEFAULT_VITEST_VERSION);

  // Verify alphabetical ordering of keys
  assert.deepEqual(Object.keys(scripts), ["build", "lint", "test"]);
  assert.deepEqual(Object.keys(devDeps), ["vitest"]);

  // Case 2: Existing test script is preserved non-destructively
  const existingTestPkg = JSON.stringify({
    name: "custom-test-pkg",
    scripts: {
      test: "node --test test/*.test.js",
    },
  });

  const mergedExisting = mergePackageJsonWithTestHarness(existingTestPkg);
  const parsedExisting = JSON.parse(mergedExisting) as Record<string, unknown>;
  const existingScripts = parsedExisting["scripts"] as Record<string, string>;
  assert.equal(existingScripts["test"], "node --test test/*.test.js");
  const existingDevDeps = parsedExisting["devDependencies"] as Record<string, string>;
  assert.equal(existingDevDeps["vitest"], DEFAULT_VITEST_VERSION);

  // Case 3: Custom Vitest version option is respected
  const customVersionMerged = mergePackageJsonWithTestHarness(basePkg, {
    vitestVersion: "3.2.0",
  });
  const parsedCustom = JSON.parse(customVersionMerged) as Record<string, unknown>;
  const customDevDeps = parsedCustom["devDependencies"] as Record<string, string>;
  assert.equal(customDevDeps["vitest"], "3.2.0");

  // Case 4: Invalid package.json throws TypeError
  assert.throws(
    () => mergePackageJsonWithTestHarness("not json"),
    /SyntaxError|Unexpected token/,
  );
  assert.throws(
    () => mergePackageJsonWithTestHarness([1, 2, 3] as unknown as Record<string, unknown>),
    TypeError,
  );
});

void test("bundle definition contains expected artifacts and test mode", () => {
  // Applicable profile
  const bundle = createTestHarnessBundle(FULL_STACK_PROFILE);
  assert.equal(bundle.id, TEST_HARNESS_BUNDLE_ID);
  assert.equal(bundle.version, "1.0.0");
  assert.equal(bundle.digestAlgorithm, "sha256-rfc8785-v1");
  assert.deepEqual(bundle.artifacts, [
    "package.json",
    "test/smoke.test.ts",
    "vitest.config.ts",
  ]);
  assert.equal(bundle.modes.length, 1);
  const [firstMode] = bundle.modes;
  assert.ok(firstMode);
  assert.equal(firstMode.id, "test");
  assert.equal(firstMode.entrypoint, "vitest.config.ts");
  assert.deepEqual(firstMode.requiredPaths, [
    "package.json",
    "test/smoke.test.ts",
    "vitest.config.ts",
  ]);

  // Inapplicable profile
  const standaloneBundle = createTestHarnessBundle(STANDALONE_PROFILE);
  assert.deepEqual(standaloneBundle.artifacts, []);
  assert.deepEqual(standaloneBundle.modes, []);
});

void test("composeTestHarnessReleaseEntries combines base entries and updates package.json", () => {
  const basePackageJson = JSON.stringify({
    name: "my-app",
    version: "0.1.0",
    private: true,
    scripts: {
      verify: "pnpm test",
    },
  });

  const baseEntries: readonly PayloadEntry[] = [
    Object.freeze({
      path: "README.md",
      kind: "file",
      mode: "100644",
      contentSha256: "0".repeat(64),
      role: "generic-base-text",
      encoding: "utf-8",
      bundleId: null,
      contentBase64: Buffer.from("# Readme\n").toString("base64"),
    }),
    Object.freeze({
      path: "package.json",
      kind: "file",
      mode: "100644",
      contentSha256: "1".repeat(64),
      role: "generic-base-text",
      encoding: "utf-8",
      bundleId: null,
      contentBase64: Buffer.from(basePackageJson).toString("base64"),
    }),
  ];

  const composed = composeTestHarnessReleaseEntries(FULL_STACK_PROFILE, baseEntries);
  const paths = composed.map((e) => e.path);
  assert.deepEqual(paths, [
    "README.md",
    "package.json",
    "test/smoke.test.ts",
    "vitest.config.ts",
  ]);

  const updatedPkgEntry = composed.find((e) => e.path === "package.json");
  assert.ok(updatedPkgEntry);
  assert.equal(updatedPkgEntry.bundleId, TEST_HARNESS_BUNDLE_ID);
  const updatedPkg = JSON.parse(
    Buffer.from(updatedPkgEntry.contentBase64, "base64").toString("utf8"),
  ) as Record<string, unknown>;
  const scripts = updatedPkg["scripts"] as Record<string, string>;
  assert.equal(scripts["test"], "vitest run");
  assert.equal(scripts["verify"], "pnpm test");

  // For inapplicable profile, base entries remain untouched
  const untouched = composeTestHarnessReleaseEntries(STANDALONE_PROFILE, baseEntries);
  assert.deepEqual(untouched, baseEntries);
});

void test("re-materializing identical exact inputs produces identical manifest and output digests", () => {
  const inputRaw = readJson(
    "contracts/adoption-shell-v2/fixtures/test-harness-input.json",
  );
  const validation = validateMaterializerInputV2(inputRaw);
  if (!validation.ok) {
    assert.fail(JSON.stringify(validation.diagnostics));
  }

  const input = validation.value;
  const run1 = materializeAdoptionShellV2(input);
  const run2 = materializeAdoptionShellV2(structuredClone(input));

  assert.equal(run1.manifest.manifestDigest, run2.manifest.manifestDigest);
  assert.equal(run1.manifest.outputPayloadDigest, run2.manifest.outputPayloadDigest);
  assert.equal(canonicalizeJson(run1), canonicalizeJson(run2));

  // Verify test-harness entries exist in materialized entries
  const paths = new Set(run1.entries.map((e) => e.path));
  assert.ok(paths.has("vitest.config.ts"));
  assert.ok(paths.has("test/smoke.test.ts"));
  assert.ok(paths.has("package.json"));
  assert.ok(paths.has("README.md"));
});

void test("contracts and schemas validate against JSON Schema 2020-12", () => {
  const schemaRaw = readJson(
    "contracts/test-harness/v1/test-harness.schema.json",
  );
  if (!isJsonSchema(schemaRaw)) {
    throw new TypeError("test-harness schema must be an object");
  }
  const ajv = new Ajv2020({
    allErrors: true,
    strictSchema: true,
    strictTypes: false,
  });
  const validateSchema = ajv.compile(schemaRaw);

  const validFixture = readJson(
    "contracts/test-harness/v1/fixtures/valid-vitest-harness.json",
  );
  const isValid = validateSchema(validFixture);
  assert.equal(isValid, true, JSON.stringify(validateSchema.errors));

  const invalidFixture = readJson(
    "contracts/test-harness/v1/fixtures/invalid-test-harness.json",
  );
  const isInvalid = validateSchema(invalidFixture);
  assert.equal(isInvalid, false);
});

void test("smoke test content is deterministic and runnable", () => {
  const smokeContent = createSmokeTestContent();
  assert.ok(smokeContent.includes('import { describe, expect, it } from "vitest";'));
  assert.ok(smokeContent.includes('expect(1 + 1).toBe(2);'));

  const configContent = createVitestConfigContent();
  assert.ok(configContent.includes('import { defineConfig } from "vitest/config";'));
  assert.ok(configContent.includes("passWithNoTests: true"));
});

void test("validateTestHarnessConfig validates valid and rejects malformed configs", () => {
  const validConfig = {
    schemaId: TEST_HARNESS_SCHEMA_ID,
    schemaVersion: TEST_HARNESS_SCHEMA_VERSION,
    contractId: TEST_HARNESS_CONTRACT_ID,
    profileId: "full-stack",
    framework: "vitest",
    language: "typescript",
    configPath: DEFAULT_VITEST_CONFIG_PATH,
    smokeTestPath: DEFAULT_SMOKE_TEST_PATH,
    vitestVersion: DEFAULT_VITEST_VERSION,
    declaredScripts: ["build", "lint", "test", "verify"],
  };

  const validResult = validateTestHarnessConfig(validConfig);
  assert.equal(validResult.ok, true);

  // Missing required field
  const missingFieldResult = validateTestHarnessConfig({
    schemaId: TEST_HARNESS_SCHEMA_ID,
    schemaVersion: TEST_HARNESS_SCHEMA_VERSION,
    contractId: TEST_HARNESS_CONTRACT_ID,
    profileId: "full-stack",
  });
  assert.equal(missingFieldResult.ok, false);

  // Invalid framework
  const invalidFrameworkResult = validateTestHarnessConfig({
    ...validConfig,
    framework: "jest",
  });
  assert.equal(invalidFrameworkResult.ok, false);

  // Invalid language
  const invalidLangResult = validateTestHarnessConfig({
    ...validConfig,
    language: "python",
  });
  assert.equal(invalidLangResult.ok, false);

  // Alias export check
  assert.equal(VITEST_HARNESS_BUNDLE_ID, TEST_HARNESS_BUNDLE_ID);
});

void test("unknown, custom, and non-JS/TS languages emit no harness bytes", () => {
  for (const lang of ["zig", "custom", "python", "rust", "go", "c", "ruby", "java"]) {
    const profile: TestHarnessProfile = {
      profileId: "custom-repo",
      language: lang,
      declaredScripts: ["test"],
    };
    assert.equal(isTestHarnessApplicable(profile), false);
    assert.deepEqual(materializeTestHarnessEntries(profile), []);
    assert.deepEqual(createTestHarnessBundle(profile).artifacts, []);
  }

  // Explicit typescript and javascript are accepted
  for (const lang of ["typescript", "javascript", "TypeScript", "JAVASCRIPT"]) {
    const profile: TestHarnessProfile = {
      profileId: "custom-repo",
      language: lang,
      declaredScripts: ["test"],
    };
    assert.equal(isTestHarnessApplicable(profile), true);
    assert.equal(materializeTestHarnessEntries(profile).length, 2);
  }
});

void test("validateTestHarnessConfig validates $schema, bounds, and declaredScripts uniqueness and patterns", () => {
  const baseValid: Record<string, unknown> = {
    $schema: "https://schemas.repo-template.dev/test-harness/v1/test-harness.schema.json",
    schemaId: TEST_HARNESS_SCHEMA_ID,
    schemaVersion: TEST_HARNESS_SCHEMA_VERSION,
    contractId: TEST_HARNESS_CONTRACT_ID,
    profileId: "full-stack",
    framework: "vitest",
    configPath: DEFAULT_VITEST_CONFIG_PATH,
    smokeTestPath: DEFAULT_SMOKE_TEST_PATH,
  };

  // Canonical $schema is accepted
  const withSchema = validateTestHarnessConfig(baseValid);
  assert.equal(withSchema.ok, true);

  // declaredScripts with valid unique strings passes
  const withValidScripts = validateTestHarnessConfig({
    ...baseValid,
    declaredScripts: ["build", "lint", "test", "verify"],
  });
  assert.equal(withValidScripts.ok, true);

  // declaredScripts with duplicate fails with E_UNIQUE
  const withDuplicateScripts = validateTestHarnessConfig({
    ...baseValid,
    declaredScripts: ["test", "lint", "test"],
  });
  assert.equal(withDuplicateScripts.ok, false);
  assert.ok(withDuplicateScripts.diagnostics.some((d) => d.code === "E_UNIQUE"));

  // declaredScripts with invalid pattern fails with E_PATTERN
  const withPatternFail = validateTestHarnessConfig({
    ...baseValid,
    declaredScripts: ["test with spaces!"],
  });
  assert.equal(withPatternFail.ok, false);
  assert.ok(withPatternFail.diagnostics.some((d) => d.code === "E_PATTERN"));

  // declaredScripts with non-string item fails with E_TYPE
  const withTypeFail = validateTestHarnessConfig({
    ...baseValid,
    declaredScripts: [123],
  });
  assert.equal(withTypeFail.ok, false);
  assert.ok(withTypeFail.diagnostics.some((d) => d.code === "E_TYPE"));
});

void test("profile-declared settings and options override precedence", () => {
  const customProfile: TestHarnessProfile = {
    profileId: "custom-profile",
    language: "typescript",
    declaredScripts: ["test"],
    configPath: "custom/vitest.config.ts",
    smokeTestPath: "test/unit/smoke.spec.ts",
    vitestVersion: "3.2.1",
  };

  // Effective settings resolved from profile
  const resolved = resolveEffectiveTestHarnessSettings(customProfile);
  assert.equal(resolved.configPath, "custom/vitest.config.ts");
  assert.equal(resolved.smokeTestPath, "test/unit/smoke.spec.ts");
  assert.equal(resolved.vitestVersion, "3.2.1");

  // Materialize entries honor profile settings
  const entries = materializeTestHarnessEntries(customProfile);
  assert.deepEqual(
    entries.map((e) => e.path),
    ["custom/vitest.config.ts", "test/unit/smoke.spec.ts"],
  );

  // Bundle honors profile settings
  const bundle = createTestHarnessBundle(customProfile);
  assert.deepEqual(bundle.artifacts, [
    "custom/vitest.config.ts",
    "package.json",
    "test/unit/smoke.spec.ts",
  ]);

  // Options override profile settings
  const overrideOptions = {
    configPath: "override/vitest.config.ts",
    smokeTestPath: "override/smoke.test.ts",
    vitestVersion: "3.9.9",
  };
  const overridden = resolveEffectiveTestHarnessSettings(customProfile, overrideOptions);
  assert.equal(overridden.configPath, "override/vitest.config.ts");
  assert.equal(overridden.smokeTestPath, "override/smoke.test.ts");
  assert.equal(overridden.vitestVersion, "3.9.9");

  const overrideEntries = materializeTestHarnessEntries(customProfile, overrideOptions);
  assert.deepEqual(
    overrideEntries.map((e) => e.path),
    ["override/smoke.test.ts", "override/vitest.config.ts"],
  );
});

void test("composeTestHarnessReleaseEntries preserves existing target paths without duplicates", () => {
  const existingConfig: PayloadEntry = Object.freeze({
    path: "vitest.config.ts",
    kind: "file",
    mode: "100644",
    contentSha256: "2".repeat(64),
    role: "capability-config",
    encoding: "utf-8",
    bundleId: TEST_HARNESS_BUNDLE_ID,
    contentBase64: Buffer.from("// custom existing config\n").toString("base64"),
  });

  const existingSmoke: PayloadEntry = Object.freeze({
    path: "test/smoke.test.ts",
    kind: "file",
    mode: "100644",
    contentSha256: "3".repeat(64),
    role: "capability-executable",
    encoding: "utf-8",
    bundleId: TEST_HARNESS_BUNDLE_ID,
    contentBase64: Buffer.from("// custom existing smoke test\n").toString("base64"),
  });

  const baseWithExisting: readonly PayloadEntry[] = [
    existingConfig,
    existingSmoke,
  ];

  const composed = composeTestHarnessReleaseEntries(FULL_STACK_PROFILE, baseWithExisting);
  // Preserved exactly, no duplicate entries appended
  assert.equal(composed.length, 3); // vitest.config.ts, test/smoke.test.ts, package.json
  const configEntry = composed.find((e) => e.path === "vitest.config.ts");
  assert.ok(configEntry);
  assert.equal(configEntry.contentSha256, "2".repeat(64));
  const smokeEntry = composed.find((e) => e.path === "test/smoke.test.ts");
  assert.ok(smokeEntry);
  assert.equal(smokeEntry.contentSha256, "3".repeat(64));
});

void test("empty-bundle materialization leaves no Vitest machinery or package residue", () => {
  const fixture = readJson("contracts/adoption-shell-v2/fixtures/test-harness-input.json") as Record<string, unknown>;
  // Request empty bundle list (test-harness not requested)
  const unrequestedInput = {
    ...fixture,
    requestedBundles: [],
  };

  const materialized = materializeAdoptionShellV2(unrequestedInput);
  // No vitest files, and package.json has not survived as unbundled orphan
  assert.equal(materialized.entries.some((e) => e.path === "vitest.config.ts"), false);
  assert.equal(materialized.entries.some((e) => e.path === "test/smoke.test.ts"), false);
  assert.equal(materialized.entries.some((e) => e.path === "package.json"), false);
  assert.equal(materialized.manifest.selectedBundles.length, 0);
});
