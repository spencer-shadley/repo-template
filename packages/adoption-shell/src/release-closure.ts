import {
  CONTRACT_ID,
  CONTRACT_VERSION,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type ArtifactManifest,
  type CapabilityBundleRegistry,
  type Diagnostic,
  type MaterializerInput,
  type ReleasePayloadSet,
  type TemplateReleaseClosure,
  type TemplateReleaseReceipt,
  type ValidationResult,
} from "./contract.ts";
import { canonicalizeJson } from "./canonical-json.ts";
import { validateCapabilityBundleRegistryV2 } from "./capability-bundles.ts";
import { validateTemplateReleaseReceiptV1 } from "./release-receipt.ts";
import { validateMaterializerInputV2, validateReleasePayloadSetV2 } from "./validate.ts";
import { validateArtifactManifestV2 } from "./validate-manifests.ts";
import { Diagnostics } from "./validation-helpers.ts";

function finish<T>(value: T, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
}

function addNested(
  diagnostics: Diagnostics,
  prefix: string,
  rows: readonly Diagnostic[],
): void {
  for (const row of rows) {
    diagnostics.add(
      row.code,
      `${prefix}${row.pointer}`,
      row.message,
    );
  }
}

function bundleReferences(value: CapabilityBundleRegistry): readonly {
  readonly id: string;
  readonly version: string;
  readonly digest: string;
}[] {
  return value.bundles.map(({ id, version, digest }) => ({ id, version, digest }));
}

function checkEqual(
  actual: unknown,
  expected: unknown,
  pointer: string,
  error: readonly [code: string, message: string],
  diagnostics: Diagnostics,
): void {
  if (actual !== expected) diagnostics.add(error[0], pointer, error[1]);
}

function validateReceiptBinding(
  receipt: TemplateReleaseReceipt,
  payload: ReleasePayloadSet,
  capabilities: CapabilityBundleRegistry,
  artifact: ArtifactManifest,
  diagnostics: Diagnostics,
): void {
  checkEqual(
    receipt.payloadSet.manifestDigest,
    payload.releaseDigest,
    "/receipt/payloadSet/manifestDigest",
    ["E_RELEASE_MANIFEST_MISMATCH", "receipt does not bind the supplied release payload-set manifest"],
    diagnostics,
  );
  checkEqual(
    receipt.payloadSet.payloadDigest,
    payload.payloadDigest,
    "/receipt/payloadSet/payloadDigest",
    ["E_RELEASE_PAYLOAD_MISMATCH", "receipt does not bind the supplied release payload digest"],
    diagnostics,
  );
  checkEqual(
    receipt.payloadSet.entryCount,
    payload.entryCount,
    "/receipt/payloadSet/entryCount",
    ["E_RELEASE_ENTRY_COUNT_MISMATCH", "receipt does not bind the supplied release entry count"],
    diagnostics,
  );
  checkEqual(
    receipt.materializer.artifactManifestDigest,
    artifact.manifestDigest,
    "/receipt/materializer/artifactManifestDigest",
    ["E_ARTIFACT_MANIFEST_MISMATCH", "receipt does not bind the supplied artifact manifest"],
    diagnostics,
  );
  checkEqual(
    receipt.materializer.artifactDigest,
    artifact.artifactDigest,
    "/receipt/materializer/artifactDigest",
    ["E_ARTIFACT_MISMATCH", "receipt does not bind the supplied compiled artifact"],
    diagnostics,
  );
  checkEqual(
    receipt.receiptKind,
    artifact.releaseReceiptKind,
    "/receipt/receiptKind",
    ["E_RELEASE_KIND_MISMATCH", "artifact manifest does not declare the receipt kind"],
    diagnostics,
  );

  if (
    canonicalizeJson(receipt.capabilityBundles) !==
    canonicalizeJson(bundleReferences(capabilities))
  ) {
    diagnostics.add(
      "E_CAPABILITY_BUNDLES_MISMATCH",
      "/receipt/capabilityBundles",
      "receipt must bind every supplied capability bundle exactly once",
    );
  }
}

function validateMaterializerInputClosure(
  receipt: TemplateReleaseReceipt,
  payload: ReleasePayloadSet,
  capabilities: CapabilityBundleRegistry,
  diagnostics: Diagnostics,
): void {
  const materializerInput: MaterializerInput = {
    schemaId: SCHEMA_IDS.materializerInput,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.materializerInput,
    contractId: CONTRACT_ID,
    release: payload,
    capabilities,
    requestedBundles: receipt.capabilityBundles,
    conformance: {
      noLocalIssueTemplateOverride: true,
      noPreCustodyWorkflows: true,
    },
  };
  const materializerResult = validateMaterializerInputV2(materializerInput);
  if (!materializerResult.ok) {
    addNested(diagnostics, "/materializerInput", materializerResult.diagnostics);
  }
}

export function validateTemplateReleaseClosureV1(
  value: unknown,
): ValidationResult<TemplateReleaseClosure> {
  const diagnostics = new Diagnostics();
  const fields = ["receipt", "payloadSet", "capabilityRegistry", "artifactManifest"];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish(value as TemplateReleaseClosure, diagnostics);
  }

  const receiptResult = validateTemplateReleaseReceiptV1(value["receipt"]);
  const payloadResult = validateReleasePayloadSetV2(value["payloadSet"]);
  const capabilityResult = validateCapabilityBundleRegistryV2(
    value["capabilityRegistry"],
  );
  const artifactResult = validateArtifactManifestV2(value["artifactManifest"]);

  if (!receiptResult.ok) {
    addNested(diagnostics, "/receipt", receiptResult.diagnostics);
  }
  if (!payloadResult.ok) {
    addNested(diagnostics, "/payloadSet", payloadResult.diagnostics);
  }
  if (!capabilityResult.ok) {
    addNested(diagnostics, "/capabilityRegistry", capabilityResult.diagnostics);
  }
  if (!artifactResult.ok) {
    addNested(diagnostics, "/artifactManifest", artifactResult.diagnostics);
  }
  if (
    !receiptResult.ok ||
    !payloadResult.ok ||
    !capabilityResult.ok ||
    !artifactResult.ok
  ) {
    return finish(value as unknown as TemplateReleaseClosure, diagnostics);
  }

  const receipt: TemplateReleaseReceipt = receiptResult.value;
  const payload: ReleasePayloadSet = payloadResult.value;
  const capabilities: CapabilityBundleRegistry = capabilityResult.value;
  const artifact: ArtifactManifest = artifactResult.value;

  validateReceiptBinding(receipt, payload, capabilities, artifact, diagnostics);
  validateMaterializerInputClosure(receipt, payload, capabilities, diagnostics);

  return finish(
    {
      receipt,
      payloadSet: payload,
      capabilityRegistry: capabilities,
      artifactManifest: artifact,
    },
    diagnostics,
  );
}
