#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  BANNED_LABELS,
  CANONICAL_LABELS,
  computeProvisionPlan,
  executeProvisionPlan,
  type ExistingLabel,
} from "./provision-canonical-labels.ts";

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

console.log("provision-canonical-labels.selfcheck: PASS");
