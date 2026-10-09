#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BANNED_LABELS,
  CANONICAL_LABELS,
  computeProvisionPlan,
  executeProvisionPlan,
  buildCanonicalLabels,
  runProvision,
  type ExistingLabel,
} from "./provision-canonical-labels.ts";
import {
  computePayloadDigest,
  parseProducerHead,
  ReleaseResolutionError,
  resolveCurrentRelease,
  type ReleaseSource,
} from "./governed-intake-release.ts";
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
  computeFleetLawDigest,
  verifyFleetLawProjection,
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
  "progress:triage",
  "progress:planned",
  "progress:implementing",
  "progress:reviewing",
  "progress:implemented",
  "progress:verified",
];
for (const stage of requiredWorkSpine) {
  assert.ok(CANONICAL_LABELS.some((l) => l.name === stage), `Missing ${stage}`);
}

// Ensure dimensions exist
for (const dim of ["effort:low", "effort:medium", "effort:high", "blocked:time", "blocked:human-required", "blocked:issue"]) {
  assert.ok(CANONICAL_LABELS.some((l) => l.name === dim), `Missing ${dim}`);
}

// PR conflict / verification request signals (repo-template#346/#347)
for (const signal of ["needs-rebase", "needs-verification"]) {
  assert.ok(CANONICAL_LABELS.some((l) => l.name === signal), `Missing ${signal}`);
}

// Ensure terminal dispositions exist
for (const disp of [
  "resolution:obsolete",
  "resolution:delivered",
  "resolution:duplicate",
  "resolution:declined",
  "resolution:superseded",
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
const purgePlan = computeProvisionPlan(dirtyLabels, CANONICAL_LABELS, BANNED_LABELS, { purgeBanned: true });
assert.equal(purgePlan.create.length, 0);
assert.equal(purgePlan.update.length, 0);
const sortedPurged = purgePlan.purge.toSorted((a, b) => a.localeCompare(b));
const expectedPurged = ["needs-info", "tier:human"].toSorted((a, b) => a.localeCompare(b));
assert.deepEqual(sortedPurged, expectedPurged);

// Test 6: Plan computation with drift in color/description (updates)
const driftedLabels: ExistingLabel[] = currentLabels.map((l) =>
  l.name === "progress:triage" ? { ...l, color: "000000" } : l
);
const driftPlan = computeProvisionPlan(driftedLabels);
assert.equal(driftPlan.create.length, 0);
assert.equal(driftPlan.update.length, 1);
assert.equal(driftPlan.update[0]?.name, "progress:triage");

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

// The projection's stale producer pin / ready flag is not authoritative: no completion stamp is
// baked into the static catalogue; it comes from the release resolved at use time.
assert.ok(CANONICAL_LABELS.every((l) => !l.name.startsWith("metadata:triage-v")));

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
  const selfBlockMatch = /<!-- TEMPLATE-SELF[\s\S]*?<!-- \/TEMPLATE-SELF -->/.exec(agentsMd);
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

// Code owns the current projection. It contains provenance, never an embedded live admission pin.
const typeLabels = FLEET_LAW_PROJECTION.dimensions["type"]?.["labels"];
assert.ok(Array.isArray(typeLabels) && typeLabels.includes("type:proposal"));
assert.ok(CANONICAL_LABELS.some((label) => label.name === "metadata:direction-change"));
assert.equal(FLEET_LAW_PROJECTION.governedIntakeProducer, undefined);
assert.equal(FLEET_LAW_PROJECTION.assessmentAuthority.producerRevision, FLEET_LAW_PROJECTION.governedIntakeRevision);
assert.deepEqual(verifyFleetLawProjection(FLEET_LAW_PROJECTION), []);
for (const mutate of [
  (p: typeof FLEET_LAW_PROJECTION) => { p.assessmentAuthority.producerRevision += 1; },
  (p: typeof FLEET_LAW_PROJECTION) => { p.assessmentAuthority.producerCommit = "0".repeat(40); },
  (p: typeof FLEET_LAW_PROJECTION) => { p.assessmentAuthority.payloadDigest = "not-a-digest"; },
  (p: typeof FLEET_LAW_PROJECTION) => { p.currentTriageLabel = "triaged:v" + String(p.governedIntakeRevision); },
]) {
  const candidate = structuredClone(FLEET_LAW_PROJECTION);
  mutate(candidate);
  candidate.contentDigest = computeFleetLawDigest({ ...candidate });
  assert.ok(verifyFleetLawProjection(candidate).length > 0, "invalid current projection provenance is refused even with coherent outer digest");
}

// Live effects require a verified, use-time-resolved producer release.
assert.throws(() => { executeProvisionPlan(emptyPlan); }, /release-not-resolved/);
assert.deepEqual(computeProvisionPlan(dirtyLabels).purge, [], "closed historical stock remains untouched by default");
assert.ok(CANONICAL_LABELS.every((l) => !/^triaged:v|^work:|^disposition:/.test(l.name)));
for (const dimension of ["delivers", "type", "source", "blocked", "environment"]) {
  assert.equal(FLEET_LAW_PROJECTION.dimensions[dimension]?.["maximum"], null);
}
for (const mutate of [
  (p: typeof FLEET_LAW_PROJECTION) => { const rule = p.dimensions["type"]; assert.ok(rule); rule["maximum"] = 1; },
  (p: typeof FLEET_LAW_PROJECTION) => { const rule = p.dimensions["progress"]; assert.ok(rule); rule["maximum"] = 2; },
  (p: typeof FLEET_LAW_PROJECTION) => { const rule = p.lifecycle["obsolete"]; assert.ok(typeof rule === "object" && rule !== null && "immediateBeforeImplementation" in rule); rule.immediateBeforeImplementation = false; },
  (p: typeof FLEET_LAW_PROJECTION) => { p.labels.push({ name: "triaged:v23", description: "retired", color: "000000" }); },
  (p: typeof FLEET_LAW_PROJECTION) => { p.revision = 999; },
]) {
  const candidate = structuredClone(FLEET_LAW_PROJECTION);
  mutate(candidate);
  candidate.contentDigest = computeFleetLawDigest({ ...candidate });
  assert.ok(verifyFleetLawProjection(candidate).length > 0, "semantic drift fails with a recomputed digest");
}
// Exact published verifier fixture from .github@fb86 (blob e7d5d458d67c75ed95252962012f79a7a3e0cb09).
// It is test data only: production always reads verify.js from the currently resolved producer.
const verifierFixture = readFileSync(new URL("./fixtures/governed-intake-verify.js.txt", import.meta.url));
const requiredMatch = /export const REQUIRED_RELEASE_PAYLOADS = \[([\s\S]*?)\]/.exec(verifierFixture.toString("utf8"));
assert.ok(requiredMatch?.[1]);
const fixturePayloadNames = [...requiredMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
assert.equal(fixturePayloadNames.length, 36);
// Hermetic complete release (r22 -> r23 with no consumer code change; forged input refused).
const PRODUCER = "spencer-shadley/.github";
const HEAD = "a".repeat(40);
const REL_DIR = "contracts/generated/governed-intake";
function fakeRelease(revision: number, tamper?: (files: Map<string, Buffer>, manifest: Record<string, unknown>) => void): ReleaseSource {
  const contract = Buffer.from(JSON.stringify({ schema: "GovernedIntakeBodyV1", version: revision, owner: PRODUCER }));
  const policy = Buffer.from(JSON.stringify({ schema: "GovernedTriagePolicyV1", owner: PRODUCER }));
  const files = new Map<string, Buffer>(fixturePayloadNames.map((name) => { assert.ok(name); return [name, Buffer.from(`fixture ${name}`)]; }));
  for (const [name, bytes] of new Map<string, Buffer>([
    ["governed-intake-body.v1.json", contract],
    ["contract.json", contract],
    ["governed-intake-triage-policy.v1.json", policy],
    ["policy.json", policy],
    ["verify.js", verifierFixture],
  ])) files.set(name, bytes);
  const entries = Object.fromEntries([...files].map(([name, bytes]) => [name, { path: name, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length }]));
  const manifest: Record<string, unknown> = {
    schema: "GovernedIntakeReleaseManifestV1",
    schemaFamily: "GovernedIntakeBodyV1",
    revision,
    producer: { repository: PRODUCER, commit: "b".repeat(40) },
    payloadDigest: computePayloadDigest(entries),
    files: entries,
  };
  tamper?.(files, manifest);
  return {
    resolveHead: () => Promise.resolve({ branch: "master", commit: HEAD }),
    readFile: (commit, file) => {
      assert.equal(commit, HEAD, "payload bytes are read at the resolved head SHA");
      if (file === `${REL_DIR}/manifest.json`) return Promise.resolve(Buffer.from(JSON.stringify(manifest)));
      const bytes = files.get(file.slice(REL_DIR.length + 1));
      return bytes ? Promise.resolve(bytes) : Promise.reject(new Error(`missing ${file}`));
    },
  };
}

// Rebuild metadata only when testing a self-consistent but semantically invalid release.
function updateMetadata(files: Map<string, Buffer>, manifest: Record<string, unknown>): void {
  const entries = Object.fromEntries([...files].map(([name, bytes]) => [name, {
    path: name, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length,
  }]));
  manifest["files"] = entries;
  manifest["payloadDigest"] = computePayloadDigest(entries);
}

const r22 = await resolveCurrentRelease(fakeRelease(22));
const r23 = await resolveCurrentRelease(fakeRelease(23));
const newerRelease = await resolveCurrentRelease(fakeRelease(FLEET_LAW_PROJECTION.governedIntakeRevision + 1));
assert.deepEqual(buildCanonicalLabels(newerRelease).filter((label) => /^metadata:triage-v[0-9]+$/.test(label.name)).map((label) => label.name), [newerRelease.triageLabel], "a newer verified publication replaces the projection completion definition rather than accumulating stamps");
assert.equal(r22.triageLabel, "metadata:triage-v22");
assert.equal(r23.triageLabel, "metadata:triage-v23");
assert.equal(r23.headCommit, HEAD);
assert.equal(r23.producerCommit, "b".repeat(40));
assert.match(r23.payloadDigest, /^sha256:[0-9a-f]{64}$/);
assert.ok(buildCanonicalLabels(r23).some((l) => l.name === "metadata:triage-v23"));
assert.ok(buildCanonicalLabels(r23).every((l) => l.name !== "metadata:triage-v22"));
// Live (non-dry-run) execution is allowed once a release is verified; dry-run reports r23 with no code change.
const report23 = await runProvision({ repo: "o/r", dryRun: true, releaseSource: fakeRelease(23), existingLabels: [] });
assert.equal(report23.producerRelease.revision, 23);
assert.equal(report23.plan.createCount, buildCanonicalLabels(r23).length);
assert.ok(report23.execution.created.includes("metadata:triage-v23"));
const report22 = await runProvision({ repo: "o/r", dryRun: true, releaseSource: fakeRelease(22), existingLabels: [] });
assert.ok(report22.execution.created.includes("metadata:triage-v22"));
// Forged / unverifiable input fails closed.
const forgeries: [string, ReleaseSource][] = [
  ["digest", fakeRelease(23, (_f, m) => { m["payloadDigest"] = "0".repeat(64); })],
  ["repository", fakeRelease(23, (_f, m) => { m["producer"] = { repository: "evil/.github", commit: "b".repeat(40) }; })],
  ["commit", fakeRelease(23, (_f, m) => { m["producer"] = { repository: PRODUCER, commit: "0".repeat(40) }; })],
  ["schema", fakeRelease(23, (_f, m) => { m["schema"] = "Other"; })],
  ["bytes", fakeRelease(23, (f) => { f.set("governed-intake-body.v1.json", Buffer.from("{}")); })],
  ["revision-mismatch", fakeRelease(23, (_f, m) => { m["revision"] = 24; })],
  ["missing-required", fakeRelease(23, (f, m) => { f.delete("evaluator.ts"); updateMetadata(f, m); })],
  ["corrupt-other-payload", fakeRelease(23, (f) => { f.set("task.md", Buffer.from("corrupted")); })],
  ["corrupt-contract-alias", fakeRelease(23, (f) => { f.set("contract.json", Buffer.from("{}")); })],
  ["self-consistent-contract-alias", fakeRelease(23, (f, m) => { f.set("contract.json", Buffer.from("{}")); updateMetadata(f, m); })],
  ["self-consistent-policy-alias", fakeRelease(23, (f, m) => { f.set("policy.json", Buffer.from("{}")); updateMetadata(f, m); })],
  ["corrupt-verifier", fakeRelease(23, (f) => { f.set("verify.js", Buffer.from("throw Error('must not run')")); })],
  ["unreadable", { resolveHead: () => Promise.reject(new Error("offline")), readFile: () => Promise.reject(new Error("offline")) }],
];
await Promise.all(forgeries.map(([label, source]) =>
  assert.rejects(() => resolveCurrentRelease(source), ReleaseResolutionError, `forged ${label} must be refused`)));
const forgedDigest = forgeries[0]?.[1];
assert.ok(forgedDigest);
await assert.rejects(() => runProvision({ repo: "o/r", dryRun: true, releaseSource: forgedDigest, existingLabels: [] }), ReleaseResolutionError);
// Live path: unverified/look-alike release objects cannot authorize writes; forged source never reaches gh.
assert.throws(() => { executeProvisionPlan(emptyPlan, false, { ...r23 }); }, /release-not-resolved/);
await assert.rejects(() => runProvision({ repo: "o/r", dryRun: false, releaseSource: forgedDigest, existingLabels: [] }), ReleaseResolutionError);
// Producer-parity cases: missing alias entry, non-SHA head, UTF-16 digest ordering with underscore names.
await assert.rejects(() => resolveCurrentRelease(fakeRelease(23, (_f, m) => { { const f = m["files"]; if (typeof f === "object" && f !== null) Reflect.deleteProperty(f, "policy.json"); } })), ReleaseResolutionError);
await assert.rejects(() => resolveCurrentRelease({ ...fakeRelease(23), resolveHead: () => Promise.resolve({ branch: "master", commit: "" }) }), ReleaseResolutionError);
const entry = (name: string) => [name, { path: name, sha256: "1".repeat(64), byteLength: 1 }] as const;
assert.equal(
  computePayloadDigest(Object.fromEntries(["ab", "a_b", "a-b"].map(entry))),
  createHash("sha256").update(["a-b", "a_b", "ab"].map((n) => `${n}:${"1".repeat(64)}:1`).join("\n")).digest("hex"),
  "digest ordering is UTF-16 code-unit order like the producer",
);
// A future producer owns its new required payload without a consumer source update.
const evolvedVerifier = Buffer.from(verifierFixture.toString("utf8").replace(
  'export const REQUIRED_RELEASE_PAYLOADS = [',
  'export const REQUIRED_RELEASE_PAYLOADS = ["future-payload.json",',
));
const futureRelease = (includeRequired: boolean) => fakeRelease(23, (files, manifest) => {
  files.set("verify.js", evolvedVerifier);
  if (includeRequired) files.set("future-payload.json", Buffer.from("{}"));
  updateMetadata(files, manifest);
});
await assert.rejects(() => resolveCurrentRelease(futureRelease(false)), /missing required payload entry: future-payload.json/);
assert.equal((await resolveCurrentRelease(futureRelease(true))).revision, 23);
// The producer default branch is discovered through symbolic HEAD, never a named main channel.
for (const branch of ["main", "master", "release/next"]) {
  const remote = "ref: refs/heads/" + branch + "\tHEAD\n" + HEAD + "\tHEAD\n" + "c".repeat(40) + "\trefs/heads/main\n";
  const selected = parseProducerHead(remote);
  assert.deepEqual(selected, { branch, commit: HEAD });
  const resolved = await resolveCurrentRelease({ ...fakeRelease(23), resolveHead: () => Promise.resolve(selected) });
  assert.equal(resolved.branch, branch);
  assert.equal(resolved.headCommit, HEAD);
}
assert.deepEqual(parseProducerHead("ref: refs/heads/trunk\tHEAD\n" + "d".repeat(40) + "\tHEAD\n"), { branch: "trunk", commit: "d".repeat(40) });
for (const malformed of [
  HEAD + "\tHEAD\n",
  "ref: refs/heads/main\tHEAD\n",
  "ref: refs/tags/v1\tHEAD\n" + HEAD + "\tHEAD\n",
  "ref: refs/heads/\tHEAD\n" + HEAD + "\tHEAD\n",
  "ref: refs/heads/main\tHEAD\nnot-a-sha\tHEAD\n",
  "ref: refs/heads/main\tHEAD\nref: refs/heads/master\tHEAD\n" + HEAD + "\tHEAD\n",
  "ref: refs/heads/main\tHEAD\n" + HEAD + "\tHEAD\n" + "d".repeat(40) + "\tHEAD\n",
]) assert.throws(() => parseProducerHead(malformed), ReleaseResolutionError);
console.log("provision-canonical-labels.selfcheck: PASS");

