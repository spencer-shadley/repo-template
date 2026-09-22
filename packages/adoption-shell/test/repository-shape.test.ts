import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  CANONICAL_TURBO_TASKS,
  CORE_PRODUCT_ROOT_FAMILIES,
  FULL_STACK_PROFILE,
  LIBRARY_PROFILE,
  OPTIONAL_ROOT_FAMILIES,
  PORTABLE_ROOT_FAMILIES,
  REPOSITORY_SHAPE_BUNDLE_ID,
  REPOSITORY_SHAPE_CONTRACT_ID,
  STANDALONE_PROFILE,
  SERVICE_PROFILE,
  composeTurboTaskGraph,
  createRepositoryShapeBundle,
  createRepositorySkeletonEntries,
  createTurboJsonContent,
  createTurboJsonPayloadEntry,
  materializeRepositoryShapeEntries,
  resolveRepositoryShapeRoots,
  validateRepositoryProfile,
  validateTurboTaskGraph,
  withRepositoryShapeIdentity,
  type RepositoryProfile,
} from "../src/repository-shape.ts";

import {
  canonicalizeJson,
  materializeAdoptionShellV2,
  validateMaterializerInputV2,
  type MaterializerInput,
} from "../src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function readJson(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8")) as unknown;
}

function isJsonSchema(value: unknown): value is AnySchema {
  return typeof value === "boolean" || (value !== null && typeof value === "object" && !Array.isArray(value));
}

void test("full-stack profile materializes expected root families and omits native", () => {
  const roots = resolveRepositoryShapeRoots(FULL_STACK_PROFILE);
  assert.deepEqual(roots, ["apps", "database", "infrastructure", "packages", "services", "tools"]);
  assert.ok(!roots.includes("native"), "native should be omitted from full-stack profile");

  const skeleton = createRepositorySkeletonEntries(roots, REPOSITORY_SHAPE_BUNDLE_ID);
  const skeletonPaths = skeleton.map((entry) => entry.path);
  assert.deepEqual(skeletonPaths, [
    "apps/.gitkeep",
    "database/.gitkeep",
    "infrastructure/.gitkeep",
    "packages/.gitkeep",
    "services/.gitkeep",
    "tools/.gitkeep",
  ]);

  const allEntries = materializeRepositoryShapeEntries(FULL_STACK_PROFILE, REPOSITORY_SHAPE_BUNDLE_ID);
  const allPaths = allEntries.map((entry) => entry.path);
  assert.deepEqual(allPaths, [
    "apps/.gitkeep",
    "database/.gitkeep",
    "infrastructure/.gitkeep",
    "packages/.gitkeep",
    "services/.gitkeep",
    "tools/.gitkeep",
    "turbo.json",
  ]);
  assert.ok(!allPaths.some((p) => p.startsWith("native/")));
});

void test("library and standalone profiles omit unneeded trees", () => {
  const libraryRoots = resolveRepositoryShapeRoots(LIBRARY_PROFILE);
  assert.deepEqual(libraryRoots, ["packages", "tools"]);
  assert.ok(!libraryRoots.includes("apps"));
  assert.ok(!libraryRoots.includes("services"));
  assert.ok(!libraryRoots.includes("native"));
  assert.ok(!libraryRoots.includes("database"));
  assert.ok(!libraryRoots.includes("infrastructure"));

  const standaloneRoots = resolveRepositoryShapeRoots(STANDALONE_PROFILE);
  assert.deepEqual(standaloneRoots, []);
  const standaloneEntries = materializeRepositoryShapeEntries(STANDALONE_PROFILE);
  assert.deepEqual(standaloneEntries, []);
});

void test("turbo.json task graph enforces canonical dependencies and omits undeclared tasks", () => {
  // Full task graph with build, lint, test, verify
  const fullGraph = composeTurboTaskGraph(["build", "lint", "test", "verify"]);
  assert.deepEqual(fullGraph.tasks["build"], {
    dependsOn: ["^build"],
    outputs: ["dist/**"],
  });
  assert.deepEqual(fullGraph.tasks["lint"], {
    dependsOn: [],
  });
  assert.deepEqual(fullGraph.tasks["test"], {
    dependsOn: ["^build"],
  });
  assert.deepEqual(fullGraph.tasks["verify"], {
    dependsOn: ["build", "lint", "test"],
  });

  // Task graph with lint and verify only
  const lintOnlyGraph = composeTurboTaskGraph(["lint", "verify"]);
  assert.deepEqual(lintOnlyGraph.tasks["lint"], { dependsOn: [] });
  assert.deepEqual(lintOnlyGraph.tasks["verify"], { dependsOn: ["lint"] });
  assert.equal(lintOnlyGraph.tasks["build"], undefined);
  assert.equal(lintOnlyGraph.tasks["test"], undefined);

  // Task graph with test and verify only (no build: test depends on [] not ^build)
  const testNoBuildGraph = composeTurboTaskGraph(["test", "verify"]);
  assert.deepEqual(testNoBuildGraph.tasks["test"], { dependsOn: [] });
  assert.deepEqual(testNoBuildGraph.tasks["verify"], { dependsOn: ["test"] });
  assert.equal(testNoBuildGraph.tasks["build"], undefined);

  // Task graph with extra non-canonical script
  const customGraph = composeTurboTaskGraph(["build", "lint", "typecheck", "verify"]);
  assert.deepEqual(customGraph.tasks["typecheck"], { dependsOn: [] });
  assert.deepEqual(customGraph.tasks["verify"], { dependsOn: ["build", "lint"] });
});

void test("bundle definition contains expected artifacts and task-graph mode", () => {
  const bundle = createRepositoryShapeBundle(FULL_STACK_PROFILE);
  assert.equal(bundle.id, REPOSITORY_SHAPE_BUNDLE_ID);
  assert.equal(bundle.digestAlgorithm, "sha256-rfc8785-v1");
  assert.ok(bundle.artifacts.includes("turbo.json"));
  assert.ok(bundle.artifacts.includes("apps/.gitkeep"));
  assert.ok(!bundle.artifacts.includes("native/.gitkeep"));
  assert.equal(bundle.modes.length, 1);
  assert.equal(bundle.modes[0]?.id, "task-graph");
  assert.equal(bundle.modes[0]?.entrypoint, "turbo.json");
});

void test("validation fails closed on invalid profiles and malformed turbo graphs", () => {
  // Empty profileId
  const emptyProfileId = validateRepositoryProfile(
    withRepositoryShapeIdentity({
      ...FULL_STACK_PROFILE,
      profileId: "",
    }),
  );
  assert.equal(emptyProfileId.ok, false);
  if (!emptyProfileId.ok) {
    assert.ok(emptyProfileId.diagnostics.some((d) => d.pointer === "/profileId"));
  }

  // Invalid profileId format
  const invalidProfileId = validateRepositoryProfile(
    withRepositoryShapeIdentity({
      ...FULL_STACK_PROFILE,
      profileId: "INVALID_PROFILE_NAME",
    }),
  );
  assert.equal(invalidProfileId.ok, false);

  // Duplicate roots
  const duplicateRoots = validateRepositoryProfile(
    withRepositoryShapeIdentity({
      ...FULL_STACK_PROFILE,
      rootFamilies: ["apps", "apps", "services"],
    }),
  );
  assert.equal(duplicateRoots.ok, false);
  if (!duplicateRoots.ok) {
    assert.ok(duplicateRoots.diagnostics.some((d) => d.code === "E_DUPLICATE_ROOT"));
  }

  // Path traversal in root family
  const pathTraversal = validateRepositoryProfile(
    withRepositoryShapeIdentity({
      ...FULL_STACK_PROFILE,
      rootFamilies: ["apps", "../outside" as never],
    }),
  );
  assert.equal(pathTraversal.ok, false);
  if (!pathTraversal.ok) {
    assert.ok(pathTraversal.diagnostics.some((d) => d.code === "E_INVALID_ROOT"));
  }

  // Duplicate declared scripts
  const duplicateScripts = validateRepositoryProfile(
    withRepositoryShapeIdentity({
      ...FULL_STACK_PROFILE,
      declaredScripts: ["build", "build", "lint"],
    }),
  );
  assert.equal(duplicateScripts.ok, false);
  if (!duplicateScripts.ok) {
    assert.ok(duplicateScripts.diagnostics.some((d) => d.code === "E_DUPLICATE_SCRIPT"));
  }

  // Malformed turbo task graph: non-object
  const malformedTurbo = validateTurboTaskGraph("not an object");
  assert.equal(malformedTurbo.ok, false);

  // Malformed turbo task graph: invalid dependsOn
  const invalidTurboDependsOn = validateTurboTaskGraph({
    tasks: {
      build: {
        dependsOn: [123],
      },
    },
  });
  assert.equal(invalidTurboDependsOn.ok, false);
});

void test("RT#348/#355 drift regressions: schema and runtime agree on fail-closed cases", () => {
  const profileSchemaRaw = readJson("contracts/repository-shape/v1/repository-shape.schema.json");
  if (!isJsonSchema(profileSchemaRaw)) throw new TypeError("profile schema must be an object");
  const turboSchemaRaw = readJson("contracts/repository-shape/v1/turbo.schema.json");
  if (!isJsonSchema(turboSchemaRaw)) throw new TypeError("turbo schema must be an object");
  const ajv = new Ajv2020({ allErrors: true, strictSchema: true, strictTypes: false });
  const validateProfileSchema = ajv.compile(profileSchemaRaw);
  const validateTurboSchema = ajv.compile(turboSchemaRaw);

  const cases: Array<{ path: string; kind: "turbo" | "profile" }> = [
    { path: "contracts/repository-shape/v1/fixtures/invalid-turbo-cache-type.json", kind: "turbo" },
    { path: "contracts/repository-shape/v1/fixtures/invalid-turbo-inputs-type.json", kind: "turbo" },
    { path: "contracts/repository-shape/v1/fixtures/invalid-turbo-persistent-type.json", kind: "turbo" },
    { path: "contracts/repository-shape/v1/fixtures/invalid-profile-missing-identity.json", kind: "profile" },
    { path: "contracts/repository-shape/v1/fixtures/invalid-profile-wrong-contract-id.json", kind: "profile" },
    { path: "contracts/repository-shape/v1/fixtures/invalid-profile-declared-scripts-map.json", kind: "profile" },
  ];

  for (const row of cases) {
    const fixture = readJson(row.path);
    if (row.kind === "turbo") {
      assert.equal(validateTurboSchema(fixture), false, row.path);
      const runtime = validateTurboTaskGraph(fixture);
      assert.equal(runtime.ok, false, row.path);
    } else {
      assert.equal(validateProfileSchema(fixture), false, row.path);
      const runtime = validateRepositoryProfile(fixture);
      assert.equal(runtime.ok, false, row.path);
    }
  }

  // Valid fixture still passes both authorities
  const validProfile = readJson("contracts/repository-shape/v1/fixtures/valid-monorepo-profile.json");
  assert.equal(validateProfileSchema(validProfile), true);
  assert.equal(validateRepositoryProfile(validProfile).ok, true);
});

void test("re-materializing identical exact inputs produces identical manifest and output digests", () => {
  const inputRaw = readJson("contracts/adoption-shell-v2/fixtures/monorepo-shape-input.json");
  const validation = validateMaterializerInputV2(inputRaw);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  const input = validation.value;
  const run1 = materializeAdoptionShellV2(input);
  const run2 = materializeAdoptionShellV2(JSON.parse(JSON.stringify(input)));

  assert.equal(run1.manifest.manifestDigest, run2.manifest.manifestDigest);
  assert.equal(run1.manifest.outputPayloadDigest, run2.manifest.outputPayloadDigest);
  assert.equal(canonicalizeJson(run1), canonicalizeJson(run2));

  // Verify skeleton and turbo entries exist in materialized entries
  const paths = run1.entries.map((e) => e.path);
  assert.ok(paths.includes("turbo.json"));
  assert.ok(paths.includes("apps/.gitkeep"));
  assert.ok(paths.includes("services/.gitkeep"));
  assert.ok(paths.includes("packages/.gitkeep"));
  assert.ok(paths.includes("tools/.gitkeep"));
  assert.ok(paths.includes("database/.gitkeep"));
  assert.ok(paths.includes("infrastructure/.gitkeep"));
  assert.ok(!paths.includes("native/.gitkeep"));
});

void test("contracts and schemas validate against JSON Schema 2020-12", () => {
  const profileSchemaRaw = readJson("contracts/repository-shape/v1/repository-shape.schema.json");
  if (!isJsonSchema(profileSchemaRaw)) throw new TypeError("profile schema must be an object");
  const ajv = new Ajv2020({ allErrors: true, strictSchema: true, strictTypes: false });
  const validateProfileSchema = ajv.compile(profileSchemaRaw);

  const validProfileFixture = readJson("contracts/repository-shape/v1/fixtures/valid-monorepo-profile.json");
  const profileValid = validateProfileSchema(validProfileFixture);
  assert.equal(profileValid, true, JSON.stringify(validateProfileSchema.errors));

  const turboSchemaRaw = readJson("contracts/repository-shape/v1/turbo.schema.json");
  if (!isJsonSchema(turboSchemaRaw)) throw new TypeError("turbo schema must be an object");
  const validateTurboSchema = ajv.compile(turboSchemaRaw);

  const validTurboFixture = readJson("contracts/repository-shape/v1/fixtures/valid-turbo.json");
  const turboValid = validateTurboSchema(validTurboFixture);
  assert.equal(turboValid, true, JSON.stringify(validateTurboSchema.errors));

  // Generated full-stack turbo.json must match valid-turbo.json fixture
  const generatedTurbo = composeTurboTaskGraph(FULL_STACK_PROFILE.declaredScripts);
  assert.deepEqual(generatedTurbo, validTurboFixture);
  assert.equal(validateTurboSchema(generatedTurbo), true);
});
