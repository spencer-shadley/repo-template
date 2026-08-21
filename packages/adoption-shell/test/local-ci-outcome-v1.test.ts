import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  LOCAL_CI_OUTCOME_V1_ID,
  LOCAL_CI_OUTCOME_V1_SCHEMA_ID,
  LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION,
  LOCAL_CI_OUTCOMES_V1,
  isNotExecutedOutcomeV1,
  validateLocalCiOutcomeV1,
  type LocalCiOutcomeV1,
} from "../src/local-ci-outcome-v1.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const schema = JSON.parse(
  fs.readFileSync(path.join(root, "contracts", "local-ci", "v3", "local-ci-outcome-v1.schema.json"), "utf8"),
) as AnySchema;
const validateSchema = new Ajv2020({
  allErrors: true,
  strictSchema: true,
  strictTypes: false,
}).compile(schema);

const passOutcome: LocalCiOutcomeV1 = {
  schemaId: LOCAL_CI_OUTCOME_V1_SCHEMA_ID,
  schemaVersion: LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION,
  contractId: LOCAL_CI_OUTCOME_V1_ID,
  commandId: "lint",
  outcome: "pass",
  exitCode: 0,
  reason: null,
  detectionProofExercised: true,
  recordedAt: "2026-08-12T00:00:00Z",
};

void test("the outcome contract declares exactly four states", () => {
  assert.deepEqual([...LOCAL_CI_OUTCOMES_V1].sort(), ["could-not-execute", "fail", "pass", "skipped"]);
});

void test("pass outcome validates and matches the published schema", () => {
  const result = validateLocalCiOutcomeV1(passOutcome);
  assert.equal(result.ok, true);
  assert.equal(validateSchema(passOutcome), true);
});

void test("fail outcome requires a non-null exit code and a null reason", () => {
  const fail: LocalCiOutcomeV1 = { ...passOutcome, outcome: "fail", exitCode: 1 };
  assert.equal(validateLocalCiOutcomeV1(fail).ok, true);
  assert.equal(validateSchema(fail), true);
});

void test("skipped and could-not-execute never carry pass's shape -- they are never fewer than distinct from pass", () => {
  for (const outcome of ["skipped", "could-not-execute"] as const) {
    const value: unknown = {
      ...passOutcome,
      outcome,
      exitCode: null,
      reason: outcome === "skipped" ? "preflight declared this optional and it was not run" : "bare worktree: executable not found on PATH",
    };
    const result = validateLocalCiOutcomeV1(value);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(validateSchema(value), true);
    assert.equal(isNotExecutedOutcomeV1(outcome), true);
  }
});

void test("a skipped/could-not-execute outcome can never be read as pass by carrying pass's field shape", () => {
  const cases: readonly [string, unknown][] = [
    ["skipped with exit code 0 (would read as pass)", { ...passOutcome, outcome: "skipped", exitCode: 0, reason: "x" }],
    ["skipped with null reason (silently equals pass)", { ...passOutcome, outcome: "skipped", exitCode: null, reason: null }],
    ["could-not-execute with a numeric exit code", { ...passOutcome, outcome: "could-not-execute", exitCode: 1, reason: "x" }],
  ];
  for (const [name, value] of cases) {
    const result = validateLocalCiOutcomeV1(value);
    assert.equal(result.ok, false, name);
    assert.equal(validateSchema(value), false, name);
  }
});

void test("pass/fail outcomes reject a non-null reason (never silently equal skipped)", () => {
  const value = { ...passOutcome, reason: "should be null" };
  assert.equal(validateLocalCiOutcomeV1(value).ok, false);
  assert.equal(validateSchema(value), false);
});

void test("unsupported outcome strings fail closed", () => {
  const value = { ...passOutcome, outcome: "green", exitCode: 0 };
  const result = validateLocalCiOutcomeV1(value);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics.some((d) => d.code === "E_ENUM"), true);
  }
});
