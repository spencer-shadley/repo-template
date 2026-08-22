import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import type { FormatsPlugin } from "ajv-formats";

import { canonicalizeJson } from "../src/canonical-json.ts";
import {
  classifyPlanRecordV1,
  planRecordTransitionReasonV1,
  validatePlanRecordV1,
  type PlanRecordV1,
} from "../src/plan-record-v1.ts";
import {
  ARCHIVE_AGGREGATE_ALGORITHM_V1,
  archiveAggregateSha256V1,
  createWorkMigrationManifestV1,
  validateWorkMigrationManifestV1,
} from "../src/work-migration-manifest-v1.ts";
import {
  classifyPlanRecordV1 as classifyGeneratedPlanRecordV1,
  createWorkMigrationManifestV1 as createGeneratedWorkMigrationManifestV1,
  validateWorkMigrationManifestV1 as validateGeneratedWorkMigrationManifestV1,
} from "../../../artifacts/adoption-shell-v2/index.js";

interface ClassificationFixture {
  readonly name: string;
  readonly decision: string;
  readonly targetStatus?: string;
  readonly reasonCode?: string;
  readonly archive?: boolean;
  readonly record: unknown;
}

const contract = (name: string): URL =>
  new URL(`../../../contracts/plan-record/v1/${name}`, import.meta.url);
const parse = (name: string): unknown =>
  JSON.parse(fs.readFileSync(contract(name), "utf8")) as unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new TypeError(`${label} must be defined`);
  return value;
}

function isSchema(value: unknown): value is AnySchema {
  return typeof value === "boolean" || isRecord(value);
}

function schema(value: unknown, label: string): AnySchema {
  if (!isSchema(value)) throw new TypeError(`${label} must be an object or boolean JSON Schema`);
  return value;
}

function isClassificationFixture(value: unknown): value is ClassificationFixture {
  if (!isRecord(value) || typeof value["name"] !== "string" || typeof value["decision"] !== "string") return false;
  return (value["targetStatus"] === undefined || typeof value["targetStatus"] === "string") &&
    (value["reasonCode"] === undefined || typeof value["reasonCode"] === "string") &&
    (value["archive"] === undefined || typeof value["archive"] === "boolean") &&
    "record" in value;
}

function classificationFixtures(value: unknown): readonly ClassificationFixture[] {
  if (!Array.isArray(value) || !value.every(isClassificationFixture)) {
    throw new TypeError("classification cases must be fixtures");
  }
  return value;
}

function formatsPlugin(): FormatsPlugin {
  const candidate: unknown = require("ajv-formats");
  if (typeof candidate !== "function") throw new TypeError("ajv-formats must export a function");
  return candidate as FormatsPlugin;
}

const cases = classificationFixtures(parse("fixtures/classification-cases.json"));
const planRecordSchema = schema(parse("plan-record.schema.json"), "plan record schema");
const migrationManifestSchema = schema(parse("work-migration-manifest.schema.json"), "migration manifest schema");
const planRecordExample = parse("plan-record.example.json");
const migrationManifestExample = parse("work-migration-manifest.example.json");

const require = createRequire(import.meta.url);
const addFormats = formatsPlugin();
const ajv = new Ajv2020({
  allErrors: true,
  strictSchema: true,
  strictTypes: false,
  strictRequired: false,
});
addFormats(ajv);
const validatePlanRecordSchema = ajv.compile(planRecordSchema);
const validateMigrationManifestSchema = ajv.compile(migrationManifestSchema);

function fixture(name: string): ClassificationFixture {
  const found = cases.find((row) => row.name === name);
  if (found === undefined) throw new Error(`missing fixture: ${name}`);
  return found;
}

function validRecord(name: string): PlanRecordV1 {
  const record = fixture(name).record;
  if (!validatePlanRecordV1(record)) throw new Error(`fixture is not valid: ${name}`);
  return record;
}

function manifestInput() {
  return {
    schemaVersion: "work-migration-manifest/v1" as const,
    source: { commit: "a".repeat(40), tree: "b".repeat(40) },
    schemaRelease: { version: "3.0.0", digest: "c".repeat(64) },
    decisions: [
      {
        path: "plans/002-example.md",
        decision: "retire" as const,
        reasonCode: "AMBIGUOUS_STATUS" as const,
      },
      {
        path: "plans/001-example.md",
        decision: "migrate" as const,
        targetStatus: "planned" as const,
        reasonCode: "LEGACY_READY" as const,
      },
    ],
    liveCounts: { before: 2, migrate: 1, retire: 1, after: 1 },
    archive: {
      repository: "acme/demo",
      count: 2,
      aggregateAlgorithm: ARCHIVE_AGGREGATE_ALGORITHM_V1,
      aggregateSha256: "9aa25de33c106f8f315432e33f97504b8aa73248703d238152b7560b091e0dfb",
      members: [
        { path: "plans/archive/002-example.md", blobSha256: "b".repeat(64) },
        { path: "plans/archive/001-example.md", blobSha256: "a".repeat(64) },
      ],
      dispositions: [{
        decision: "archive-receipt-only" as const,
        reasonCode: "ARCHIVE_SEALED" as const,
        count: 2,
        aggregateSha256: "9aa25de33c106f8f315432e33f97504b8aa73248703d238152b7560b091e0dfb",
      }],
    },
    changedPaths: ["plans/002-example.md", "plans/001-example.md"],
    verification: ["schema", "fixtures"],
    canary: { repository: "gmail-markdown", state: "pending" as const },
    rollbackRef: "refs/tags/v2.6.0",
    unclassifiedCount: 0 as const,
  };
}

void test("published schemas pass the draft 2020-12 meta-schema and validate examples", () => {
  assert.equal(ajv.validateSchema(planRecordSchema), true, JSON.stringify(ajv.errors));
  assert.equal(ajv.validateSchema(migrationManifestSchema), true, JSON.stringify(ajv.errors));
  assert.equal(validatePlanRecordSchema(planRecordExample), true, JSON.stringify(validatePlanRecordSchema.errors));
  assert.equal(
    validateMigrationManifestSchema(migrationManifestExample),
    true,
    JSON.stringify(validateMigrationManifestSchema.errors),
  );
  assert.equal(validatePlanRecordV1(planRecordExample), true);
  assert.equal(validateWorkMigrationManifestV1(migrationManifestExample), true);
});

void test("schema and runtime agree for every v1 positive and negative fixture", () => {
  for (const row of cases) {
    if (
      row.record === null ||
      typeof row.record !== "object" ||
      record(row.record, `${row.name} record`)["schemaVersion"] !== "plan-record/v1"
    ) continue;
    const runtime = validatePlanRecordV1(row.record);
    const schema = validatePlanRecordSchema(row.record);
    assert.equal(schema, runtime, `${row.name}: ${JSON.stringify(validatePlanRecordSchema.errors)}`);
    assert.equal(runtime, row.decision === "valid-v1", row.name);
  }
});

void test("plan-host zero and unordered unique effects are valid; duplicate effects are not", () => {
  const record = fixture("in-progress-human-plan-host-zero-unsorted-effects").record;
  assert.equal(validatePlanRecordSchema(record), true, JSON.stringify(validatePlanRecordSchema.errors));
  assert.equal(validatePlanRecordV1(record), true);
  const duplicate = fixture("duplicate-effect-class").record;
  assert.equal(validatePlanRecordSchema(duplicate), false);
  assert.equal(validatePlanRecordV1(duplicate), false);
});

void test("generated primitive cases keep PlanRecord schema and runtime in parity", () => {
  const planned = validRecord("planned-auto-github-no-claim");
  const completed = validRecord("closed-completed-deployed");
  const invalidCases: readonly [string, unknown][] = [
    ["blank project", { ...planned, project: " \t" }],
    ["blank title", { ...planned, title: "\n" }],
    ["blank rationale", { ...planned, risk: { ...planned.risk, rationale: " " } }],
    ["blank effect class", { ...planned, risk: { ...planned.risk, effectClasses: ["repo-write", " "] } }],
    ["unsafe plan number", { ...planned, planNumber: Number.MAX_SAFE_INTEGER + 1 }],
    ["unsafe issue number", {
      ...planned,
      issue: { kind: "github", repository: "acme/demo", number: Number.MAX_SAFE_INTEGER + 1 },
    }],
    ["leap second", { ...planned, enqueuedAt: "2026-07-28T23:59:60Z" }],
    ["deployment leap second", {
      ...completed,
      receipt: { ...required(completed.receipt, "completed receipt"), deployedAt: "2026-07-28T23:59:60Z" },
    }],
    ["invalid calendar day", { ...planned, enqueuedAt: "2026-02-30T00:00:00Z" }],
    ["windows reserved path", { ...planned, sourcePath: "plans/CON.md" }],
    ["nested live path", { ...planned, sourcePath: "plans/nested/001.md" }],
  ];
  for (const [name, candidate] of invalidCases) {
    assert.equal(validatePlanRecordV1(candidate), false, `${name}: runtime`);
    assert.equal(validatePlanRecordSchema(candidate), false, `${name}: schema`);
  }
  const offsetTimestamp = { ...planned, enqueuedAt: "2026-07-28T23:59:59.123+14:00" };
  assert.equal(validatePlanRecordV1(offsetTimestamp), true);
  assert.equal(validatePlanRecordSchema(offsetTimestamp), true, JSON.stringify(validatePlanRecordSchema.errors));
});

void test("classifies complete legacy evidence with explicit target status and fails closed otherwise", () => {
  for (const row of cases) {
    const result = classifyPlanRecordV1(
      row.record,
      row.archive === undefined ? {} : { archive: row.archive },
    );
    assert.equal(result.kind, row.decision, row.name);
    if ("reasonCode" in result) assert.equal(result.reasonCode, row.reasonCode, row.name);
    if ("targetStatus" in result) assert.equal(result.targetStatus, row.targetStatus, row.name);
  }
  for (const name of [
    "bare-ready-incomplete",
    "bare-draft-incomplete",
    "bare-stalled-incomplete",
    "bare-parked-incomplete",
    "bare-held-incomplete",
  ]) {
    assert.deepEqual(classifyPlanRecordV1(fixture(name).record), {
      kind: "retire",
      reasonCode: "INCOMPLETE_EVIDENCE",
    });
  }
});

void test("landed and shipped legacy evidence retain distinct targets and reason codes", () => {
  assert.deepEqual(classifyPlanRecordV1(fixture("legacy-landed-complete").record), {
    kind: "migrate",
    targetStatus: "implemented",
    reasonCode: "LEGACY_IMPLEMENTED",
  });
  assert.deepEqual(classifyPlanRecordV1(fixture("legacy-shipped-complete").record), {
    kind: "migrate",
    targetStatus: "closed",
    reasonCode: "LEGACY_CLOSED",
  });
});

void test("fails closed on explicit future schema versions and migrates only absent versions", () => {
  const future = record(fixture("future-schema-version").record, "future schema fixture");
  assert.deepEqual(classifyPlanRecordV1(future), {
    kind: "retire",
    reasonCode: "UNKNOWN_SCHEMA_VERSION",
  });
  const legacy = { ...future };
  delete legacy["schemaVersion"];
  assert.deepEqual(classifyPlanRecordV1(legacy), {
    kind: "migrate",
    targetStatus: "implemented",
    reasonCode: "LEGACY_IMPLEMENTED",
  });
});

void test("a future-schema classifier decision closes a runtime, schema, and generated manifest", () => {
  const path = "plans/001-future.md";
  const future = fixture("future-schema-version").record;
  const decision = classifyPlanRecordV1(future);
  const generatedDecision = classifyGeneratedPlanRecordV1(future);
  assert.deepEqual(decision, {
    kind: "retire",
    reasonCode: "UNKNOWN_SCHEMA_VERSION",
  });
  assert.deepEqual(generatedDecision, decision);
  if (decision.kind !== "retire") throw new Error("future schema did not retire");

  const input = {
    ...manifestInput(),
    decisions: [{
      path,
      decision: "retire" as const,
      reasonCode: decision.reasonCode,
    }],
    liveCounts: { before: 1, migrate: 0, retire: 1, after: 0 },
    changedPaths: [path],
  };
  const manifest = createWorkMigrationManifestV1(input);
  const generatedManifest = createGeneratedWorkMigrationManifestV1(input);
  assert.equal(validateWorkMigrationManifestV1(manifest), true);
  assert.equal(
    validateMigrationManifestSchema(manifest),
    true,
    JSON.stringify(validateMigrationManifestSchema.errors),
  );
  assert.equal(validateGeneratedWorkMigrationManifestV1(generatedManifest), true);
  assert.deepEqual(generatedManifest, manifest);
});

void test("claim, receipt, disposition, and supersession evidence is lifecycle-conditional", () => {
  for (const name of [
    "planned-auto-github-no-claim",
    "in-progress-human-plan-host-zero-unsorted-effects",
    "implemented-landed",
    "closed-completed-deployed",
    "closed-duplicate-no-invented-receipt",
    "closed-not-planned-no-invented-receipt",
    "closed-invalid-with-claim-only",
    "held-authority-trigger",
  ]) {
    assert.equal(validatePlanRecordV1(fixture(name).record), true, name);
  }
  for (const name of [
    "planned-with-premature-claim",
    "in-progress-missing-claim",
    "closed-completed-missing-deploy",
    "closed-duplicate-invented-deploy",
    "superseded-nonduplicate",
  ]) {
    assert.equal(validatePlanRecordV1(fixture(name).record), false, name);
  }

  const duplicate = validRecord("closed-duplicate-no-invented-receipt");
  for (const status of ["planned", "in-progress", "implemented", "held-authority"] as const) {
    const base = validRecord(
      status === "planned"
        ? "planned-auto-github-no-claim"
        : status === "in-progress"
          ? "in-progress-human-plan-host-zero-unsorted-effects"
          : status === "implemented"
            ? "implemented-landed"
            : "held-authority-trigger",
    );
    const candidate = { ...base, supersededBy: duplicate.supersededBy };
    assert.equal(validatePlanRecordV1(candidate), false, `${status} runtime supersession`);
    assert.equal(validatePlanRecordSchema(candidate), false, `${status} schema supersession`);
  }
});

void test("admitted enqueue time/source and existing claim/land snapshots are immutable", () => {
  const planned = validRecord("planned-auto-github-no-claim");
  const active = validRecord("in-progress-human-plan-host-zero-unsorted-effects");
  const implemented = validRecord("implemented-landed");
  assert.equal(planRecordTransitionReasonV1(planned, planned), null);
  assert.equal(planRecordTransitionReasonV1(planned, { ...planned, enqueuedAt: "2026-07-29T00:00:00Z" }), "ENQUEUED_AT_IMMUTABLE");
  assert.equal(planRecordTransitionReasonV1(planned, {
    ...planned,
    enqueueTimeSource: "file-add-backfill",
  }), "ENQUEUE_TIME_SOURCE_IMMUTABLE");
  const backfilled = validRecord("in-progress-human-plan-host-zero-unsorted-effects");
  assert.equal(planRecordTransitionReasonV1(backfilled, {
    ...backfilled,
    enqueueTimeSource: "recorded",
  }), "ENQUEUE_TIME_SOURCE_IMMUTABLE");
  assert.equal(planRecordTransitionReasonV1(active, {
    ...active,
    contractSnapshots: {
      claim: { algorithm: "sha256", digest: "f".repeat(64) },
    },
  }), "CLAIM_SNAPSHOT_IMMUTABLE");
  assert.equal(planRecordTransitionReasonV1(implemented, {
    ...implemented,
    contractSnapshots: {
      claim: required(implemented.contractSnapshots, "implemented contract snapshots").claim,
      land: { algorithm: "sha256", digest: "e".repeat(64) },
    },
  }), "LAND_SNAPSHOT_IMMUTABLE");
});

void test("a second dry run is byte-identical and schema-valid", () => {
  const input = manifestInput();
  const first = createWorkMigrationManifestV1(input);
  const second = createWorkMigrationManifestV1(input);
  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
  assert.deepEqual(first.decisions.map((row) => row.path), ["plans/001-example.md", "plans/002-example.md"]);
  assert.equal(validateWorkMigrationManifestV1(first), true);
  assert.equal(validateMigrationManifestSchema(first), true, JSON.stringify(validateMigrationManifestSchema.errors));
});

void test("manifest closes live inventory and archive disposition counts/hashes", () => {
  const input = manifestInput();
  assert.equal(
    archiveAggregateSha256V1(input.archive.members),
    "9aa25de33c106f8f315432e33f97504b8aa73248703d238152b7560b091e0dfb",
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      decisions: [],
      liveCounts: { before: 1, migrate: 0, retire: 0, after: 0 },
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      liveCounts: { before: 2, migrate: 0, retire: 1, after: 0 },
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      archive: {
        ...input.archive,
        dispositions: [{ ...required(input.archive.dispositions[0], "first archive disposition"), count: 1 }],
      },
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      archive: {
        ...input.archive,
        dispositions: [{
          ...required(input.archive.dispositions[0], "first archive disposition"),
          aggregateSha256: "e".repeat(64),
        }],
      },
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      archive: {
        ...input.archive,
        repository: " ",
      },
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      archive: {
        ...input.archive,
        members: [{ ...required(input.archive.members[0], "first archive member"), blobSha256: "f".repeat(64) }],
      },
    }),
    /input is invalid/,
  );
});

void test("manifest rejects unclassified rows, archive live targets, apply-set drift, and target/reason mismatch", () => {
  const input = manifestInput();
  assert.throws(
    () => createWorkMigrationManifestV1({ ...input, unclassifiedCount: 1 as unknown as 0 }),
    /unclassifiedCount must be zero/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      changedPaths: ["plans/001-example.md", "plans/001-example.md"],
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      decisions: [{
        path: "plans/archive/001-example.md",
        decision: "retire" as const,
        reasonCode: "INVALID_V1" as const,
      }],
      liveCounts: { before: 1, migrate: 0, retire: 1, after: 0 },
      changedPaths: ["plans/archive/001-example.md"],
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      changedPaths: ["plans/001-example.md"],
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      changedPaths: ["plans/001-example.md", "plans/002-example.md", "plans/999.md"],
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...input,
      decisions: [{
        path: "plans/001-example.md",
        decision: "migrate" as const,
        targetStatus: "closed" as const,
        reasonCode: "LEGACY_READY" as const,
      }],
      liveCounts: { before: 1, migrate: 1, retire: 0, after: 1 },
    }),
    /input is invalid/,
  );
  const structurallyWrong = {
    ...createWorkMigrationManifestV1(input),
    decisions: [{
      path: "plans/001-example.md",
      decision: "migrate",
      targetStatus: "closed",
      reasonCode: "LEGACY_READY",
    }],
  };
  assert.equal(validateMigrationManifestSchema(structurallyWrong), false);
  assert.equal(validateWorkMigrationManifestV1(structurallyWrong), false);
});

void test("generated primitive cases keep manifest schema and runtime fail-closed", () => {
  const manifest = createWorkMigrationManifestV1(manifestInput());
  const invalidCases: readonly [string, unknown][] = [
    ["blank verification", { ...manifest, verification: [" "] }],
    ["unsafe live count", {
      ...manifest,
      liveCounts: { ...manifest.liveCounts, before: Number.MAX_SAFE_INTEGER + 1 },
    }],
    ["unsafe archive count", {
      ...manifest,
      archive: { ...manifest.archive, count: Number.MAX_SAFE_INTEGER + 1 },
    }],
    ["blank archive repository", {
      ...manifest,
      archive: { ...manifest.archive, repository: " " },
    }],
    ["windows reserved archive member", {
      ...manifest,
      archive: {
        ...manifest.archive,
        members: [
          { ...required(manifest.archive.members[0], "first archive member"), path: "plans/archive/CON.md" },
          required(manifest.archive.members[1], "second archive member"),
        ],
      },
    }],
    ["trailing-dot archive segment", {
      ...manifest,
      archive: {
        ...manifest.archive,
        members: [
          { ...required(manifest.archive.members[0], "first archive member"), path: "plans/archive/bad./001.md" },
          required(manifest.archive.members[1], "second archive member"),
        ],
      },
    }],
  ];
  for (const [name, candidate] of invalidCases) {
    assert.equal(validateWorkMigrationManifestV1(candidate), false, `${name}: runtime`);
    assert.equal(validateMigrationManifestSchema(candidate), false, `${name}: schema`);
  }
});
