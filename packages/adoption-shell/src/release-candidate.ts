import {
  ARTIFACT_MANIFEST_PATH,
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  RELEASE_PAYLOAD_MANIFEST_PATH,
  RELEASE_RECEIPT_KIND,
  REPO_TEMPLATE_ORIGIN,
  REPO_TEMPLATE_REPOSITORY,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type ArtifactManifest,
  type CapabilityBundleRegistry,
  type Diagnostic,
  type ReleasePayloadSet,
  type TemplateReleaseCandidateInput,
  type TemplateReleaseClosure,
  type ValidationResult,
} from "./contract.ts";
import { validateCapabilityBundleRegistryV2 } from "./capability-bundles.ts";
import { sha256CanonicalJson } from "./digest.ts";
import { validateTemplateReleaseClosureV1 } from "./release-closure.ts";
import { validateReleasePayloadSetV2 } from "./validate.ts";
import { validateArtifactManifestV2 } from "./validate-manifests.ts";
import {
  Diagnostics,
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

export function createTemplateReleaseCandidateV1(
  value: unknown,
): ValidationResult<TemplateReleaseClosure> {
  const diagnostics = new Diagnostics();
  const fields = [
    "semver",
    "commit",
    "tree",
    "payloadSet",
    "capabilityRegistry",
    "artifactManifest",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish(value as TemplateReleaseClosure, diagnostics);
  }
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
    !semverValid ||
    !commitValid ||
    !treeValid ||
    !payloadResult.ok ||
    !capabilityResult.ok ||
    !artifactResult.ok ||
    diagnostics.rows.length > 0
  ) {
    return finish(value as unknown as TemplateReleaseClosure, diagnostics);
  }

  const semver = value["semver"] as string;
  const commit = value["commit"] as string;
  const tree = value["tree"] as string;
  const payloadSet: ReleasePayloadSet = payloadResult.value;
  const capabilityRegistry: CapabilityBundleRegistry = capabilityResult.value;
  const artifactManifest: ArtifactManifest = artifactResult.value;
  const tag = `v${semver}`;
  const receiptBody = {
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
    migrationRefs: [] as const,
  } as const;
  const closure: TemplateReleaseClosure = {
    receipt: {
      ...receiptBody,
      receiptDigest: sha256CanonicalJson(receiptBody),
    },
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
