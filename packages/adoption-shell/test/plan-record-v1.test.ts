import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  classifyPlanRecordV1,
  createWorkMigrationManifestV1,
  planRecordTransitionReasonV1,
  validatePlanRecordV1,
  validateWorkMigrationManifestV1,
} from "../src/plan-record-v1.ts";
import { canonicalizeJson } from "../src/canonical-json.ts";

const cases = JSON.parse(fs.readFileSync(
  new URL("../../../contracts/plan-record/v1/fixtures/classification-cases.json", import.meta.url),
  "utf8",
)) as readonly Readonly<{
  name: string;
  decision: string;
  reasonCode?: string;
  archive?: boolean;
  record: unknown;
}>[];

const planRecordExample = JSON.parse(fs.readFileSync(
  new URL("../../../contracts/plan-record/v1/plan-record.example.json", import.meta.url),
  "utf8",
)) as unknown;
const migrationManifestExample = JSON.parse(fs.readFileSync(
  new URL(
    "../../../contracts/plan-record/v1/work-migration-manifest.example.json",
    import.meta.url,
  ),
  "utf8",
)) as unknown;

test("published examples validate against the pure contract", () => {
  assert.equal(validatePlanRecordV1(planRecordExample), true);
  assert.equal(validateWorkMigrationManifestV1(migrationManifestExample), true);
});

test("classifies every portable, legacy, malformed, overlay, and archive fixture", () => {
  for (const fixture of cases) {
    const result = classifyPlanRecordV1(
      fixture.record,
      fixture.archive === undefined ? {} : { archive: fixture.archive },
    );
    assert.equal(result.kind, fixture.decision, fixture.name);
    if ("reasonCode" in result) assert.equal(result.reasonCode, fixture.reasonCode, fixture.name);
  }
});

test("a second dry run is byte-identical and input order does not affect the manifest", () => {
  const input = {
    schemaVersion: "work-migration-manifest/v1" as const,
    source: { commit: "a".repeat(64), tree: "b".repeat(64) },
    schemaRelease: { version: "3.0.0", digest: "c".repeat(64) },
    decisions: [
      { path: "plans/002.md", decision: "retire" as const, reasonCode: "AMBIGUOUS_STATUS" as const },
      { path: "plans/001.md", decision: "migrate" as const, reasonCode: "LEGACY_READY" as const },
    ],
    archive: { count: 7, aggregateSha256: "d".repeat(64) },
    changedPaths: ["plans/002.md", "plans/001.md"],
    verification: ["schema", "fixtures"],
    canary: { repository: "gmail-markdown", state: "pending" as const },
    rollbackRef: "refs/tags/v2.6.0",
    unclassifiedCount: 0 as const,
  };
  const first = createWorkMigrationManifestV1(input);
  const second = createWorkMigrationManifestV1(input);
  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
  assert.deepEqual(first.decisions.map((row) => row.path), ["plans/001.md", "plans/002.md"]);
  assert.equal(validateWorkMigrationManifestV1(first), true);
});

test("manifest creation halts on an unclassified row", () => {
  assert.throws(
    () => createWorkMigrationManifestV1({ unclassifiedCount: 1 } as never),
    /unclassifiedCount must be zero/,
  );
});

test("admitted enqueue time and claim/land snapshots are immutable", () => {
  const record = cases.find((fixture) => fixture.name === "implemented-landed")?.record;
  assert.equal(validatePlanRecordV1(record), true);
  if (!validatePlanRecordV1(record)) throw new Error("fixture must be a valid record");
  assert.equal(planRecordTransitionReasonV1(record, record), null);
  assert.equal(
    planRecordTransitionReasonV1(record, { ...record, enqueuedAt: "2026-07-29T00:00:00Z" }),
    "ENQUEUED_AT_IMMUTABLE",
  );
  assert.equal(
    planRecordTransitionReasonV1(record, {
      ...record,
      contractSnapshots: {
        ...record.contractSnapshots,
        claim: { algorithm: "sha256", digest: "f".repeat(64) },
      },
    }),
    "CLAIM_SNAPSHOT_IMMUTABLE",
  );
  assert.equal(
    planRecordTransitionReasonV1(record, {
      ...record,
      contractSnapshots: {
        ...record.contractSnapshots,
        land: { algorithm: "sha256", digest: "e".repeat(64) },
      },
    }),
    "LAND_SNAPSHOT_IMMUTABLE",
  );
  assert.equal(
    planRecordTransitionReasonV1(record, {
      ...record,
      contractSnapshots: { claim: record.contractSnapshots.claim },
    } as never),
    "LAND_SNAPSHOT_IMMUTABLE",
  );
});

test("manifest validator rejects digest drift, duplicate paths, and reason/decision mismatch", () => {
  const base = {
    schemaVersion: "work-migration-manifest/v1" as const,
    source: { commit: "a".repeat(40), tree: "b".repeat(40) },
    schemaRelease: { version: "3.0.0", digest: "c".repeat(64) },
    decisions: [
      { path: "plans/001.md", decision: "migrate" as const, reasonCode: "LEGACY_READY" as const },
    ],
    archive: { count: 7, aggregateSha256: "d".repeat(64) },
    changedPaths: ["plans/001.md"],
    verification: ["fixture-validation"],
    canary: { repository: "gmail-markdown", state: "pending" as const },
    rollbackRef: "refs/tags/v2.6.0",
    unclassifiedCount: 0 as const,
  };
  const valid = createWorkMigrationManifestV1(base);
  assert.equal(validateWorkMigrationManifestV1({ ...valid, manifestSha256: "0".repeat(64) }), false);
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...base,
      changedPaths: ["plans/001.md", "plans/001.md"],
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...base,
      decisions: [{
        path: "plans/../001.md",
        decision: "migrate" as const,
        reasonCode: "LEGACY_READY" as const,
      }],
    }),
    /input is invalid/,
  );
  assert.throws(
    () => createWorkMigrationManifestV1({
      ...base,
      decisions: [{
        path: "plans/001.md",
        decision: "retire" as const,
        reasonCode: "LEGACY_READY" as const,
      }],
    }),
    /input is invalid/,
  );
});
