import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyAndMigrateLegacyLocalCiV1,
  LOCAL_CI_CONTRACT_V2_ID,
  LOCAL_CI_CONTRACT_V2_SCHEMA_ID,
  LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION,
  validateLocalCiContractV2,
} from "../src/local-ci-contract-v2.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixturesDir = path.join(root, "contracts", "local-ci", "v2", "fixtures");

function readJsonFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

test("valid LocalCiContractV2 fixture passes validation", () => {
  const validFixture = readJsonFixture("valid-local-ci-v2.json");
  const result = validateLocalCiContractV2(validFixture);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.schemaId, LOCAL_CI_CONTRACT_V2_SCHEMA_ID);
    assert.equal(result.value.schemaVersion, LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION);
    assert.equal(result.value.contractId, LOCAL_CI_CONTRACT_V2_ID);
    assert.equal(result.value.repository, "spencer-shadley/repo-template");
    assert.equal(result.value.canonicalBranch, "master");
    assert.equal(result.value.commands.length, 3);
    assert.equal(result.value.commands[2]?.isAuthoritativeGate, true);
    assert.equal(result.value.environment.networkExpectation, "offline-only");
    assert.equal(result.value.effects.credentialsAccess, false);
    assert.equal(result.value.effects.externalMutation, false);
  }
});

test("all negative V2 contract fixtures fail validation with stable reason codes", () => {
  const cases = [
    { fixture: "invalid-missing-field.json", expectedCode: "E_REQUIRED" },
    { fixture: "invalid-duplicate-command-id.json", expectedCode: "E_DUPLICATE_COMMAND_ID" },
    { fixture: "invalid-no-authoritative-gate.json", expectedCode: "E_NO_AUTHORITATIVE_GATE" },
    { fixture: "invalid-extra-effect.json", expectedCode: "E_UNKNOWN_PROPERTY" },
    { fixture: "invalid-incomplete-env.json", expectedCode: "E_REQUIRED" },
    { fixture: "invalid-unsupported-version.json", expectedCode: "E_CONST" },
    { fixture: "invalid-malformed.json", expectedCode: "E_TYPE" },
  ];

  for (const c of cases) {
    const data = readJsonFixture(c.fixture);
    const result = validateLocalCiContractV2(data);
    assert.equal(result.ok, false, `Expected ${c.fixture} to fail validation`);
    if (!result.ok) {
      const hasCode = result.diagnostics.some((d) => d.code === c.expectedCode);
      assert.equal(
        hasCode,
        true,
        `Expected ${c.fixture} diagnostic codes ${JSON.stringify(result.diagnostics)} to include ${c.expectedCode}`,
      );
    }
  }
});

test("Model Gateway V1 legacy shape is rejected rather than guessing closed V2 evidence", () => {
  const legacyData = readJsonFixture("legacy-model-gateway-v1.json");
  const rawBytes = fs.readFileSync(path.join(fixturesDir, "legacy-model-gateway-v1.json"));
  const disposition = classifyAndMigrateLegacyLocalCiV1(legacyData, rawBytes);

  assert.equal(disposition.disposition, "rejected");
  assert.equal(disposition.legacyLineage, "model-gateway-v1");
  assert.notEqual(disposition.sourceBlobSha256, "");
  assert.equal(disposition.reasonCode, "INCOMPLETE_LEGACY_EVIDENCE");
  assert.equal(disposition.contract, undefined);
});

test("Repo Factory V1 legacy shape is rejected rather than guessing closed V2 evidence", () => {
  const legacyData = readJsonFixture("legacy-repo-factory-v1.json");
  const rawBytes = fs.readFileSync(path.join(fixturesDir, "legacy-repo-factory-v1.json"));
  const disposition = classifyAndMigrateLegacyLocalCiV1(legacyData, rawBytes);

  assert.equal(disposition.disposition, "rejected");
  assert.equal(disposition.legacyLineage, "repo-factory-v1");
  assert.notEqual(disposition.sourceBlobSha256, "");
  assert.equal(disposition.reasonCode, "INCOMPLETE_LEGACY_EVIDENCE");
  assert.equal(disposition.contract, undefined);
});

test("runtime validation rejects every adversarial schema-parity probe", () => {
  const base: any = readJsonFixture("valid-local-ci-v2.json");
  const cases: readonly [string, (value: any) => void, string][] = [
    ["non-string command argument", (v) => { v.commands[0].args = [42]; }, "E_TYPE"],
    ["non-integer expected exit", (v) => { v.commands[0].expectedExitCode = 0.5; }, "E_TYPE"],
    ["non-string environment item", (v) => { v.environment.requiredEnvVars = [42]; }, "E_TYPE"],
    ["duplicate environment item", (v) => { v.environment.supportedPlatforms = ["linux", "linux"]; }, "E_DUPLICATE"],
    ["duplicate command order", (v) => { v.commands[1].order = v.commands[0].order; }, "E_DUPLICATE_COMMAND_ORDER"],
    ["invalid repository grammar", (v) => { v.repository = "not-a-repository"; }, "E_FORMAT"],
  ];
  for (const [name, mutate, code] of cases) {
    const value = structuredClone(base);
    mutate(value);
    const result = validateLocalCiContractV2(value);
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.equal(result.diagnostics.some((d) => d.code === code), true, name);
  }
});

test("legacy boolean-like strings and missing effects never coerce into a migrated contract", () => {
  const legacy: any = readJsonFixture("legacy-model-gateway-v1.json");
  legacy.effects.credentials = "false";
  delete legacy.effects.spend;
  const result = classifyAndMigrateLegacyLocalCiV1(legacy);
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reasonCode, "INCOMPLETE_LEGACY_EVIDENCE");
  assert.equal(result.contract, undefined);
});

test("invalid/malformed legacy shapes fail closed with non-routable disposition", () => {
  const invalidLegacy = readJsonFixture("legacy-invalid-v1.json");
  const disposition = classifyAndMigrateLegacyLocalCiV1(invalidLegacy);

  assert.equal(disposition.disposition, "rejected");
  assert.equal(disposition.legacyLineage, "model-gateway-v1");
  assert.equal(disposition.reasonCode, "INCOMPLETE_LEGACY_EVIDENCE");
  assert.equal(disposition.contract, undefined);
});

test("completely unknown / garbage input fails closed as non-routable", () => {
  const disposition = classifyAndMigrateLegacyLocalCiV1({ randomKey: 123 });
  assert.equal(disposition.disposition, "rejected");
  assert.equal(disposition.legacyLineage, "unknown");
  assert.equal(disposition.reasonCode, "NON_ROUTABLE_DECLARATION");
});
