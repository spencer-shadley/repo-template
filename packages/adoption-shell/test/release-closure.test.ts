import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  sha256CanonicalJson,
  validateTemplateReleaseClosureV1,
  type ArtifactManifest,
  type MaterializerInput,
  type TemplateReleaseClosure,
  type TemplateReleaseReceipt,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function closure(): TemplateReleaseClosure {
  const input = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/user-surface-lint-input.json",
  );
  const artifactManifest = readJson<ArtifactManifest>(
    "artifacts/adoption-shell-v2/artifact-manifest.json",
  );
  const candidate = readJson<TemplateReleaseReceipt>(
    "contracts/adoption-shell-v2/fixtures/template-release-receipt.json",
  );
  const { receiptDigest: _receiptDigest, ...candidateBody } = candidate;
  const body = {
    ...candidateBody,
    payloadSet: {
      ...candidate.payloadSet,
      manifestDigest: input.release.releaseDigest,
      payloadDigest: input.release.payloadDigest,
      entryCount: input.release.entryCount,
    },
    capabilityBundles: input.requestedBundles,
    materializer: {
      ...candidate.materializer,
      artifactManifestDigest: artifactManifest.manifestDigest,
      artifactDigest: artifactManifest.artifactDigest,
    },
  };
  return {
    receipt: {
      ...body,
      receiptDigest: sha256CanonicalJson(body),
    },
    payloadSet: input.release,
    capabilityRegistry: input.capabilities,
    artifactManifest,
  };
}

function codes(value: unknown): readonly string[] {
  const result = validateTemplateReleaseClosureV1(value);
  assert.equal(result.ok, false);
  return result.ok ? [] : result.diagnostics.map((row) => row.code);
}

test("release closure authenticates payload, bundles, and compiled artifact together", () => {
  assert.equal(validateTemplateReleaseClosureV1(closure()).ok, true);
});

test("independently valid but mismatched closure identities fail closed", () => {
  const payload = clone(closure());
  const { receiptDigest: _payloadDigest, ...payloadBody } = payload.receipt;
  const payloadReceiptBody = {
    ...payloadBody,
    payloadSet: {
      ...payload.receipt.payloadSet,
      payloadDigest: "0".repeat(64),
    },
  };
  payload.receipt = {
    ...payloadReceiptBody,
    receiptDigest: sha256CanonicalJson(payloadReceiptBody),
  };
  assert.ok(codes(payload).includes("E_RELEASE_PAYLOAD_MISMATCH"));

  const artifact = clone(closure());
  const { receiptDigest: _artifactDigest, ...artifactBody } = artifact.receipt;
  const artifactReceiptBody = {
    ...artifactBody,
    materializer: {
      ...artifact.receipt.materializer,
      artifactDigest: "0".repeat(64),
    },
  };
  artifact.receipt = {
    ...artifactReceiptBody,
    receiptDigest: sha256CanonicalJson(artifactReceiptBody),
  };
  assert.ok(codes(artifact).includes("E_ARTIFACT_MISMATCH"));

  const capabilities = clone(closure());
  const { receiptDigest: _capabilityDigest, ...capabilityBody } =
    capabilities.receipt;
  const capabilityReceiptBody = {
    ...capabilityBody,
    capabilityBundles: [],
  };
  capabilities.receipt = {
    ...capabilityReceiptBody,
    receiptDigest: sha256CanonicalJson(capabilityReceiptBody),
  };
  assert.ok(codes(capabilities).includes("E_CAPABILITY_BUNDLES_MISMATCH"));
});
