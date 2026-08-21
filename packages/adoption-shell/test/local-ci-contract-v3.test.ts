import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  LOCAL_CI_CONTRACT_V3_ID,
  LOCAL_CI_CONTRACT_V3_SCHEMA_ID,
  LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION,
  classifyAndMigrateLocalCiV2ToV3,
  orderedLocalCiCommandsV3,
  validateLocalCiContractV3,
} from "../src/local-ci-contract-v3.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixturesDir = path.join(root, "contracts", "local-ci", "v3", "fixtures");
function isJsonSchema(value: unknown): value is AnySchema {
  return typeof value === "boolean" || (value !== null && typeof value === "object" && !Array.isArray(value));
}

const schemaValue: unknown = JSON.parse(
  fs.readFileSync(path.join(root, "contracts", "local-ci", "v3", "local-ci-contract-v3.schema.json"), "utf8"),
);
if (!isJsonSchema(schemaValue)) throw new TypeError("local-ci v3 schema must be an object or boolean");
const schema = schemaValue;
const validateSchema = new Ajv2020({
  allErrors: true,
  strictSchema: true,
  strictTypes: false,
}).compile(schema);

function readJsonFixture(dir: string, name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
}

function readV3Fixture(name: string): unknown {
  return readJsonFixture(fixturesDir, name);
}

void test("valid LocalCiContractV3 fixture passes validation and carries detectionProof", () => {
  const validFixture = readV3Fixture("valid-local-ci-v3.json");
  const result = validateLocalCiContractV3(validFixture);
  assert.equal(result.ok, true);
  assert.equal(result.value.schemaId, LOCAL_CI_CONTRACT_V3_SCHEMA_ID);
  assert.equal(result.value.schemaVersion, LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION);
  assert.equal(result.value.contractId, LOCAL_CI_CONTRACT_V3_ID);
  assert.deepEqual(Object.keys(result.value.commands).toSorted((left, right) => left.localeCompare(right)), ["authoritative-gate", "lint", "typecheck"]);
  assert.deepEqual(
    orderedLocalCiCommandsV3(result.value).map(({ id, order, isAuthoritativeGate }) => ({
      id,
      order,
      isAuthoritativeGate,
    })),
    [
      { id: "lint", order: 0, isAuthoritativeGate: false },
      { id: "typecheck", order: 1, isAuthoritativeGate: false },
      { id: "authoritative-gate", order: 2, isAuthoritativeGate: true },
    ],
  );
  assert.equal(result.value.commands["lint"]?.detectionProof.fixture?.path, "tests/fixtures/proof-of-detection/lint-known-bad.ts");
  assert.equal(result.value.commands["typecheck"]?.detectionProof.exempt !== undefined, true);
});

void test("all negative V3 contract fixtures fail validation with stable reason codes", () => {
  const cases = [
    { fixture: "invalid-missing-field.json", expectedCode: "E_REQUIRED" },
    { fixture: "invalid-duplicate-command-id.json", expectedCode: "E_TYPE" },
    { fixture: "invalid-no-authoritative-gate.json", expectedCode: "E_NO_AUTHORITATIVE_GATE" },
    { fixture: "invalid-extra-effect.json", expectedCode: "E_UNKNOWN_PROPERTY" },
    { fixture: "invalid-incomplete-env.json", expectedCode: "E_REQUIRED" },
    { fixture: "invalid-unsupported-version.json", expectedCode: "E_CONST" },
    { fixture: "invalid-malformed.json", expectedCode: "E_TYPE" },
    { fixture: "invalid-missing-detection-proof.json", expectedCode: "E_REQUIRED" },
    { fixture: "invalid-detection-proof-conflict.json", expectedCode: "E_DETECTION_PROOF_CONFLICT" },
    { fixture: "invalid-detection-proof-empty-exempt.json", expectedCode: "E_LENGTH" },
  ];

  for (const c of cases) {
    const data = readV3Fixture(c.fixture);
    const result = validateLocalCiContractV3(data);
    assert.equal(result.ok, false, `Expected ${c.fixture} to fail validation`);
    const hasCode = result.diagnostics.some((d) => d.code === c.expectedCode);
    assert.equal(
      hasCode,
      true,
      `Expected ${c.fixture} diagnostic codes ${JSON.stringify(result.diagnostics)} to include ${c.expectedCode}`,
    );
  }
});

void test("published V3 schema and runtime agree on every committed non-legacy fixture", () => {
  const fixtures = fs.readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".json") && !name.startsWith("legacy-"))
    .toSorted((left, right) => left.localeCompare(right));
  for (const fixture of fixtures) {
    const value = readV3Fixture(fixture);
    assert.equal(
      validateSchema(value),
      validateLocalCiContractV3(value).ok,
      fixture,
    );
  }
});

void test("a valid V3 declaration classifies as valid-v3 with no migration needed", () => {
  const value = readV3Fixture("valid-local-ci-v3.json");
  const disposition = classifyAndMigrateLocalCiV2ToV3(value);
  assert.equal(disposition.disposition, "valid-v3");
  assert.equal(disposition.legacyLineage, "none");
  assert.notEqual(disposition.sourceBlobSha256, "");
});

void test("a valid but unmigrated V2 declaration is rejected with an actionable per-command list, never silently defaulted", () => {
  const value = readV3Fixture("legacy-local-ci-v2.json");
  const rawBytes = fs.readFileSync(path.join(fixturesDir, "legacy-local-ci-v2.json"));
  const disposition = classifyAndMigrateLocalCiV2ToV3(value, rawBytes);
  assert.equal(disposition.disposition, "rejected");
  assert.equal(disposition.legacyLineage, "local-ci-v2");
  assert.equal(disposition.reasonCode, "MISSING_DETECTION_PROOF");
  assert.deepEqual(disposition.commandsMissingDetectionProof, ["authoritative-gate", "lint"]);
  assert.equal(disposition.contract, undefined);
});

void test("Model Gateway V1 legacy shape still fails closed through the V3 classifier", () => {
  const legacyPath = path.join(root, "contracts", "local-ci", "v2", "fixtures", "legacy-model-gateway-v1.json");
  const legacyData = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
  const disposition = classifyAndMigrateLocalCiV2ToV3(legacyData, fs.readFileSync(legacyPath));
  assert.equal(disposition.disposition, "rejected");
  assert.equal(disposition.legacyLineage, "model-gateway-v1");
  assert.equal(disposition.reasonCode, "INCOMPLETE_LEGACY_EVIDENCE");
});

void test("completely unknown input fails closed as non-routable rather than guessing", () => {
  const disposition = classifyAndMigrateLocalCiV2ToV3({ randomKey: 123 });
  assert.equal(disposition.disposition, "rejected");
  assert.equal(disposition.legacyLineage, "unknown");
  assert.equal(disposition.reasonCode, "NON_ROUTABLE_DECLARATION");
});

void test("runtime validation rejects adversarial detectionProof shapes the schema also rejects", () => {
  const base: any = readV3Fixture("valid-local-ci-v3.json");
  const cases: readonly [string, (value: any) => void][] = [
    ["neither fixture nor exempt", (v) => { v.commands.lint.detectionProof = {}; }],
    ["unknown detectionProof key", (v) => { v.commands.lint.detectionProof = { unexpected: true }; }],
    ["fixture missing description", (v) => {
      v.commands.lint.detectionProof = { fixture: { path: "x", expectation: "non-zero-exit" } };
    }],
  ];
  for (const [name, mutate] of cases) {
    const value = structuredClone(base);
    mutate(value);
    const schemaAccepted = validateSchema(value);
    const runtimeAccepted = validateLocalCiContractV3(value).ok;
    assert.equal(schemaAccepted, runtimeAccepted, name);
    assert.equal(runtimeAccepted, false, `${name} must be non-routable`);
  }
});
