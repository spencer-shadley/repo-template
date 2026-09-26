// @hermetic-boundary reason="reads frozen-candidate objects and working-tree diffs of this real checkout; writes only unreferenced objects and a throwaway clone"
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  sha256CanonicalJson,
  validateLocalCiV3CandidateReceiptV1,
  verifyLocalCiV3CandidateReceiptAgainstFrozenTree,
} from "../../../artifacts/adoption-shell-v2/index.js";
import {
  CANONICAL_V3_PATHS,
  FROZEN_CANDIDATE_COMMIT,
  FROZEN_CANDIDATE_TREE,
  FROZEN_SEMVER,
  FROZEN_VERIFICATION_EVIDENCE_DIGEST,
  RECEIPT_ID,
  TARGET_RECEIPT_PATHS,
  assertVerificationEvidenceDigestIsPinned,
  buildPrePublicationReceipt,
  buildVerificationFromEvidence,
  buildVersionBinding,
  computeCanonicalDigests,
  loadFrozenArtifactManifest,
  loadFrozenCapabilityRegistry,
  loadFrozenPayloadSet,
  loadVerificationEvidence,
  readCommittedBytes,
  readFrozenBlob,
  readFrozenVersion,
  resolveCommitTree,
  serializeReceipt,
  sha256File,
  verifyCandidateTree,
  type PrePublicationReceipt,
  type VerificationEvidenceLedger,
} from "../../../scripts/freeze-local-ci-v3-candidate.ts";
import { constructReleasePayloadAt } from "../../../tools/release-payload.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function isJsonSchema(value: unknown): value is AnySchema {
  return (
    typeof value === "boolean" ||
    (value !== null && typeof value === "object" && !Array.isArray(value))
  );
}

const schemaContent: unknown = JSON.parse(
  fs.readFileSync(
    path.join(root, "contracts", "local-ci", "v3", "canary-candidate-receipt.schema.json"),
    "utf8",
  ),
);
if (!isJsonSchema(schemaContent)) {
  throw new TypeError("canary-candidate-receipt schema must be a valid JSON schema");
}

const ajv = new Ajv2020({
  allErrors: true,
  strictSchema: true,
  strictTypes: false,
});
const validateReceiptSchema = ajv.compile(schemaContent);

function loadReceipt(relativePath: string): PrePublicationReceipt {
  const content = fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
  return JSON.parse(content) as PrePublicationReceipt;
}

void test("pre-publication receipt and canary candidate receipt files exist and are identical", () => {
  for (const relativePath of TARGET_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    assert.equal(fs.existsSync(fullPath), true, `Receipt missing at ${relativePath}`);
  }

  const prePub = fs.readFileSync(
    path.join(root, ...TARGET_RECEIPT_PATHS[0].split("/")),
    "utf8",
  );
  const canaryCand = fs.readFileSync(
    path.join(root, ...TARGET_RECEIPT_PATHS[1].split("/")),
    "utf8",
  );
  assert.equal(prePub, canaryCand, "Both receipt files must have identical contents");
});

void test("frozen receipt validates against canary-candidate-receipt.schema.json", () => {
  const receiptJson = loadReceipt("contracts/local-ci/v3/pre-publication-receipt.json");

  const isValid = validateReceiptSchema(receiptJson);
  assert.equal(isValid, true, JSON.stringify(validateReceiptSchema.errors, null, 2));
});

void test("frozen receipt binds exact immutable candidate identity and lineage", () => {
  const receipt = loadReceipt("contracts/local-ci/v3/pre-publication-receipt.json");

  assert.equal(receipt.receiptId, RECEIPT_ID);
  assert.equal(receipt.publicationState, "candidate");
  assert.equal(receipt.candidate.commit, FROZEN_CANDIDATE_COMMIT);
  assert.equal(receipt.candidate.tree, FROZEN_CANDIDATE_TREE);
  assert.equal(receipt.candidate.semver, FROZEN_SEMVER);
  assert.equal(receipt.candidate.tag, `v${FROZEN_SEMVER}`);

  assert.equal(receipt.lineage.contractId, "repo-template/local-ci-v3");
  assert.equal(receipt.lineage.outcomeContractId, "repo-template/local-ci-outcome-v1");
  assert.equal(receipt.lineage.proofOfDetectionRequired, true);

  assert.deepEqual(receipt.proofOfDetectionSemantics.outcomeStates, [
    "pass",
    "fail",
    "skipped",
    "could-not-execute",
  ]);

  assert.equal(
    receipt.canaryGuidance.modelGateway.issue,
    "https://github.com/spencer-shadley/model-gateway/issues/991",
  );
  assert.equal(
    receipt.canaryGuidance.repoFactory.issue,
    "https://github.com/spencer-shadley/repo-factory/issues/187",
  );
  assert.equal(
    receipt.canaryGuidance.convergence.issue,
    "https://github.com/spencer-shadley/repo-template/issues/341",
  );
});

void test("receipt deterministically matches recomputed candidate bytes and digest", () => {
  const diskSerialized = fs.readFileSync(
    path.join(root, "contracts/local-ci/v3/pre-publication-receipt.json"),
    "utf8",
  );
  const recomputed = buildPrePublicationReceipt();
  const recomputedSerialized = serializeReceipt(recomputed);

  assert.equal(diskSerialized, recomputedSerialized);

  const { receiptDigest, ...body } = recomputed;
  const calculatedDigest = sha256CanonicalJson(body);
  assert.equal(receiptDigest, calculatedDigest);
});

void test("all canonical V3 artifacts on disk match their recorded digests", () => {
  const digests = computeCanonicalDigests();
  const receipt = loadReceipt("contracts/local-ci/v3/pre-publication-receipt.json");

  for (const [filePath, expectedDigest] of Object.entries(receipt.canonicalDigests)) {
    const actualDigest = sha256File(filePath);
    assert.equal(
      actualDigest,
      expectedDigest,
      `Digest mismatch for canonical file: ${filePath}`,
    );
  }
  assert.deepEqual(receipt.canonicalDigests, digests);
});

void test("schema rejects premature publicationState", () => {
  const receipt = buildPrePublicationReceipt();
  const premature = { ...receipt, publicationState: "published" };
  const isValid = validateReceiptSchema(premature);
  assert.equal(isValid, false, "Schema must reject publicationState other than 'candidate'");
});

void test("schema rejects invalid git commit sha", () => {
  const receipt = buildPrePublicationReceipt();
  const invalid = {
    ...receipt,
    candidate: { ...receipt.candidate, commit: "not-a-sha" },
  };
  const isValid = validateReceiptSchema(invalid);
  assert.equal(isValid, false, "Schema must reject invalid git commit sha");
});

// --- repo-template#340 repair regressions -----------------------------------
// Each of these proves one of the four failure modes named in the repair
// acceptance criteria fails closed: a mutated working tree, a wrong frozen
// tree, a skipped/failed/unbound verification check, and a schema-valid
// tampered receipt.

void test("REGRESSION: a mutated working-tree copy of a canonical file does not change the frozen digest (defect: working-tree hashing)", () => {
  const [firstCanonicalPath] = CANONICAL_V3_PATHS;
  assert.ok(firstCanonicalPath, "CANONICAL_V3_PATHS must not be empty");
  const fullPath = path.join(root, ...firstCanonicalPath.split("/"));
  const original = fs.readFileSync(fullPath);
  const before = sha256File(firstCanonicalPath);
  try {
    fs.writeFileSync(
      fullPath,
      Buffer.concat([original, Buffer.from("\n// REGRESSION-mutation\n")]),
    );
    const after = sha256File(firstCanonicalPath);
    assert.equal(
      after,
      before,
      "sha256File must read the frozen commit's git object, not the mutated working-tree bytes",
    );
  } finally {
    fs.writeFileSync(fullPath, original);
  }
});

void test("REGRESSION: a wrong declared candidate tree is rejected (defect: commit/tree pairing never proven)", () => {
  const realTree = resolveCommitTree(FROZEN_CANDIDATE_COMMIT);
  assert.equal(realTree, FROZEN_CANDIDATE_TREE);
  assert.throws(
    () => verifyCandidateTree(FROZEN_CANDIDATE_COMMIT, "0".repeat(40)),
    /tree mismatch/i,
    "A commit/tree pairing that does not actually resolve must throw, not freeze",
  );
});

void test("REGRESSION: verification evidence for a different commit is rejected (unbound evidence)", () => {
  const evidence = loadVerificationEvidence();
  const unbound: VerificationEvidenceLedger = { ...evidence, boundCommit: "1".repeat(40) };
  assert.throws(
    () => buildVerificationFromEvidence(unbound, FROZEN_CANDIDATE_COMMIT),
    /not the declared candidate/,
  );
});

void test("REGRESSION: a skipped/failed check in the evidence ledger is rejected, never silently 'passed'", () => {
  const evidence = loadVerificationEvidence();
  const [someCheckId] = Object.keys(evidence.checks);
  assert.ok(someCheckId, "evidence ledger must contain at least one check");
  const baseCheck = evidence.checks[someCheckId];
  assert.ok(baseCheck, "evidence ledger entry for someCheckId must exist");
  const skipped: VerificationEvidenceLedger = {
    ...evidence,
    checks: {
      ...evidence.checks,
      [someCheckId]: { ...baseCheck, result: "skipped", exitCode: 1 },
    },
  };
  assert.throws(
    () => buildVerificationFromEvidence(skipped, evidence.boundCommit),
    /did not pass/,
  );

  const failed: VerificationEvidenceLedger = {
    ...evidence,
    checks: {
      ...evidence.checks,
      [someCheckId]: { ...baseCheck, result: "failed", exitCode: 1 },
    },
  };
  assert.throws(
    () => buildVerificationFromEvidence(failed, evidence.boundCommit),
    /did not pass/,
  );

  const missing: VerificationEvidenceLedger = {
    ...evidence,
    checks: Object.fromEntries(
      Object.entries(evidence.checks).filter(([id]) => id !== someCheckId),
    ),
  };
  assert.throws(
    () => buildVerificationFromEvidence(missing, evidence.boundCommit),
    /missing required check/,
  );
});

void test("RT-370: committed exitCode 0→1 on the committed-bytes path is refused by freeze gates", () => {
  // In-memory skipped/failed coverage above does not exercise the committed-bytes
  // path added by #369. Clone, commit an exitCode flip on proof-of-detection-self-test,
  // and assert every freeze gate refuses (repo-template#370).
  const clone = cloneWorkingStateAtHead("rt370-exitcode-");
  try {
    const fullPath = path.join(clone, ...LEDGER_PATH.split("/"));
    const ledger = JSON.parse(fs.readFileSync(fullPath, "utf8")) as {
      boundCommit: string;
      checks: Record<
        string,
        { finishedAt: string; exitCode: number; result: string; command: string }
      >;
    };
    const targetId = "proof-of-detection-self-test";
    const target = ledger.checks[targetId];
    assert.ok(target, "ledger must contain proof-of-detection-self-test");
    assert.equal(target.exitCode, 0);
    assert.equal(target.result, "passed");
    ledger.checks[targetId] = { ...target, exitCode: 1, result: "failed" };
    fs.writeFileSync(fullPath, `${JSON.stringify(ledger, null, 2)}\n`);
    gitIn(clone, ["add", "--", LEDGER_PATH]);
    gitIn(clone, [
      "-c",
      "user.name=rt370",
      "-c",
      "user.email=rt370@example.com",
      "commit",
      "-m",
      "test: flip proof-of-detection-self-test exitCode 0→1",
    ]);
    for (const mode of ["--check", "--write", "--self-test"] as const) {
      const { status, output } = runFreeze(clone, mode);
      assert.notEqual(status, 0, `freeze ${mode} must refuse committed exitCode flip`);
      assert.match(
        output,
        /did not pass|evidenceDigest|Verification check|FROZEN_VERIFICATION_EVIDENCE_DIGEST|proof-of-detection-self-test/,
        `freeze ${mode} refusal must name the verification failure`,
      );
    }
  } finally {
    fs.rmSync(path.dirname(clone), { recursive: true, force: true });
  }
});

void test("REGRESSION: a schema-valid tampered receipt is rejected by the consumer digest validator", () => {
  const receipt = buildPrePublicationReceipt();

  // Sanity: the real, untampered receipt validates.
  const genuine = validateLocalCiV3CandidateReceiptV1(receipt);
  assert.equal(genuine.ok, true, JSON.stringify(!genuine.ok && genuine.diagnostics));

  // Tamper a field without recomputing receiptDigest. Every individual field
  // still matches its declared shape/pattern (schema-valid), but the digest
  // no longer matches the canonical recomputation of the body.
  const tampered = {
    ...receipt,
    candidate: { ...receipt.candidate, commit: "1".repeat(40) },
  };
  assert.equal(
    validateReceiptSchema(tampered),
    true,
    "the tampered receipt must still be schema-valid for this to be a meaningful regression",
  );

  const validated = validateLocalCiV3CandidateReceiptV1(tampered);
  assert.equal(
    validated.ok,
    false,
    "the consumer digest validator must reject a schema-valid but digest-tampered receipt",
  );
});

// --- repo-template#340 RT-340b regressions ----------------------------------
// PR #363 repaired `sha256File`, the commit/tree proof and the evidence ledger,
// but left three receipt inputs -- the release payload set, the artifact
// manifest and the capability bundle registry -- reading the current checkout,
// and left `tools/release-payload.ts` enumerating `git ls-tree -rz HEAD`. The
// independent exact-head review of PR #363 (review 5205237477, head 7cef1596)
// exploited that: it committed one unrelated `.gitignore` line on top of the
// frozen candidate, re-derived, and every gate accepted a receipt whose payload
// and receipt digests had moved while `candidate.commit`, `candidate.tree` and
// `treeVerification.matches: true` had not.
//
// The tests below reproduce that attack and cover the payload-set,
// artifact-manifest and capability-registry paths it went through.

/** The digests the frozen candidate commit actually declares, read independently of the receipt. */
function frozenFieldAt(relativePath: string, field: string): unknown {
  const parsed: unknown = JSON.parse(
    readFrozenBlob(FROZEN_CANDIDATE_COMMIT, relativePath).toString("utf8"),
  );
  assert.ok(parsed !== null && typeof parsed === "object", `${relativePath} must be a JSON object`);
  return (parsed as Record<string, unknown>)[field];
}

/**
 * Build a real, unreferenced commit on top of the frozen candidate that changes
 * one tracked file, using git plumbing only: no branch, ref, index or working
 * tree is touched, so this cannot disturb the lane it runs in. This is the
 * reviewer's `.gitignore` mutation, reproduced as a test fixture.
 */
function commitOnTopOfFrozenCandidate(relativePath: string, appended: string): string {
  const git = (args: readonly string[], options: { input?: string } = {}): string =>
    execFileSync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      ...(options.input === undefined ? {} : { input: options.input }),
    }).trim();

  const mutated = `${readFrozenBlob(FROZEN_CANDIDATE_COMMIT, relativePath).toString("utf8")}${appended}`;
  const blob = git(["hash-object", "-w", "--stdin"], { input: mutated });
  const temporaryIndex = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "rt340b-index-")),
    "index",
  );
  const previousIndex = process.env["GIT_INDEX_FILE"];
  process.env["GIT_INDEX_FILE"] = temporaryIndex;
  try {
    git(["read-tree", FROZEN_CANDIDATE_TREE]);
    git(["update-index", "--cacheinfo", `100644,${blob},${relativePath}`]);
    const tree = git(["write-tree"]);
    assert.notEqual(tree, FROZEN_CANDIDATE_TREE, "the mutation must actually change the tree");
    return git([
      "-c",
      "user.name=rt340b-test",
      "-c",
      "user.email=rt340b@example.invalid",
      "commit-tree",
      tree,
      "-p",
      FROZEN_CANDIDATE_COMMIT,
      "-m",
      "rt340b regression fixture: one unrelated line on top of the frozen candidate",
    ]);
  } finally {
    if (previousIndex === undefined) delete process.env["GIT_INDEX_FILE"];
    else process.env["GIT_INDEX_FILE"] = previousIndex;
  }
}

/** The diagnostic codes a validation result carries, or none when it succeeded. */
function diagnosticCodes(
  result: { readonly ok: true } | { readonly ok: false; readonly diagnostics: readonly { readonly code: string }[] },
): readonly string[] {
  return result.ok ? [] : result.diagnostics.map((row) => row.code);
}

/** Temporarily replace a tracked working-tree file, then restore it exactly. */
function withMutatedWorkingTreeFile(relativePath: string, run: () => void): void {
  const fullPath = path.join(root, ...relativePath.split("/"));
  const original = fs.readFileSync(fullPath);
  const parsed: unknown = JSON.parse(original.toString("utf8"));
  assert.ok(parsed !== null && typeof parsed === "object", `${relativePath} must be a JSON object`);
  const mutated = { ...(parsed as Record<string, unknown>), rt340bMutation: "regression" };
  try {
    fs.writeFileSync(fullPath, `${JSON.stringify(mutated, null, 2)}\n`, "utf8");
    run();
  } finally {
    fs.writeFileSync(fullPath, original);
  }
}

void test("RT-340b: every manifest digest in the receipt equals the value the frozen commit itself declares", () => {
  const receipt = loadReceipt("contracts/local-ci/v3/pre-publication-receipt.json");

  assert.equal(
    receipt.manifestDigests.releasePayloadSet.manifestDigest,
    frozenFieldAt("release/release-payload-set.json", "releaseDigest"),
  );
  assert.equal(
    receipt.manifestDigests.artifactManifest.manifestDigest,
    frozenFieldAt("artifacts/adoption-shell-v2/artifact-manifest.json", "manifestDigest"),
  );
  assert.equal(
    receipt.manifestDigests.capabilityBundleRegistry.registryDigest,
    frozenFieldAt("contracts/adoption-shell-v2/capability-bundle-registry.json", "registryDigest"),
  );

  // The exact values at the frozen candidate d2550c5b (3.3.2 re-cut). The
  // previous candidate 88591ee pinned bd900c3e.../5e87485f... here; before
  // RT-340b the receipt recorded a branch tip's cc700a5e.../bc15d49e... instead.
  assert.equal(
    receipt.manifestDigests.releasePayloadSet.manifestDigest,
    "fdbb92fa80b7417ea18f12fa75e98d97f02011c3827ecb2a133de5791d3c5e65",
  );
  assert.equal(
    receipt.manifestDigests.artifactManifest.manifestDigest,
    "03f5e1221d69b668665e9b3e768118892a967a6eca79ce1ea55bdbb08dd63c06",
  );
});

void test("RT-340b: the release payload enumeration is pinned to the frozen commit, not HEAD", () => {
  const frozenDigest = constructReleasePayloadAt(FROZEN_CANDIDATE_COMMIT).payload.releaseDigest;
  assert.equal(
    frozenDigest,
    frozenFieldAt("release/release-payload-set.json", "releaseDigest"),
    "the frozen commit's committed payload set must be reproducible by enumerating that same commit",
  );

  const mutatedCommit = commitOnTopOfFrozenCandidate(
    ".gitignore",
    "\n# rt340b-regression-unrelated-line\n",
  );
  const mutatedDigest = constructReleasePayloadAt(mutatedCommit).payload.releaseDigest;
  assert.notEqual(
    mutatedDigest,
    frozenDigest,
    "the fixture commit must actually move the payload digest, or this test proves nothing",
  );
  assert.equal(
    constructReleasePayloadAt(FROZEN_CANDIDATE_COMMIT).payload.releaseDigest,
    frozenDigest,
    "enumerating the frozen commit must be unaffected by any later commit",
  );
});

void test("RT-340b: a working-tree edit to the payload set, artifact manifest or capability registry cannot move a single receipt digest", () => {
  const expected = serializeReceipt(buildPrePublicationReceipt());
  const loaders = [
    ["release/release-payload-set.json", () => loadFrozenPayloadSet().releaseDigest],
    [
      "artifacts/adoption-shell-v2/artifact-manifest.json",
      () => loadFrozenArtifactManifest().manifestDigest,
    ],
    [
      "contracts/adoption-shell-v2/capability-bundle-registry.json",
      () => loadFrozenCapabilityRegistry().registryDigest,
    ],
  ] as const;

  for (const [relativePath, readDigest] of loaders) {
    const before = readDigest();
    withMutatedWorkingTreeFile(relativePath, () => {
      assert.equal(
        readDigest(),
        before,
        `${relativePath} must be read from ${FROZEN_CANDIDATE_COMMIT}, not from the checkout`,
      );
      assert.equal(
        serializeReceipt(buildPrePublicationReceipt()),
        expected,
        `mutating ${relativePath} in the working tree changed the frozen receipt`,
      );
    });
  }
});

/**
 * A release payload digest from a tree that is provably NOT the frozen one.
 * These tests used HEAD, which only differs from the frozen tree while HEAD
 * changes payload bytes; a receipt-only re-cut (HEAD = candidate + receipts)
 * makes HEAD's payload identical and the mutation a silent no-op. The prior
 * frozen candidate 88591ee is immutable and asserted to differ.
 */
const OTHER_TREE_COMMIT = "88591ee869bb109ef481171aa817d1ed204a970e";
function otherTreePayloadDigest(): string {
  const other = constructReleasePayloadAt(OTHER_TREE_COMMIT).payload.releaseDigest;
  assert.notEqual(
    other,
    constructReleasePayloadAt(FROZEN_CANDIDATE_COMMIT).payload.releaseDigest,
    "the mutation source must describe a different tree than the frozen candidate",
  );
  return other;
}

void test("RT-340b: freeze --check and --self-test reject a receipt whose payload digest describes a tree other than the one it names", () => {
  const relativePath = "contracts/local-ci/v3/pre-publication-receipt.json";
  const fullPath = path.join(root, ...relativePath.split("/"));
  const original = fs.readFileSync(fullPath);

  // The exact identity-mismatched receipt the PR #363 reviewer produced: the
  // branch tip's payload digest under the frozen commit's declared identity,
  // with receiptDigest honestly recomputed so no tamper check can see it.
  const receipt = JSON.parse(original.toString("utf8")) as PrePublicationReceipt;
  const { receiptDigest: _ignored, ...body } = {
    ...receipt,
    manifestDigests: {
      ...receipt.manifestDigests,
      releasePayloadSet: {
        ...receipt.manifestDigests.releasePayloadSet,
        manifestDigest: otherTreePayloadDigest(),
      },
    },
  };
  const mismatched = { ...body, receiptDigest: sha256CanonicalJson(body) };

  assert.equal(
    validateReceiptSchema(mismatched),
    true,
    "the mismatched receipt must still be schema-valid for this to be a meaningful regression",
  );
  assert.equal(
    validateLocalCiV3CandidateReceiptV1(mismatched).ok,
    true,
    "digest recomputation alone cannot see this: it is honestly recomputed, just over the wrong tree",
  );

  try {
    fs.writeFileSync(fullPath, `${JSON.stringify(mismatched, null, 2)}\n`, "utf8");
    for (const mode of ["--check", "--self-test"]) {
      assert.throws(
        () =>
          execFileSync("node", ["scripts/freeze-local-ci-v3-candidate.ts", mode], {
            cwd: root,
            stdio: "pipe",
          }),
        `freeze ${mode} must reject a receipt whose digests describe a different tree than it names`,
      );
    }
  } finally {
    fs.writeFileSync(fullPath, original);
  }
});

void test("RT-340b: the consumer validator rejects an identity-mismatched receipt against the frozen tree", () => {
  const readBlob = (commit: string, relativePath: string): Uint8Array =>
    readFrozenBlob(commit, relativePath);
  const receipt = loadReceipt("contracts/local-ci/v3/pre-publication-receipt.json");

  const genuine = verifyLocalCiV3CandidateReceiptAgainstFrozenTree(receipt, readBlob);
  assert.equal(genuine.ok, true, JSON.stringify(!genuine.ok && genuine.diagnostics));

  // Case 1: a manifest digest taken from a different tree, honestly re-digested.
  const { receiptDigest: _a, ...payloadBody } = {
    ...receipt,
    manifestDigests: {
      ...receipt.manifestDigests,
      releasePayloadSet: {
        ...receipt.manifestDigests.releasePayloadSet,
        manifestDigest: otherTreePayloadDigest(),
      },
    },
  };
  const mismatchedPayload = { ...payloadBody, receiptDigest: sha256CanonicalJson(payloadBody) };
  assert.equal(validateLocalCiV3CandidateReceiptV1(mismatchedPayload).ok, true);
  const payloadVerdict = verifyLocalCiV3CandidateReceiptAgainstFrozenTree(
    mismatchedPayload,
    readBlob,
  );
  assert.equal(payloadVerdict.ok, false);
  const payloadCodes = diagnosticCodes(payloadVerdict);
  assert.ok(
    payloadCodes.includes("E_FROZEN_INPUT_MISMATCH"),
    JSON.stringify(payloadCodes),
  );

  // Case 2: a frozen-input blob digest that the named commit does not record.
  const firstBlobPath = Object.keys(receipt.frozenInputs.blobDigests)[0];
  assert.ok(firstBlobPath, "frozenInputs.blobDigests must not be empty");
  const { receiptDigest: _b, ...blobBody } = {
    ...receipt,
    frozenInputs: {
      ...receipt.frozenInputs,
      blobDigests: { ...receipt.frozenInputs.blobDigests, [firstBlobPath]: "0".repeat(64) },
    },
  };
  const mismatchedBlob = { ...blobBody, receiptDigest: sha256CanonicalJson(blobBody) };
  const blobVerdict = verifyLocalCiV3CandidateReceiptAgainstFrozenTree(mismatchedBlob, readBlob);
  assert.equal(blobVerdict.ok, false);

  // Case 3: a canonical digest that the named commit does not record.
  const firstCanonical = Object.keys(receipt.canonicalDigests)[0];
  assert.ok(firstCanonical, "canonicalDigests must not be empty");
  const { receiptDigest: _c, ...canonicalBody } = {
    ...receipt,
    canonicalDigests: { ...receipt.canonicalDigests, [firstCanonical]: "0".repeat(64) },
  };
  const mismatchedCanonical = {
    ...canonicalBody,
    receiptDigest: sha256CanonicalJson(canonicalBody),
  };
  assert.equal(
    verifyLocalCiV3CandidateReceiptAgainstFrozenTree(mismatchedCanonical, readBlob).ok,
    false,
  );
});

void test("RT-340b: a frozen manifest that parses but is not a JSON object is reported, never silently skipped", () => {
  const receipt = loadReceipt("contracts/local-ci/v3/pre-publication-receipt.json");
  const poisoned = "artifacts/adoption-shell-v2/artifact-manifest.json";
  const readBlob = (commit: string, relativePath: string): Uint8Array =>
    relativePath === poisoned
      ? new TextEncoder().encode("[]")
      : readFrozenBlob(commit, relativePath);

  // The raw-byte digest checks cannot catch this on their own, so the manifest
  // binding check must refuse the file rather than drop its bindings.
  const verdict = verifyLocalCiV3CandidateReceiptAgainstFrozenTree(receipt, readBlob);
  assert.equal(verdict.ok, false);
  const codes = diagnosticCodes(verdict);
  assert.ok(
    codes.includes("E_FROZEN_INPUT_UNREADABLE") || codes.includes("E_FROZEN_INPUT_MISMATCH"),
    JSON.stringify(codes),
  );
});

// --- repo-template#368 (RT-340c) ------------------------------------------
// RT-340b left one working-tree read whose content reached `receiptDigest`:
// `loadVerificationEvidence()` read the ledger with `fs.readFileSync`, and each
// check's `startedAt`/`finishedAt` were copied into the digested receipt body.
// The PR #365 reviewer moved one `finishedAt` to 2099 and `receiptDigest` moved
// with it, while `candidate.commit`, `candidate.tree` and
// `treeVerification.matches: true` stayed correct and every gate accepted the
// result. The ledger provably cannot live in the frozen tree -- evidence about a
// commit postdates that commit -- so it is bound to committed bytes instead.

void test("RT-340c: an uncommitted edit to the verification evidence ledger cannot reach receiptDigest", () => {
  const relativePath = "contracts/local-ci/v3/verification-evidence.json";
  const fullPath = path.join(root, ...relativePath.split("/"));
  const original = fs.readFileSync(fullPath);
  const before = serializeReceipt(buildPrePublicationReceipt());

  const ledger: unknown = JSON.parse(original.toString("utf8"));
  assert.ok(ledger !== null && typeof ledger === "object", "ledger must be a JSON object");
  const checks = (ledger as { checks: Record<string, { finishedAt: string }> }).checks;
  const [firstCheckId] = Object.keys(checks);
  assert.ok(firstCheckId, "the ledger must contain at least one check");
  const firstCheck = checks[firstCheckId];
  assert.ok(firstCheck, "the first check must exist");

  // The reviewer's exact mutation.
  firstCheck.finishedAt = "2099-01-01T00:00:00.000Z";
  try {
    fs.writeFileSync(fullPath, `${JSON.stringify(ledger, null, 2)}
`, "utf8");
    assert.throws(
      () => buildPrePublicationReceipt(),
      /differ from its committed bytes/,
      "an uncommitted ledger edit must refuse the freeze, never mint a new receiptDigest",
    );
    assert.throws(() => loadVerificationEvidence(), /differ from its committed bytes/);
  } finally {
    fs.writeFileSync(fullPath, original);
  }

  assert.equal(
    serializeReceipt(buildPrePublicationReceipt()),
    before,
    "restoring the committed bytes must restore the exact receipt",
  );
});

void test("RT-340c: the receipt names the exact evidence bytes it consumed", () => {
  const receipt = loadReceipt("contracts/local-ci/v3/pre-publication-receipt.json");
  assert.equal(receipt.verification.evidenceSource, "committed-bytes");
  assert.equal(
    receipt.verification.evidenceDigest,
    createHash("sha256")
      .update(readCommittedBytes("contracts/local-ci/v3/verification-evidence.json"))
      .digest("hex"),
  );
  assert.equal(receipt.verification.evidenceBoundCommit, FROZEN_CANDIDATE_COMMIT);
});

void test("RT-340c: readCommittedBytes rejects a file that is not committed at HEAD", () => {
  assert.throws(
    () => readCommittedBytes("contracts/local-ci/v3/does-not-exist-rt340c.json"),
    /Failed to read committed bytes/,
  );
});

void test("RT-340b: the receipt binds the frozen tree's own VERSION/TEMPLATE_VERSION and refuses a reused or regressed identity", () => {
  const receipt = loadReceipt("contracts/local-ci/v3/pre-publication-receipt.json");

  assert.equal(receipt.versionBinding.frozenVersion, readFrozenVersion("VERSION"));
  assert.equal(
    receipt.versionBinding.frozenTemplateVersion,
    readFrozenVersion("TEMPLATE_VERSION"),
  );
  assert.equal(receipt.versionBinding.candidateSemver, FROZEN_SEMVER);
  assert.equal(
    receipt.versionBinding.trackingIssue,
    "https://github.com/spencer-shadley/repo-template/issues/364",
  );

  // The frozen tree says 3.1.0 while the candidate says 3.2.0: a real,
  // now-recorded discrepancy (#364). Claiming the frozen tree's already-released
  // identity, or an older one, must fail closed instead.
  assert.throws(
    () => buildVersionBinding(receipt.versionBinding.frozenVersion),
    /not strictly ahead/,
  );
  assert.throws(() => buildVersionBinding("3.0.0"), /not strictly ahead/);
  assert.throws(() => buildVersionBinding("3.2"), /bare X\.Y\.Z semver/);
});

// ---------------------------------------------------------------------------
// repo-template#368 (RT-340c, repair round 2): the COMMITTED re-record attack.
//
// Round 1 bound the evidence ledger to committed bytes, which closed the
// uncommitted path. The independent exact-head review of PR #369 (review
// 5206050540) then proved by execution that committing the same mutation still
// worked: one `finishedAt` 2026-09-15T03:15:05.604Z -> 2026-09-15T03:15:06.999Z
// moved `receiptDigest` e7021ea1... -> e6821fb9..., and `--write`, `--check`,
// `--self-test` and the consumer validator all exited 0.
//
// These two tests run that attack for real. They cannot run in-process: the
// mutation must be COMMITTED, and committing in the lane's own worktree would
// corrupt it. So they clone the repository (replaying the current working-tree
// state of every tracked file this change has modified, so the code under test
// is the code on disk rather than the last commit), commit the re-record there,
// and run the real CLI gates inside the throwaway clone.
// ---------------------------------------------------------------------------

const CLONE_GIT_IDENTITY = [
  "-c",
  "user.name=rt340c-test",
  "-c",
  "user.email=rt340c@example.invalid",
] as const;

const LEDGER_PATH = "contracts/local-ci/v3/verification-evidence.json";
const NEWLINE = "\n";

function gitIn(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
}

/**
 * Clone the repository at HEAD into a throwaway directory and replay every
 * tracked modification the working tree currently carries, so the clone
 * exercises the bytes on disk. Returns the clone path; the caller removes it.
 */
function cloneWorkingStateAtHead(label: string): string {
  const clone = path.join(fs.mkdtempSync(path.join(os.tmpdir(), label)), "repo");
  gitIn(root, ["clone", "--quiet", "--no-hardlinks", root, clone]);

  // `--name-only -z --no-renames` is the enumeration that cannot lose a path:
  // NUL-separated so a path with spaces or non-ASCII bytes is never quoted or
  // split, `--no-renames` so a rename appears as both its old and its new path
  // rather than one record this loop would have to decompose, and `HEAD` so
  // staged and unstaged changes are covered together. Untracked files are
  // excluded by construction, which is what keeps the lane's own heartbeat logs
  // out of the clone. A dropped path here would silently leave the clone on
  // HEAD bytes while every assertion below still passed.
  const dirty = execFileSync("git", ["diff", "--name-only", "-z", "--no-renames", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((entry) => entry.length > 0);
  for (const relative of dirty) {
    const source = path.join(root, ...relative.split("/"));
    const destination = path.join(clone, ...relative.split("/"));
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    } else {
      fs.rmSync(destination, { force: true });
    }
  }
  if (dirty.length > 0) {
    gitIn(clone, ["add", "--all"]);
    gitIn(clone, [
      ...CLONE_GIT_IDENTITY,
      "commit",
      "--quiet",
      "-m",
      "working-tree state under test",
    ]);
  }
  assert.equal(
    gitIn(clone, ["status", "--porcelain"]),
    "",
    "the clone must start from a clean, fully committed tree",
  );
  // A clean clone is not proof the replay worked: a path the enumeration missed
  // would leave the clone on HEAD bytes and still look clean. Assert the two
  // inputs these tests actually depend on really are the bytes on disk.
  for (const relative of ["scripts/freeze-local-ci-v3-candidate.ts", LEDGER_PATH]) {
    assert.equal(
      fs.readFileSync(path.join(clone, ...relative.split("/"))).equals(
        fs.readFileSync(path.join(root, ...relative.split("/"))),
      ),
      true,
      `the clone must carry the working-tree bytes of ${relative}, not HEAD's`,
    );
  }
  return clone;
}

/** Commit the reviewer's exact attack: one timestamp moved, nothing substantive. */
function commitTimestampOnlyReRecord(clone: string): { before: string; after: string } {
  const fullPath = path.join(clone, ...LEDGER_PATH.split("/"));
  const original = fs.readFileSync(fullPath);
  const ledger = JSON.parse(original.toString("utf8")) as {
    checks: Record<
      string,
      { finishedAt: string; exitCode: number; result: string; command: string }
    >;
  };
  const [firstCheckId] = Object.keys(ledger.checks);
  assert.ok(firstCheckId, "the ledger must contain at least one check");
  const firstCheck = ledger.checks[firstCheckId];
  assert.ok(firstCheck, "the first check must exist");
  const before = firstCheck.finishedAt;
  const after = new Date(Date.parse(before) + 1_395).toISOString();
  firstCheck.finishedAt = after;

  const rewritten = Buffer.from(JSON.stringify(ledger, null, 2) + NEWLINE, "utf8");
  assert.equal(rewritten.equals(original), false, "the re-record must change the ledger bytes");

  // Nothing a consumer must trust changes: same commands, same exit codes, same
  // results. Only a timestamp moves. This is what makes the attack the hazard
  // rather than an ordinary substantive edit.
  const committed = JSON.parse(gitIn(clone, ["show", "HEAD:" + LEDGER_PATH])) as typeof ledger;
  for (const [id, check] of Object.entries(ledger.checks)) {
    const previous = committed.checks[id];
    assert.ok(previous, `check ${id} must exist before the re-record`);
    assert.equal(check.command, previous.command);
    assert.equal(check.exitCode, previous.exitCode);
    assert.equal(check.result, previous.result);
  }

  fs.writeFileSync(fullPath, rewritten);
  gitIn(clone, [
    ...CLONE_GIT_IDENTITY,
    "commit",
    "--quiet",
    "-a",
    "-m",
    "re-record verification evidence timestamps",
  ]);
  assert.equal(gitIn(clone, ["status", "--porcelain"]), "", "the re-record must be committed");
  return { before, after };
}

function runFreeze(clone: string, mode: string): { status: number; output: string } {
  const result = spawnSync("node", ["scripts/freeze-local-ci-v3-candidate.ts", mode], {
    cwd: clone,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    output: result.stdout + result.stderr,
  };
}

function receiptDigestIn(clone: string): string {
  const receipt = JSON.parse(
    fs.readFileSync(
      path.join(clone, "contracts", "local-ci", "v3", "pre-publication-receipt.json"),
      "utf8",
    ),
  ) as PrePublicationReceipt;
  return receipt.receiptDigest;
}

void test("RT-340c: every freeze gate refuses a COMMITTED timestamp-only re-record of the evidence ledger", () => {
  const clone = cloneWorkingStateAtHead("rt340c-pinned-");
  try {
    const frozenDigest = receiptDigestIn(clone);
    const { before, after } = commitTimestampOnlyReRecord(clone);
    assert.notEqual(before, after);

    for (const mode of ["--write", "--check", "--self-test"]) {
      const { status, output } = runFreeze(clone, mode);
      assert.notEqual(
        status,
        0,
        `freeze ${mode} accepted a committed timestamp-only re-record. The ledger's timestamps reach receiptDigest, so accepting it moves the cross-repository identity repo-template#341, model-gateway#991 and repo-factory#187 pin, for a non-substantive change (repo-template#368). Output: ${output}`,
      );
      assert.ok(
        output.includes(FROZEN_VERIFICATION_EVIDENCE_DIGEST),
        `freeze ${mode} must name the pinned digest it expected. Output: ${output}`,
      );
      assert.match(
        output,
        /has sha256 [0-9a-f]{64}, but this candidate identity is frozen against sha256/,
        `freeze ${mode} must name both the observed and the pinned digest (DOCTRINE section 51). Output: ${output}`,
      );
      assert.ok(
        output.includes("FROZEN_VERIFICATION_EVIDENCE_DIGEST"),
        `freeze ${mode} must name the deliberate exit (DOCTRINE section 51). Output: ${output}`,
      );
    }

    // A refused --write must mint nothing at all.
    assert.equal(
      receiptDigestIn(clone),
      frozenDigest,
      "a refused freeze must leave the committed receipt untouched",
    );
    assert.equal(
      gitIn(clone, ["status", "--porcelain"]),
      "",
      "a refused --write must not rewrite the receipt files",
    );

    // DOCTRINE section 51 corollary 1: the exit the refusal prescribes must
    // actually change the refused state, not merely be asserted.
    const history = gitIn(clone, ["log", "--format=%H", "--", LEDGER_PATH]).split(NEWLINE);
    const pinnedAt = history[1];
    assert.ok(pinnedAt, "the prescribed git log must find the commit carrying the pinned bytes");
    gitIn(clone, ["checkout", pinnedAt, "--", LEDGER_PATH]);
    gitIn(clone, [
      ...CLONE_GIT_IDENTITY,
      "commit",
      "--quiet",
      "-a",
      "-m",
      "restore the pinned ledger bytes",
    ]);
    assert.equal(
      runFreeze(clone, "--check").status,
      0,
      "the exit the refusal prescribes must actually clear the refusal",
    );
  } finally {
    fs.rmSync(path.dirname(clone), { recursive: true, force: true });
  }
});

void test("RT-340c negative control: without the pinned digest the same committed re-record is accepted and moves receiptDigest", () => {
  const clone = cloneWorkingStateAtHead("rt340c-unpinned-");
  try {
    commitTimestampOnlyReRecord(clone);

    // Remove ONLY the pin: turn the gate into a pass-through and leave RT-340c
    // round 1's committed-bytes binding fully intact. Whatever this control
    // reproduces is therefore attributable to the pin and to nothing else.
    const scriptPath = path.join(clone, "scripts", "freeze-local-ci-v3-candidate.ts");
    const marker =
      "export function assertVerificationEvidenceDigestIsPinned(bytes: Buffer): Buffer {";
    const source = fs.readFileSync(scriptPath, "utf8");
    assert.ok(source.includes(marker), "the pinned-digest gate must exist to be removable");
    fs.writeFileSync(
      scriptPath,
      source.replace(marker, marker + NEWLINE + "  return bytes; // negative control: pin removed"),
      "utf8",
    );
    gitIn(clone, [
      ...CLONE_GIT_IDENTITY,
      "commit",
      "--quiet",
      "-a",
      "-m",
      "negative control: remove the pinned-ledger gate",
    ]);

    const before = receiptDigestIn(clone);
    const write = runFreeze(clone, "--write");
    assert.equal(
      write.status,
      0,
      `without the pin the freeze must accept the re-record: that is the defect repo-template#368 was reopened for. Output: ${write.output}`,
    );
    const after = receiptDigestIn(clone);
    assert.notEqual(
      after,
      before,
      "without the pin a timestamp-only re-record must move receiptDigest; if it does not, this control proves nothing about what the pin is doing",
    );

    gitIn(clone, [
      ...CLONE_GIT_IDENTITY,
      "commit",
      "--quiet",
      "-a",
      "-m",
      "mint the re-recorded receipt",
    ]);
    assert.equal(
      runFreeze(clone, "--check").status,
      0,
      "without the pin --check accepts the moved identity, exactly as review 5206050540 found",
    );

    // ...and so does the consumer validator. Nothing downstream objects either,
    // which is why the gate has to live on the producer.
    const moved = JSON.parse(
      fs.readFileSync(
        path.join(clone, "contracts", "local-ci", "v3", "pre-publication-receipt.json"),
        "utf8",
      ),
    ) as unknown;
    assert.equal(
      validateLocalCiV3CandidateReceiptV1(moved).ok,
      true,
      "the moved receipt is internally consistent: no consumer-side check can see this",
    );
  } finally {
    fs.rmSync(path.dirname(clone), { recursive: true, force: true });
  }
});

void test("RT-340c: the pinned-ledger gate accepts the pinned bytes and refuses a timestamp-only re-record", () => {
  const pinned = readCommittedBytes(LEDGER_PATH);
  assert.equal(
    createHash("sha256").update(pinned).digest("hex"),
    FROZEN_VERIFICATION_EVIDENCE_DIGEST,
    "the committed ledger must be the exact bytes the constant names",
  );
  assert.equal(assertVerificationEvidenceDigestIsPinned(pinned), pinned);

  const ledger = JSON.parse(pinned.toString("utf8")) as {
    checks: Record<string, { finishedAt: string }>;
  };
  const [firstCheckId] = Object.keys(ledger.checks);
  assert.ok(firstCheckId, "the ledger must contain at least one check");
  const firstCheck = ledger.checks[firstCheckId];
  assert.ok(firstCheck, "the first check must exist");
  firstCheck.finishedAt = new Date(Date.parse(firstCheck.finishedAt) + 1_000).toISOString();
  assert.throws(
    () =>
      assertVerificationEvidenceDigestIsPinned(
        Buffer.from(JSON.stringify(ledger, null, 2) + NEWLINE, "utf8"),
      ),
    // Built from the imported constant, never a copied literal (PR #369
    // CodeRabbit nit): a reviewed bump of FROZEN_VERIFICATION_EVIDENCE_DIGEST
    // must not leave this assertion silently passing against the old digest.
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes(
        `is frozen against sha256 ${FROZEN_VERIFICATION_EVIDENCE_DIGEST}`,
      ),
    "a timestamp-only re-record must be refused by the pin",
  );
});
