#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BANNED_LABELS,
  CANONICAL_LABELS,
  computeProvisionPlan,
  executeProvisionPlan,
  type ExistingLabel,
} from "./provision-canonical-labels.ts";
import {
  FLEET_LAW_PROJECTION,
  FLEET_LAW_EVIDENCE,
  FLEET_LAW_SCHEMA,
  FLEET_LAW_REVISION,
  FleetLawMissingError,
  FleetLawCorruptError,
  FleetLawUnsupportedError,
  FleetLawDigestMismatchError,
  loadFleetLawProjection,
} from "./generated/fleet-law.ts";
import { runCheckFleetLawSync } from "./check-fleet-law-sync.ts";

// Test 1: Canonical labels catalogue completeness
assert.ok(CANONICAL_LABELS.length >= 35, `Expected >= 35 canonical labels, found ${String(CANONICAL_LABELS.length)}`);

// Ensure all priority repo and fleet levels 0-5 exist
for (let level = 0; level <= 5; level += 1) {
  const levelStr = String(level);
  assert.ok(CANONICAL_LABELS.some((l) => l.name === `priority:repo:p${levelStr}`), `Missing priority:repo:p${levelStr}`);
  assert.ok(CANONICAL_LABELS.some((l) => l.name === `priority:fleet:p${levelStr}`), `Missing priority:fleet:p${levelStr}`);
}

// Ensure work-spine stages exist
const requiredWorkSpine = [
  "work:untriaged",
  "work:planned",
  "work:in-progress",
  "work:in-review",
  "work:implemented",
];
for (const stage of requiredWorkSpine) {
  assert.ok(CANONICAL_LABELS.some((l) => l.name === stage), `Missing ${stage}`);
}

// Ensure dimensions exist
for (const dim of ["effort:low", "effort:medium", "effort:high", "tier:auto", "human-required"]) {
  assert.ok(CANONICAL_LABELS.some((l) => l.name === dim), `Missing ${dim}`);
}

// PR conflict / verification request signals (repo-template#346/#347)
for (const signal of ["needs-rebase", "needs-verification"]) {
  assert.ok(CANONICAL_LABELS.some((l) => l.name === signal), `Missing ${signal}`);
}

// Ensure terminal dispositions exist
for (const disp of [
  "obsolete",
  "disposition:land",
  "disposition:explicit-discard",
  "disposition:preserve-as-history",
  "disposition:bounded-successor",
]) {
  assert.ok(CANONICAL_LABELS.some((l) => l.name === disp), `Missing ${disp}`);
}

// Test 2: Banned labels never appear in canonical labels
for (const banned of BANNED_LABELS) {
  assert.ok(
    CANONICAL_LABELS.every((l) => l.name.toLowerCase() !== banned.toLowerCase()),
    `Banned label ${banned} must never appear in canonical labels`,
  );
}

// Test 3: Plan computation on empty repo (all canonical created, none purged)
const emptyPlan = computeProvisionPlan([]);
assert.equal(emptyPlan.create.length, CANONICAL_LABELS.length);
assert.equal(emptyPlan.update.length, 0);
assert.equal(emptyPlan.purge.length, 0);

// Test 4: Plan computation on fully up-to-date repo (idempotent, none created/updated)
const currentLabels: ExistingLabel[] = CANONICAL_LABELS.map((l) => ({ ...l }));
const noopPlan = computeProvisionPlan(currentLabels);
assert.equal(noopPlan.create.length, 0);
assert.equal(noopPlan.update.length, 0);
assert.equal(noopPlan.purge.length, 0);
assert.equal(noopPlan.unchanged.length, CANONICAL_LABELS.length);

// Test 5: Plan computation with banned label present (purges banned)
const dirtyLabels: ExistingLabel[] = [
  ...currentLabels,
  { name: "tier:human", color: "111111", description: "old banned label" },
  { name: "needs-info", color: "222222", description: "old banned label" },
];
const purgePlan = computeProvisionPlan(dirtyLabels);
assert.equal(purgePlan.create.length, 0);
assert.equal(purgePlan.update.length, 0);
const sortedPurged = purgePlan.purge.toSorted((a, b) => a.localeCompare(b));
const expectedPurged = ["needs-info", "tier:human"].toSorted((a, b) => a.localeCompare(b));
assert.deepEqual(sortedPurged, expectedPurged);

// Test 6: Plan computation with drift in color/description (updates)
const driftedLabels: ExistingLabel[] = currentLabels.map((l) =>
  l.name === "priority:triage-tbd" ? { ...l, color: "000000" } : l
);
const driftPlan = computeProvisionPlan(driftedLabels);
assert.equal(driftPlan.create.length, 0);
assert.equal(driftPlan.update.length, 1);
assert.equal(driftPlan.update[0]?.name, "priority:triage-tbd");

// Test 7: Dry-run execution
const firstCanonical = CANONICAL_LABELS[0];
assert.ok(firstCanonical);
const dryRunResult = executeProvisionPlan(
  {
    repo: "test/repo",
    create: [firstCanonical],
    update: [],
    purge: ["tier:human"],
    unchanged: [],
  },
  true,
);
assert.deepEqual(dryRunResult.created, [firstCanonical.name]);
assert.deepEqual(dryRunResult.purged, ["tier:human"]);
assert.equal(dryRunResult.errors.length, 0);

// Test 8: Fleet law evidence, current triaged:vN, and recurrence guard
assert.equal(FLEET_LAW_EVIDENCE.schema, FLEET_LAW_SCHEMA);
assert.equal(FLEET_LAW_EVIDENCE.revision, FLEET_LAW_REVISION);
assert.equal(FLEET_LAW_EVIDENCE.contentDigest, FLEET_LAW_PROJECTION.contentDigest);
assert.equal(FLEET_LAW_EVIDENCE.sourceCommit, FLEET_LAW_PROJECTION.sourceCommit);

// Current triaged:vN present
const currentTriage = FLEET_LAW_PROJECTION.currentTriageLabel;
assert.ok(
  CANONICAL_LABELS.some((l) => l.name === currentTriage),
  `Missing current triage label ${currentTriage}`,
);

// Recurrence guard: ensure no hand-authored priority policy or label mirrors in provision-canonical-labels.ts
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const provisionerSource = readFileSync(
  path.join(repoRoot, "scripts", "provision-canonical-labels.ts"),
  "utf8",
);
assert.equal(
  provisionerSource.includes("PRIORITY_REPO_HOURS"),
  false,
  "PRIORITY_REPO_HOURS must not be authored in provision-canonical-labels.ts",
);
assert.equal(
  provisionerSource.includes("PRIORITY_COLORS"),
  false,
  "PRIORITY_COLORS must not be authored in provision-canonical-labels.ts",
);
assert.equal(
  provisionerSource.includes("buildNumberedPriorityLabels"),
  false,
  "buildNumberedPriorityLabels must not be authored in provision-canonical-labels.ts",
);
assert.ok(
  provisionerSource.includes("FLEET_LAW_PROJECTION"),
  "provision-canonical-labels.ts must consume FLEET_LAW_PROJECTION",
);

// Fail-closed tests on missing, corrupt, or digest-mismatched projection
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "rt-fleet-law-test-"));
try {
  assert.throws(
    () => loadFleetLawProjection(path.join(tmpDir, "nonexistent.json")),
    FleetLawMissingError,
  );
  const corruptPath = path.join(tmpDir, "corrupt.json");
  writeFileSync(corruptPath, "{ bad json", "utf8");
  assert.throws(() => loadFleetLawProjection(corruptPath), FleetLawCorruptError);

  const badSchemaPath = path.join(tmpDir, "bad-schema.json");
  writeFileSync(
    badSchemaPath,
    JSON.stringify({ ...FLEET_LAW_PROJECTION, schema: "InvalidSchema" }),
    "utf8",
  );
  assert.throws(() => loadFleetLawProjection(badSchemaPath), FleetLawUnsupportedError);

  const badDigestPath = path.join(tmpDir, "bad-digest.json");
  writeFileSync(
    badDigestPath,
    JSON.stringify({ ...FLEET_LAW_PROJECTION, contentDigest: "sha256:bad" }),
    "utf8",
  );
  assert.throws(() => loadFleetLawProjection(badDigestPath), FleetLawDigestMismatchError);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

// Sync tool self-check
const checkResult = runCheckFleetLawSync({ check: true });
assert.equal(checkResult.code, 0);


// RT#418: TEMPLATE-SELF charter must claim portable label vocabulary ownership
{
  const agentsMd = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "AGENTS.md"), "utf8");
  const selfBlockMatch = agentsMd.match(/<!-- TEMPLATE-SELF[\s\S]*?<!-- \/TEMPLATE-SELF -->/);
  assert.ok(selfBlockMatch, "TEMPLATE-SELF block missing from AGENTS.md");
  const selfBlock = selfBlockMatch[0];
  assert.match(
    selfBlock,
    /label vocabulary/i,
    "TEMPLATE-SELF Responsibilities must claim portable fleet label vocabulary (repo-template#418)",
  );
  assert.match(
    selfBlock,
    /Does not author Code fleet-law projection/i,
    "TEMPLATE-SELF Non-responsibilities must refuse authoring Code fleet-law bytes (repo-template#418)",
  );
  const vocabDoc = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "FLEET-LABEL-VOCABULARY.md");
  assert.ok(existsSync(vocabDoc), "docs/FLEET-LABEL-VOCABULARY.md must exist (repo-template#418 SSOT)");
}

console.log("provision-canonical-labels.selfcheck: PASS");
