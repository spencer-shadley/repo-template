import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  PRODUCT_SLI_PROBE_CONTRACT_ID,
  PRODUCT_SLI_PROBE_SCHEMA_ID,
  PRODUCT_SLI_PROBE_SCHEMA_VERSION,
  PRODUCT_SLI_OBSERVATION_SCHEMA_ID,
  PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION,
  parsePrioritiesLocalSliTable,
  validateProductSliProbeContractV1,
  validateProductSliObservationV1,
  createProductSliMigrationReceipt,
  type ProductSliObservationV1,
} from "../src/product-sli-probe-v1.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const contractDir = path.join(root, "contracts", "product-sli-probe", "v1");
const fixturesDir = path.join(contractDir, "fixtures");

function isJsonSchema(value: unknown): value is AnySchema {
  return typeof value === "boolean" || (value !== null && typeof value === "object" && !Array.isArray(value));
}

function compileSchema(schemaPath: string): (data: unknown) => boolean {
  const schemaValue: unknown = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  if (!isJsonSchema(schemaValue)) throw new TypeError(`Schema at ${schemaPath} must be an object`);
  const ajv = new Ajv2020({
    allErrors: true,
    strictSchema: true,
    strictTypes: false,
  });
  // @ts-expect-error ajv-formats typing
  addFormats(ajv);
  return ajv.compile(schemaValue);
}

const validateProbeSchema = compileSchema(path.join(contractDir, "product-sli-probe.schema.json"));
const validateObservationSchema = compileSchema(path.join(contractDir, "product-sli-observation.schema.json"));

function readFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

void test("JSON Schemas compile strictly under Ajv 2020", () => {
  assert.equal(typeof validateProbeSchema, "function");
  assert.equal(typeof validateObservationSchema, "function");
});

void test("valid-gmail-read-only fixture satisfies schema and domain validation", () => {
  const fixture = readFixture("valid-gmail-read-only.json");
  const schemaOk = validateProbeSchema(fixture);
  assert.equal(schemaOk, true);

  const result = validateProductSliProbeContractV1(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.value.schemaId, PRODUCT_SLI_PROBE_SCHEMA_ID);
  assert.equal(result.value.schemaVersion, PRODUCT_SLI_PROBE_SCHEMA_VERSION);
  assert.equal(result.value.contractId, PRODUCT_SLI_PROBE_CONTRACT_ID);
  assert.equal(result.value.repository, "spencer-shadley/gmail-markdown");
  assert.equal(result.value.probes.length, 1);
  assert.equal(result.value.probes[0]?.sliId, "sli-draft-preservation");
  assert.equal(result.value.probes[0]?.effects?.effectClass, "fixture-only");
  assert.deepEqual(result.value.probes[0]?.requiredCapabilities, ["browser-fixture", "cdp-read"]);
});

void test("valid-sharingan-read-only fixture satisfies schema and domain validation", () => {
  const fixture = readFixture("valid-sharingan-read-only.json");
  const schemaOk = validateProbeSchema(fixture);
  assert.equal(schemaOk, true);

  const result = validateProductSliProbeContractV1(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.value.schemaId, PRODUCT_SLI_PROBE_SCHEMA_ID);
  assert.equal(result.value.repository, "spencer-shadley/sharingan");
  assert.equal(result.value.probes[0]?.sliId, "sli-media-dry-run-latency");
  assert.equal(result.value.probes[0]?.effects?.effectClass, "read-only");
  assert.equal(result.value.probes[0]?.cadence.freshnessSeconds, 1800);
});

void test("report-only-probe fixture satisfies schema and domain validation", () => {
  const fixture = readFixture("report-only-probe.json");
  const schemaOk = validateProbeSchema(fixture);
  assert.equal(schemaOk, true);

  const result = validateProductSliProbeContractV1(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.value.probes[0]?.kind, "report-only");
  assert.equal(result.value.probes[0]?.disposition?.owner, "security-council");
  assert.equal(result.value.probes[0]?.disposition?.reviewDate, "2026-12-31");
});

void test("product-sli-probe.example.json is valid", () => {
  const example = JSON.parse(fs.readFileSync(path.join(contractDir, "product-sli-probe.example.json"), "utf8"));
  assert.equal(validateProbeSchema(example), true);
  const result = validateProductSliProbeContractV1(example);
  assert.equal(result.ok, true);
});

void test("negative fixtures fail validation with expected diagnostic codes", () => {
  const testCases = [
    { fixture: "invalid-destructive-effect.json", expectedCode: "E_FORBIDDEN_EFFECT" },
    { fixture: "invalid-spend-effect.json", expectedCode: "E_FORBIDDEN_EFFECT" },
    { fixture: "invalid-path-escape.json", expectedCode: "E_PATH_POLICY" },
    { fixture: "invalid-shell-injection.json", expectedCode: "E_SHELL_INJECTION" },
    { fixture: "invalid-duplicate-id.json", expectedCode: "E_DUPLICATE_ID" },
    { fixture: "invalid-missing-required.json", expectedCode: "E_REQUIRED" },
    { fixture: "invalid-unsupported-version.json", expectedCode: "E_CONST" },
  ];

  for (const { fixture, expectedCode } of testCases) {
    const data = readFixture(fixture);
    const result = validateProductSliProbeContractV1(data);
    assert.equal(result.ok, false, `Expected ${fixture} to fail`);
    assert.ok(
      result.diagnostics.some((d) => d.code === expectedCode),
      `Expected ${fixture} to contain diagnostic ${expectedCode}, got: ${JSON.stringify(result.diagnostics)}`,
    );
  }
});

void test("PRIORITIES.md binding validation enforces 1-to-1 active rows", () => {
  const prioritiesContent = `
# Project Priorities

## Fleet inheritance
Inherits P0-P3.

## Local SLI / SLO

| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|---|
| sli-draft-preservation | P1.1 | draft preserved across cut | 100% | active |
| sli-draft-latency | P2.1 | compose latency | < 50ms | draft |
`;

  const validFixture = readFixture("valid-gmail-read-only.json");
  const passResult = validateProductSliProbeContractV1(validFixture, prioritiesContent);
  assert.equal(passResult.ok, true);

  // Active row in PRIORITIES.md not bound in contract fails closed
  const unboundPriorities = prioritiesContent + `| sli-extra-active | P3.1 | extra active metric | 99% | active |\n`;
  const failUnbound = validateProductSliProbeContractV1(validFixture, unboundPriorities);
  assert.equal(failUnbound.ok, false);
  assert.ok(failUnbound.diagnostics.some((d) => d.code === "E_UNBOUND_ACTIVE_ROW"));

  // Probe in contract not declared in PRIORITIES.md fails closed
  const missingRowPriorities = `
## Local SLI / SLO

| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|---|
| _(none yet)_ | — | Use fleet principle SLIs | — | inherit |
`;
  const failMissing = validateProductSliProbeContractV1(validFixture, missingRowPriorities);
  assert.equal(failMissing.ok, false);
  assert.ok(failMissing.diagnostics.some((d) => d.code === "E_UNKNOWN_SLI_ROW"));

  // Principle mismatch fails closed
  const mismatchedPriorities = prioritiesContent.replace("P1.1", "P1.2");
  const failMismatch = validateProductSliProbeContractV1(validFixture, mismatchedPriorities);
  assert.equal(failMismatch.ok, false);
  assert.ok(failMismatch.diagnostics.some((d) => d.code === "E_PRINCIPLE_MISMATCH"));
});

void test("parsePrioritiesLocalSliTable extracts rows and ignores non-table text", () => {
  const md = `
# Repo

## Local SLI / SLO

Intro text.

| ID | Binds principle | SLI (how observed here) | SLO (target) | Status |
|---|---|---|---|---|
| row-1 | P1.1 | measure 1 | 99% | active |
| row-2 | P2.1 | measure 2 | < 100ms | draft |

## Next section
`;
  const rows = parsePrioritiesLocalSliTable(md);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.id, "row-1");
  assert.equal(rows[0]?.bindsPrinciple, "P1.1");
  assert.equal(rows[0]?.status, "active");
  assert.equal(rows[1]?.id, "row-2");
  assert.equal(rows[1]?.status, "draft");
});

void test("validateProductSliObservationV1 accepts valid observation and rejects invalid", () => {
  const validObservation: ProductSliObservationV1 = {
    schemaId: PRODUCT_SLI_OBSERVATION_SCHEMA_ID,
    schemaVersion: PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION,
    contractId: PRODUCT_SLI_PROBE_CONTRACT_ID,
    observationId: "obs-2026-09-13-001",
    repository: "spencer-shadley/gmail-markdown",
    sliId: "sli-draft-preservation",
    observedAt: "2026-09-13T12:00:00Z",
    status: "pass",
    kind: "boolean",
    value: true,
    target: "100%",
    freshness: {
      observedAt: "2026-09-13T12:00:00Z",
      expiresAt: "2026-09-13T13:00:00Z",
      freshnessSeconds: 3600,
    },
    evidence: {
      kind: "cdp-dom-snapshot",
      summary: "Composition state verified after simulated disconnection",
    },
  };

  assert.equal(validateObservationSchema(validObservation), true);
  const result = validateProductSliObservationV1(validObservation);
  assert.equal(result.ok, true);

  const invalidObservation = { ...validObservation, status: "unknown-status" };
  const invalidResult = validateProductSliObservationV1(invalidObservation);
  assert.equal(invalidResult.ok, false);
  assert.ok(invalidResult.diagnostics.some((d) => d.code === "E_ENUM"));
});

void test("createProductSliMigrationReceipt asserts before/after semantic preservation", () => {
  const legacyDefinitions = [
    {
      id: "sli-draft-preservation",
      bindsPrinciple: "P1.1",
      sli: "draft preserved across cut",
      slo: "100%",
    },
  ];

  const prioritiesRows = [
    {
      id: "sli-draft-preservation",
      bindsPrinciple: "P1.1",
      sli: "draft preserved across cut",
      slo: "100%",
      status: "active",
      line: 10,
    },
  ];

  const contract = readFixture("valid-gmail-read-only.json") as Parameters<typeof createProductSliMigrationReceipt>[0]["contract"];

  const receipt = createProductSliMigrationReceipt({
    repository: "spencer-shadley/gmail-markdown",
    legacyDefinitions,
    prioritiesRows,
    contract,
    migratedAt: "2026-09-13T12:00:00Z",
  });

  assert.equal(receipt.provenancePreserved, true);
  assert.equal(receipt.unboundActiveCount, 0);
  assert.equal(receipt.rowsCount, 1);
  assert.equal(receipt.mechanizedProbesCount, 1);
  assert.equal(receipt.reportOnlyProbesCount, 0);
  assert.equal(typeof receipt.beforeSemanticDigest, "string");
  assert.equal(receipt.beforeSemanticDigest.length, 64);
  assert.equal(typeof receipt.afterSemanticDigest, "string");
  assert.equal(receipt.afterSemanticDigest.length, 64);
});
