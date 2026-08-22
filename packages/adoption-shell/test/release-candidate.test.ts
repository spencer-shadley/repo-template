import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canonicalizeJson,
  createReleasePayloadSetV2,
  createTemplateReleaseCandidateV1,
  validateArtifactManifestV2,
  validateMaterializerInputV2,
  validateTemplateReleaseClosureV1,
  type ArtifactManifest,
  type MaterializerInput,
  type ReleasePayloadEntryDraftV2,
  type TemplateReleaseCandidateInput,
  type TemplateReleaseEvidence,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson(relativePath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8")) as unknown;
}

function readMaterializerInput(relativePath: string): MaterializerInput {
  const result = validateMaterializerInputV2(readJson(relativePath));
  if (!result.ok) throw new TypeError(JSON.stringify(result.diagnostics));
  return result.value;
}

function readArtifactManifest(relativePath: string): ArtifactManifest {
  const result = validateArtifactManifestV2(readJson(relativePath));
  if (!result.ok) throw new TypeError(JSON.stringify(result.diagnostics));
  return result.value;
}

function input(): TemplateReleaseCandidateInput {
  const materializerInput = readMaterializerInput(
    "contracts/adoption-shell-v2/fixtures/user-surface-lint-input.json",
  );
  return {
    semver: "3.0.0",
    commit: "1".repeat(40),
    tree: "2".repeat(40),
    payloadSet: materializerInput.release,
    capabilityRegistry: materializerInput.capabilities,
    artifactManifest: readArtifactManifest(
      "artifacts/adoption-shell-v2/artifact-manifest.json",
    ),
  };
}

function releaseEvidence(): TemplateReleaseEvidence {
  return {
    review: {
      subject: "producer-commit",
      url: "https://github.com/spencer-shadley/repo-template/pull/111#pullrequestreview-4815250857",
      result: "approved",
    },
    canaryReceipts: {
      "model-gateway-v1": {
        url: "https://github.com/spencer-shadley/model-gateway/issues/21#issuecomment-5120000001",
        receiptSha256: "a".repeat(64),
      },
      "repo-factory-v1": {
        url: "https://github.com/spencer-shadley/repo-factory/issues/1#issuecomment-5120000002",
        receiptSha256: "b".repeat(64),
      },
    },
    checks: {
      "repo-template-verify": {
        command: "corepack.cmd pnpm verify",
        result: "passed",
      },
    },
    publicationReadback: {
      kind: "producer-tag-ref/v1",
    },
    rollback: {
      disposition: "immutable-correct-forward",
      supersession: "new-semver-only",
    },
  };
}

void test("candidate builder deterministically constructs a valid non-authoritative closure", () => {
  const firstInput = input();
  const firstInputBefore = canonicalizeJson(firstInput);
  const first = createTemplateReleaseCandidateV1(firstInput);
  const secondInput = input();
  const second = createTemplateReleaseCandidateV1({
    artifactManifest: secondInput.artifactManifest,
    capabilityRegistry: secondInput.capabilityRegistry,
    payloadSet: secondInput.payloadSet,
    tree: secondInput.tree,
    commit: secondInput.commit,
    semver: secondInput.semver,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.receipt.publicationState, "candidate");
  assert.equal(first.value.receipt.releaseId, "spencer-shadley/repo-template@3.0.0");
  assert.equal(first.value.receipt.producer.tag, "v3.0.0");
  assert.equal(validateTemplateReleaseClosureV1(first.value).ok, true);
  assert.equal(canonicalizeJson(first.value), canonicalizeJson(second.value));
  assert.equal(canonicalizeJson(firstInput), firstInputBefore);
});

void test("candidate builder fails closed on invalid identity, unknown authority, or payload drift", () => {
  const invalidIdentity = { ...input(), semver: "3" };
  let result = createTemplateReleaseCandidateV1(invalidIdentity);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.pointer === "/semver"));

  const foreignAuthority = {
    ...input(),
    targetRepository: "foreign/repo",
  };
  result = createTemplateReleaseCandidateV1(foreignAuthority);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_UNKNOWN_PROPERTY"));

  const validPayload = input();
  const payloadDrift = {
    ...validPayload,
    payloadSet: {
      ...validPayload.payloadSet,
      payloadDigest: "0".repeat(64),
    },
  };
  result = createTemplateReleaseCandidateV1(payloadDrift);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_PAYLOAD_DIGEST"));
});

void test("candidate builder preserves valid closed release evidence", () => {
  const evidence = releaseEvidence();
  const result = createTemplateReleaseCandidateV1({
    ...input(),
    releaseEvidence: evidence,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.receipt.releaseEvidence, evidence);

  const malformed = {
    ...releaseEvidence(),
    review: {
      ...releaseEvidence().review,
      ambientAuthority: true,
    },
  };
  const rejected = createTemplateReleaseCandidateV1({
    ...input(),
    releaseEvidence: malformed,
  });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.diagnostics.some(
    (row) =>
      row.code === "E_UNKNOWN_PROPERTY" &&
      row.pointer === "/releaseEvidence/review/ambientAuthority",
  ));
});

void test("payload builder hashes, sorts, and reproduces the canonical release payload set", () => {
  const canonical = input().payloadSet;
  const drafts = canonical.entries
    .map(({ contentSha256: _contentSha256, ...entry }) => entry)
    .toReversed();
  const original = canonicalizeJson(drafts);
  const result = createReleasePayloadSetV2(drafts);
  assert.equal(result.ok, true);
  assert.equal(canonicalizeJson(result.value), canonicalizeJson(canonical));
  assert.equal(canonicalizeJson(drafts), original);
});

void test("payload builder rejects malformed drafts without throwing", () => {
  const canonical = input().payloadSet;
  const [first] = canonical.entries;
  assert.ok(first);
  const { contentSha256: _contentSha256, ...validDraft } = first;

  const malformedBase64: ReleasePayloadEntryDraftV2 = {
    ...validDraft,
    contentBase64: "not canonical base64",
  };
  let result = createReleasePayloadSetV2([malformedBase64]);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_BASE64"));

  result = createReleasePayloadSetV2([{ ...validDraft, foreignAuthority: true }]);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_UNKNOWN_PROPERTY"));

  result = createReleasePayloadSetV2([]);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_COUNT"));

  result = createReleasePayloadSetV2(validDraft);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_TYPE"));
});
