import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  RECEIPT_ID,
  TARGET_RECEIPT_PATHS,
  buildPrePublicationReceipt,
  buildVerificationFromEvidence,
  buildVersionBinding,
  computeCanonicalDigests,
  loadFrozenArtifactManifest,
  loadFrozenCapabilityRegistry,
  loadFrozenPayloadSet,
  loadVerificationEvidence,
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

  // The exact values the PR #363 review computed at 88591ee. Before RT-340b the
  // receipt recorded the branch tip's cc700a5e.../bc15d49e... here instead.
  assert.equal(
    receipt.manifestDigests.releasePayloadSet.manifestDigest,
    "bd900c3edc54790b60b5160681c1fe0c47ef4e82be0ea266b7ae75c9299f8acd",
  );
  assert.equal(
    receipt.manifestDigests.artifactManifest.manifestDigest,
    "5e87485f663042c9e9943f0a5a41c3d87de1e5c6501bb37eeeec3935f0be3838",
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
        manifestDigest: constructReleasePayloadAt("HEAD").payload.releaseDigest,
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
        manifestDigest: constructReleasePayloadAt("HEAD").payload.releaseDigest,
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
