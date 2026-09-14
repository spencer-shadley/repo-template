import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import { sha256CanonicalJson } from "../../../artifacts/adoption-shell-v2/index.js";
import {
  FROZEN_CANDIDATE_COMMIT,
  FROZEN_CANDIDATE_TREE,
  FROZEN_SEMVER,
  RECEIPT_ID,
  TARGET_RECEIPT_PATHS,
  buildPrePublicationReceipt,
  computeCanonicalDigests,
  serializeReceipt,
  sha256File,
  type PrePublicationReceipt,
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
