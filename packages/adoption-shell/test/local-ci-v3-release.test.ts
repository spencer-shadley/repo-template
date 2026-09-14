import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  sha256CanonicalJson,
  validatePublishedTemplateReleaseReceiptV1,
} from "../../../artifacts/adoption-shell-v2/index.js";
import {
  FROZEN_CANDIDATE_COMMIT,
  FROZEN_CANDIDATE_TREE,
  FROZEN_SEMVER,
  RECEIPT_ID,
  FIRST_CANARY_RECEIPT_DIGEST,
  SECOND_CANARY_RECEIPT_DIGEST,
  TARGET_READBACK_RECEIPT_PATHS,
  TARGET_RELEASE_RECEIPT_PATHS,
  buildPostPublicationReadbackReceipt,
  buildPublishedReleaseReceipt,
  serializeReceipt,
  type PostPublicationReadbackReceipt,
} from "../../../scripts/publish-local-ci-v3-release.ts";
import {
  computeCanonicalDigests,
  sha256File,
} from "../../../scripts/freeze-local-ci-v3-candidate.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function isJsonSchema(value: unknown): value is AnySchema {
  return (
    typeof value === "boolean" ||
    (value !== null && typeof value === "object" && !Array.isArray(value))
  );
}

const schemaContent: unknown = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "contracts",
      "local-ci",
      "v3",
      "post-publication-readback-receipt.schema.json",
    ),
    "utf8",
  ),
);
if (!isJsonSchema(schemaContent)) {
  throw new TypeError("post-publication-readback-receipt schema must be a valid JSON schema");
}

const ajv = new Ajv2020({
  allErrors: true,
  strictSchema: true,
  strictTypes: false,
});
const validateReceiptSchema = ajv.compile(schemaContent);

function loadReadbackReceipt(relativePath: string): PostPublicationReadbackReceipt {
  const content = fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
  return JSON.parse(content) as PostPublicationReadbackReceipt;
}

void test("post-publication readback receipt and published release receipt files exist", () => {
  for (const relativePath of TARGET_READBACK_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    assert.equal(fs.existsSync(fullPath), true, `Readback receipt missing at ${relativePath}`);
  }
  for (const relativePath of TARGET_RELEASE_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    assert.equal(fs.existsSync(fullPath), true, `Published release receipt missing at ${relativePath}`);
  }

  const primary = fs.readFileSync(
    path.join(root, ...TARGET_READBACK_RECEIPT_PATHS[0].split("/")),
    "utf8",
  );
  const secondary = fs.readFileSync(
    path.join(root, ...TARGET_READBACK_RECEIPT_PATHS[1].split("/")),
    "utf8",
  );
  const docsReceipt = fs.readFileSync(
    path.join(root, ...TARGET_READBACK_RECEIPT_PATHS[2].split("/")),
    "utf8",
  );
  assert.equal(primary, secondary, "Readback receipt files must have identical contents");
  assert.equal(primary, docsReceipt, "Docs receipt copy must have identical contents");
});

void test("post-publication readback receipt validates against schema", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");
  const isValid = validateReceiptSchema(receipt);
  assert.equal(isValid, true, JSON.stringify(validateReceiptSchema.errors, null, 2));
});

void test("published release receipt validates with validatePublishedTemplateReleaseReceiptV1", () => {
  const raw = fs.readFileSync(
    path.join(root, "contracts", "local-ci", "v3", "published-release-receipt.json"),
    "utf8",
  );
  const receipt = JSON.parse(raw);
  const validation = validatePublishedTemplateReleaseReceiptV1(receipt);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics, null, 2));
  assert.equal(receipt.publicationState, "published");
  assert.equal(receipt.releaseId, `spencer-shadley/repo-template@${FROZEN_SEMVER}`);
  assert.equal(receipt.producer.commit, FROZEN_CANDIDATE_COMMIT);
  assert.equal(receipt.producer.tree, FROZEN_CANDIDATE_TREE);
  assert.ok(receipt.releaseEvidence);
  assert.equal(receipt.releaseEvidence.review.result, "approved");
  assert.equal(
    receipt.releaseEvidence.canaryReceipts["model-gateway"].receiptSha256,
    FIRST_CANARY_RECEIPT_DIGEST,
  );
  assert.equal(
    receipt.releaseEvidence.canaryReceipts["repo-factory"].receiptSha256,
    SECOND_CANARY_RECEIPT_DIGEST,
  );
  assert.equal(receipt.releaseEvidence.publicationReadback.kind, "producer-tag-ref/v1");
  assert.equal(receipt.releaseEvidence.rollback.disposition, "immutable-correct-forward");
});

void test("readback receipt binds exact immutable candidate identity, lineage, and canaries", () => {
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");

  assert.equal(receipt.receiptId, RECEIPT_ID);
  assert.equal(receipt.publicationState, "published");
  assert.equal(receipt.candidate.commit, FROZEN_CANDIDATE_COMMIT);
  assert.equal(receipt.candidate.tree, FROZEN_CANDIDATE_TREE);
  assert.equal(receipt.candidate.semver, FROZEN_SEMVER);
  assert.equal(receipt.candidate.tag, `v${FROZEN_SEMVER}`);

  assert.equal(receipt.lineage.contractId, "repo-template/local-ci-v3");
  assert.equal(receipt.lineage.outcomeContractId, "repo-template/local-ci-outcome-v1");
  assert.equal(receipt.lineage.proofOfDetectionRequired, true);

  assert.equal(
    receipt.canaryReceipts.modelGateway.issue,
    "https://github.com/spencer-shadley/model-gateway/issues/991",
  );
  assert.equal(
    receipt.canaryReceipts.modelGateway.receiptDigest,
    FIRST_CANARY_RECEIPT_DIGEST,
  );
  assert.equal(receipt.canaryReceipts.modelGateway.candidateDigestMatches, true);

  assert.equal(
    receipt.canaryReceipts.repoFactory.issue,
    "https://github.com/spencer-shadley/repo-factory/issues/187",
  );
  assert.equal(
    receipt.canaryReceipts.repoFactory.receiptDigest,
    SECOND_CANARY_RECEIPT_DIGEST,
  );
  assert.equal(receipt.canaryReceipts.repoFactory.candidateDigestMatches, true);

  assert.equal(receipt.readback.candidateCommitMatches, true);
  assert.equal(receipt.readback.candidateTreeMatches, true);
  assert.equal(receipt.readback.allCanonicalDigestsMatch, true);
  assert.equal(receipt.readback.firstCanaryAgrees, true);
  assert.equal(receipt.readback.secondCanaryAgrees, true);
  assert.equal(receipt.readback.resolvedCommit, FROZEN_CANDIDATE_COMMIT);
  assert.equal(receipt.readback.resolvedTree, FROZEN_CANDIDATE_TREE);
});

void test("readback receipt deterministically matches recomputed bytes and digest", () => {
  const diskSerialized = fs.readFileSync(
    path.join(root, "contracts", "local-ci", "v3", "post-publication-readback-receipt.json"),
    "utf8",
  );
  const recomputed = buildPostPublicationReadbackReceipt();
  const recomputedSerialized = serializeReceipt(recomputed);

  assert.equal(diskSerialized, recomputedSerialized);

  const { receiptDigest, ...body } = recomputed;
  const calculatedDigest = sha256CanonicalJson(body);
  assert.equal(receiptDigest, calculatedDigest);
});

void test("all canonical V3 artifacts on disk match their recorded digests in readback receipt", () => {
  const digests = computeCanonicalDigests();
  const receipt = loadReadbackReceipt("contracts/local-ci/v3/post-publication-readback-receipt.json");

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

void test("schema rejects non-published publicationState in readback receipt", () => {
  const receipt = buildPostPublicationReadbackReceipt();
  const premature = { ...receipt, publicationState: "candidate" };
  const isValid = validateReceiptSchema(premature);
  assert.equal(isValid, false, "Schema must reject publicationState other than 'published'");
});

void test("schema rejects invalid git commit sha in readback receipt", () => {
  const receipt = buildPostPublicationReadbackReceipt();
  const invalid = {
    ...receipt,
    candidate: { ...receipt.candidate, commit: "invalid-sha" },
  };
  const isValid = validateReceiptSchema(invalid);
  assert.equal(isValid, false, "Schema must reject invalid git commit sha");
});

void test("schema rejects missing canary receipt in readback receipt", () => {
  const receipt = buildPostPublicationReadbackReceipt();
  const { modelGateway: _mg, ...canaryReceipts } = receipt.canaryReceipts as Record<string, unknown>;
  const invalid = {
    ...receipt,
    canaryReceipts,
  };
  const isValid = validateReceiptSchema(invalid);
  assert.equal(isValid, false, "Schema must reject missing modelGateway canary receipt");
});
