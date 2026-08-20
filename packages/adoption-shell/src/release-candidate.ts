import {
  ARTIFACT_MANIFEST_PATH,
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  RELEASE_PAYLOAD_MANIFEST_PATH,
  RELEASE_RECEIPT_KIND,
  REPO_TEMPLATE_ORIGIN,
  REPO_TEMPLATE_REPOSITORY,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type ArtifactManifest,
  type CapabilityBundleRegistry,
  type Diagnostic,
  type PayloadEntry,
  type ReleasePayloadEntryDraftV2,
  type ReleasePayloadSet,
  type TemplateReleaseEvidence,
  type TemplateReleaseCandidateInput,
  type TemplateReleaseClosure,
  type ValidationResult,
} from "./contract.ts";
import { validateCapabilityBundleRegistryV2 } from "./capability-bundles.ts";
import {
  decodeCanonicalBase64,
  sha256Bytes,
  sha256CanonicalJson,
  sha256PayloadEntries,
} from "./digest.ts";
import { validateTemplateReleaseClosureV1 } from "./release-closure.ts";
import { validateTemplateReleaseEvidenceV1 } from "./release-evidence.ts";
import { validateReleasePayloadSetV2 } from "./validate.ts";
import { validateArtifactManifestV2 } from "./validate-manifests.ts";
import {
  Diagnostics,
  isRecord,
  SEMVER_PATTERN,
} from "./validation-helpers.ts";

const GIT_SHA1_PATTERN = /^[0-9a-f]{40}$/;

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
    diagnostics.add(row.code, `${prefix}${row.pointer}`, row.message);
  }
}

function validateCandidateInputs(
  value: Record<string, unknown>,
  diagnostics: Diagnostics,
): {
  readonly payloadResult: ValidationResult<ReleasePayloadSet>;
  readonly capabilityResult: ValidationResult<CapabilityBundleRegistry>;
  readonly artifactResult: ValidationResult<ArtifactManifest>;
  readonly evidenceResult: ValidationResult<TemplateReleaseEvidence> | null;
  readonly valid: boolean;
} {
  const semverValid = diagnostics.string(value["semver"], "/semver", {
    min: 5,
    max: 80,
    pattern: SEMVER_PATTERN,
  });
  const commitValid = diagnostics.string(value["commit"], "/commit", {
    pattern: GIT_SHA1_PATTERN,
  });
  const treeValid = diagnostics.string(value["tree"], "/tree", {
    pattern: GIT_SHA1_PATTERN,
  });
  const payloadResult = validateReleasePayloadSetV2(value["payloadSet"]);
  const capabilityResult = validateCapabilityBundleRegistryV2(
    value["capabilityRegistry"],
  );
  const artifactResult = validateArtifactManifestV2(value["artifactManifest"]);
  const evidenceResult = Object.hasOwn(value, "releaseEvidence")
    ? validateTemplateReleaseEvidenceV1(value["releaseEvidence"])
    : null;
  if (!payloadResult.ok) {
    addNested(diagnostics, "/payloadSet", payloadResult.diagnostics);
  }
  if (!capabilityResult.ok) {
    addNested(diagnostics, "/capabilityRegistry", capabilityResult.diagnostics);
  }
  if (!artifactResult.ok) {
    addNested(diagnostics, "/artifactManifest", artifactResult.diagnostics);
  }
  if (evidenceResult !== null && !evidenceResult.ok) {
    addNested(diagnostics, "/releaseEvidence", evidenceResult.diagnostics);
  }
  const valid =
    semverValid &&
    commitValid &&
    treeValid &&
    payloadResult.ok &&
    capabilityResult.ok &&
    artifactResult.ok &&
    (evidenceResult === null || evidenceResult.ok) &&
    diagnostics.rows.length === 0;
  return { payloadResult, capabilityResult, artifactResult, evidenceResult, valid };
}

interface BuildReceiptParams {
  readonly semver: string;
  readonly commit: string;
  readonly tree: string;
  readonly payloadSet: ReleasePayloadSet;
  readonly capabilityRegistry: CapabilityBundleRegistry;
  readonly artifactManifest: ArtifactManifest;
  readonly releaseEvidence?: TemplateReleaseEvidence;
}

function buildReceiptBody(
  params: BuildReceiptParams,
): Record<string, unknown> {
  const {
    semver, commit, tree, payloadSet, capabilityRegistry, artifactManifest, releaseEvidence,
  } = params;
  const tag = `v${semver}`;
  return {
    schemaId: SCHEMA_IDS.templateReleaseReceipt,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.templateReleaseReceipt,
    contractId: CONTRACT_ID,
    receiptKind: RELEASE_RECEIPT_KIND,
    publicationState: "candidate",
    releaseId: `${REPO_TEMPLATE_REPOSITORY}@${semver}`,
    receiptDigestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    producer: {
      repository: REPO_TEMPLATE_REPOSITORY,
      origin: REPO_TEMPLATE_ORIGIN,
      semver,
      tag,
      commit,
      tree,
    },
    receiptTransport: {
      kind: "annotated-git-tag-message/v1",
      tagName: tag,
      targetObjectType: "commit",
      bodyEncoding: "utf-8",
      bodyCanonicalization: "rfc8785",
    },
    payloadSet: {
      manifestPath: RELEASE_PAYLOAD_MANIFEST_PATH,
      schemaId: SCHEMA_IDS.releasePayloadSet,
      schemaVersion: CONTRACT_VERSION,
      schemaDigest: SCHEMA_DIGESTS.releasePayloadSet,
      manifestDigest: payloadSet.releaseDigest,
      payloadDigestAlgorithm: payloadSet.payloadDigestAlgorithm,
      payloadDigest: payloadSet.payloadDigest,
      entryCount: payloadSet.entryCount,
    },
    capabilityBundles: capabilityRegistry.bundles.map(
      ({ id, version, digest }) => ({ id, version, digest }),
    ),
    materializer: {
      contractId: CONTRACT_ID,
      contractVersion: CONTRACT_VERSION,
      artifactManifestPath: ARTIFACT_MANIFEST_PATH,
      artifactManifestSchemaId: SCHEMA_IDS.artifactManifest,
      artifactManifestSchemaVersion: CONTRACT_VERSION,
      artifactManifestSchemaDigest: SCHEMA_DIGESTS.artifactManifest,
      artifactManifestDigest: artifactManifest.manifestDigest,
      artifactDigest: artifactManifest.artifactDigest,
      entrypoint: artifactManifest.entrypoint,
      validatorExport: artifactManifest.validatorExport,
      runtimeCompatibility: artifactManifest.toolchain.nodeCompatibility,
      compatibleReleaseReceiptKind: artifactManifest.releaseReceiptKind,
    },
    ...(releaseEvidence === undefined ? {} : { releaseEvidence }),
    migrationRefs: [] as const,
  };
}

export function createTemplateReleaseCandidateV1(
  value: unknown,
): ValidationResult<TemplateReleaseClosure> {
  const diagnostics = new Diagnostics();
  const fields = [
    "semver", "commit", "tree", "payloadSet", "capabilityRegistry", "artifactManifest",
  ];
  if (!diagnostics.object(value, "", [...fields, "releaseEvidence"], fields)) {
    return finish(value as TemplateReleaseClosure, diagnostics);
  }
  const inputRec = value as Record<string, unknown>;
  const {
    payloadResult, capabilityResult, artifactResult, evidenceResult, valid,
  } = validateCandidateInputs(inputRec, diagnostics);

  if (!valid) {
    return finish(value as unknown as TemplateReleaseClosure, diagnostics);
  }

  const payloadSet: ReleasePayloadSet = payloadResult.value!;
  const capabilityRegistry: CapabilityBundleRegistry = capabilityResult.value!;
  const artifactManifest: ArtifactManifest = artifactResult.value!;
  const releaseEvidence: TemplateReleaseEvidence | undefined =
    evidenceResult?.ok ? evidenceResult.value : undefined;
  const receiptBody = buildReceiptBody({
    semver: inputRec["semver"] as string,
    commit: inputRec["commit"] as string,
    tree: inputRec["tree"] as string,
    payloadSet,
    capabilityRegistry,
    artifactManifest,
    releaseEvidence,
  });
  const closure: TemplateReleaseClosure = {
    receipt: {
      ...receiptBody,
      receiptDigest: sha256CanonicalJson(receiptBody),
    } as unknown as TemplateReleaseClosure["receipt"],
    payloadSet,
    capabilityRegistry,
    artifactManifest,
  };
  return validateTemplateReleaseClosureV1(closure);
}

export function isTemplateReleaseCandidateInput(
  value: unknown,
): value is TemplateReleaseCandidateInput {
  return createTemplateReleaseCandidateV1(value).ok;
}

export function createReleasePayloadSetV2(
  value: unknown,
): ValidationResult<ReleasePayloadSet> {
  if (!Array.isArray(value)) {
    const diagnostics = new Diagnostics();
    diagnostics.add("E_TYPE", "", "expected an array of release payload entry drafts");
    return finish(value as ReleasePayloadSet, diagnostics);
  }
  const rawEntries = value;
  const entries = rawEntries.map((rawEntry) => {
    if (!isRecord(rawEntry)) return rawEntry;
    let contentSha256 = "0".repeat(64);
    if (typeof rawEntry["contentBase64"] === "string") {
      try {
        contentSha256 = sha256Bytes(
          decodeCanonicalBase64(rawEntry["contentBase64"]),
        );
      } catch {
        // The canonical validator emits the stable entry-level base64 diagnostic.
      }
    }
    return { ...rawEntry, contentSha256 };
  });
  entries.sort((left, right) => {
    const leftPath = isRecord(left) && typeof left["path"] === "string"
      ? left["path"]
      : "";
    const rightPath = isRecord(right) && typeof right["path"] === "string"
      ? right["path"]
      : "";
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
  });

  let payloadDigest = "0".repeat(64);
  try {
    payloadDigest = sha256PayloadEntries(
      entries as unknown as readonly PayloadEntry[],
    );
  } catch {
    // The canonical validator reports malformed entries without throwing.
  }
  const body = {
    schemaId: SCHEMA_IDS.releasePayloadSet,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.releasePayloadSet,
    contractId: CONTRACT_ID,
    digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    payloadDigestAlgorithm: PAYLOAD_DIGEST_ALGORITHM,
    payloadDigest,
    entryCount: entries.length,
    migrationRefs: [] as const,
    entries,
  };
  let releaseDigest = "0".repeat(64);
  try {
    releaseDigest = sha256CanonicalJson(body);
  } catch {
    // The canonical validator reports unsupported JSON values.
  }
  return validateReleasePayloadSetV2({
    ...body,
    releaseDigest,
  });
}

export function isReleasePayloadEntryDraftV2(
  value: unknown,
): value is ReleasePayloadEntryDraftV2 {
  return createReleasePayloadSetV2([value]).ok;
}
