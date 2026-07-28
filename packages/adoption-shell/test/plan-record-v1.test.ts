import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  classifyPlanRecordV1,
  createWorkMigrationManifestV1,
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

test("classifies every portable, legacy, malformed, overlay, and archive fixture", () => {
  for (const fixture of cases) {
    const result = classifyPlanRecordV1(fixture.record, { archive: fixture.archive });
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
});

test("manifest creation halts on an unclassified row", () => {
  assert.throws(
    () => createWorkMigrationManifestV1({ unclassifiedCount: 1 } as never),
    /unclassifiedCount must be zero/,
  );
});
