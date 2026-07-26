import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canonicalizeJson,
  createReleasePayloadSetV2,
  createTemplateReleaseCandidateV1,
  validateTemplateReleaseClosureV1,
  type ArtifactManifest,
  type MaterializerInput,
  type ReleasePayloadEntryDraftV2,
  type TemplateReleaseCandidateInput,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

function input(): TemplateReleaseCandidateInput {
  const materializerInput = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/user-surface-lint-input.json",
  );
  return {
    semver: "3.0.0",
    commit: "1".repeat(40),
    tree: "2".repeat(40),
    payloadSet: materializerInput.release,
    capabilityRegistry: materializerInput.capabilities,
    artifactManifest: readJson<ArtifactManifest>(
      "artifacts/adoption-shell-v2/artifact-manifest.json",
    ),
  };
}

test("candidate builder deterministically constructs a valid non-authoritative closure", () => {
  const first = createTemplateReleaseCandidateV1(input());
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
  if (!first.ok || !second.ok) return;
  assert.equal(first.value.receipt.publicationState, "candidate");
  assert.equal(first.value.receipt.releaseId, "spencer-shadley/repo-template@3.0.0");
  assert.equal(first.value.receipt.producer.tag, "v3.0.0");
  assert.equal(validateTemplateReleaseClosureV1(first.value).ok, true);
  assert.equal(canonicalizeJson(first.value), canonicalizeJson(second.value));
});

test("candidate builder fails closed on invalid identity, unknown authority, or payload drift", () => {
  const invalidIdentity = { ...input(), semver: "3" };
  let result = createTemplateReleaseCandidateV1(invalidIdentity);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.pointer === "/semver"));
  }

  const foreignAuthority = {
    ...input(),
    targetRepository: "foreign/repo",
  };
  result = createTemplateReleaseCandidateV1(foreignAuthority);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_UNKNOWN_PROPERTY"));
  }

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
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_PAYLOAD_DIGEST"));
  }
});

test("payload builder hashes, sorts, and reproduces the canonical release payload set", () => {
  const canonical = input().payloadSet;
  const drafts = canonical.entries
    .map(({ contentSha256: _contentSha256, ...entry }) => entry)
    .reverse();
  const original = canonicalizeJson(drafts);
  const result = createReleasePayloadSetV2(drafts);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(canonicalizeJson(result.value), canonicalizeJson(canonical));
  assert.equal(canonicalizeJson(drafts), original);
});

test("payload builder rejects malformed drafts without throwing", () => {
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
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_BASE64"));
  }

  result = createReleasePayloadSetV2([{ ...validDraft, foreignAuthority: true }]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_UNKNOWN_PROPERTY"));
  }

  result = createReleasePayloadSetV2([]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_COUNT"));
  }

  result = createReleasePayloadSetV2(validDraft);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_TYPE"));
  }
});
