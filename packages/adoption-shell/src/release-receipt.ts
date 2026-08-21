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
  type BundleReference,
  type TemplateReleaseReceipt,
  type ValidationResult,
} from "./contract.ts";
import { sha256CanonicalJson } from "./digest.ts";
import {
  assertSortedUnique,
  BUNDLE_ID_PATTERN,
  Diagnostics,
  SEMVER_PATTERN,
} from "./validation-helpers.ts";
import { validateTemplateReleaseEvidenceV1 } from "./release-evidence.ts";

const GIT_SHA1_PATTERN = /^[0-9a-f]{40}$/;

function finish<T>(value: T, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
}

function validateBundleReferences(
  value: unknown,
  diagnostics: Diagnostics,
): readonly BundleReference[] {
  if (!diagnostics.array(value, "/capabilityBundles", 0, 256)) return [];
  const rows: BundleReference[] = [];
  for (const [index, reference] of value.entries()) {
    const pointer = `/capabilityBundles/${index}`;
    if (
      !diagnostics.object(
        reference,
        pointer,
        ["id", "version", "digest"],
        ["id", "version", "digest"],
      )
    ) {
      continue;
    }
    diagnostics.string(reference["id"], `${pointer}/id`, {
      min: 1,
      max: 80,
      pattern: BUNDLE_ID_PATTERN,
    });
    diagnostics.string(reference["version"], `${pointer}/version`, {
      min: 5,
      max: 80,
      pattern: SEMVER_PATTERN,
    });
    diagnostics.sha(reference["digest"], `${pointer}/digest`);
    rows.push(reference as unknown as BundleReference);
  }
  assertSortedUnique(
    rows.map((row) => `${row.id}\u{0}${row.version}\u{0}${row.digest}`),
    "/capabilityBundles",
    diagnostics,
  );
  return rows;
}

function validateReceiptHeader(
  value: Record<string, unknown>,
  diagnostics: Diagnostics,
): void {
  diagnostics.string(value["schemaId"], "/schemaId", {
    constant: SCHEMA_IDS.templateReleaseReceipt,
  });
  diagnostics.string(value["schemaVersion"], "/schemaVersion", {
    constant: CONTRACT_VERSION,
  });
  if (
    diagnostics.sha(value["schemaDigest"], "/schemaDigest") &&
    value["schemaDigest"] !== SCHEMA_DIGESTS.templateReleaseReceipt
  ) {
    diagnostics.add(
      "E_SCHEMA_DIGEST",
      "/schemaDigest",
      "schema digest does not match the committed contract",
    );
  }
  diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(value["receiptKind"], "/receiptKind", {
    constant: RELEASE_RECEIPT_KIND,
  });
  if (
    diagnostics.string(value["publicationState"], "/publicationState") &&
    value["publicationState"] !== "candidate" &&
    value["publicationState"] !== "published"
  ) {
    diagnostics.add(
      "E_PUBLICATION_STATE",
      "/publicationState",
      "must be candidate or published",
    );
  }
  diagnostics.string(value["receiptDigestAlgorithm"], "/receiptDigestAlgorithm", {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["receiptDigest"], "/receiptDigest");
}

function validateReceiptProducer(
  producer: unknown,
  releaseId: unknown,
  diagnostics: Diagnostics,
): { semver: string | null; producerTag: string | null } {
  let semver: string | null = null;
  let producerTag: string | null = null;
  const fields = ["repository", "origin", "semver", "tag", "commit", "tree"];
  if (diagnostics.object(producer, "/producer", fields, fields)) {
    const prodRec = producer;
    diagnostics.string(prodRec["repository"], "/producer/repository", {
      constant: REPO_TEMPLATE_REPOSITORY,
    });
    diagnostics.string(prodRec["origin"], "/producer/origin", {
      constant: REPO_TEMPLATE_ORIGIN,
    });
    if (
      diagnostics.string(prodRec["semver"], "/producer/semver", {
        min: 5,
        max: 80,
        pattern: SEMVER_PATTERN,
      })
    ) {
      semver = prodRec["semver"];
    }
    if (
      diagnostics.string(prodRec["tag"], "/producer/tag", {
        min: 6,
        max: 81,
      })
    ) {
      producerTag = prodRec["tag"];
    }
    diagnostics.string(prodRec["commit"], "/producer/commit", {
      pattern: GIT_SHA1_PATTERN,
    });
    diagnostics.string(prodRec["tree"], "/producer/tree", {
      pattern: GIT_SHA1_PATTERN,
    });
  }
  if (
    semver !== null &&
    diagnostics.string(releaseId, "/releaseId", { min: 34, max: 120 }) &&
    releaseId !== `${REPO_TEMPLATE_REPOSITORY}@${semver}`
  ) {
    diagnostics.add(
      "E_RELEASE_ID",
      "/releaseId",
      "releaseId must bind the producer repository and SemVer",
    );
  }
  if (semver !== null && producerTag !== null && producerTag !== `v${semver}`) {
    diagnostics.add(
      "E_TAG_SEMVER",
      "/producer/tag",
      "producer tag must equal v followed by producer SemVer",
    );
  }
  return { semver, producerTag };
}

function validateReceiptTransport(
  transport: unknown,
  producerTag: string | null,
  diagnostics: Diagnostics,
): void {
  let transportTag: string | null = null;
  const fields = ["kind", "tagName", "targetObjectType", "bodyEncoding", "bodyCanonicalization"];
  if (diagnostics.object(transport, "/receiptTransport", fields, fields)) {
    const trRec = transport;
    diagnostics.string(trRec["kind"], "/receiptTransport/kind", {
      constant: "annotated-git-tag-message/v1",
    });
    if (
      diagnostics.string(trRec["tagName"], "/receiptTransport/tagName", { min: 6, max: 81 })
    ) {
      transportTag = trRec["tagName"];
    }
    diagnostics.string(trRec["targetObjectType"], "/receiptTransport/targetObjectType", { constant: "commit" });
    diagnostics.string(trRec["bodyEncoding"], "/receiptTransport/bodyEncoding", { constant: "utf-8" });
    diagnostics.string(trRec["bodyCanonicalization"], "/receiptTransport/bodyCanonicalization", { constant: "rfc8785" });
  }
  if (producerTag !== null && transportTag !== null && producerTag !== transportTag) {
    diagnostics.add(
      "E_TAG_TRANSPORT",
      "/receiptTransport/tagName",
      "transport tagName must equal producer tag",
    );
  }
}

function validateReceiptPayloadSet(
  payloadSet: unknown,
  diagnostics: Diagnostics,
): void {
  const fields = [
    "manifestPath", "schemaId", "schemaVersion", "schemaDigest",
    "manifestDigest", "payloadDigestAlgorithm", "payloadDigest", "entryCount",
  ];
  if (!diagnostics.object(payloadSet, "/payloadSet", fields, fields)) return;
  const psRec = payloadSet;
  diagnostics.string(psRec["manifestPath"], "/payloadSet/manifestPath", {
    constant: RELEASE_PAYLOAD_MANIFEST_PATH,
  });
  diagnostics.string(psRec["schemaId"], "/payloadSet/schemaId", {
    constant: SCHEMA_IDS.releasePayloadSet,
  });
  diagnostics.string(psRec["schemaVersion"], "/payloadSet/schemaVersion", {
    constant: CONTRACT_VERSION,
  });
  if (
    diagnostics.sha(psRec["schemaDigest"], "/payloadSet/schemaDigest") &&
    psRec["schemaDigest"] !== SCHEMA_DIGESTS.releasePayloadSet
  ) {
    diagnostics.add(
      "E_SCHEMA_DIGEST",
      "/payloadSet/schemaDigest",
      "payload-set schema digest does not match the committed contract",
    );
  }
  diagnostics.sha(psRec["manifestDigest"], "/payloadSet/manifestDigest");
  diagnostics.string(
    psRec["payloadDigestAlgorithm"],
    "/payloadSet/payloadDigestAlgorithm",
    { constant: PAYLOAD_DIGEST_ALGORITHM },
  );
  diagnostics.sha(psRec["payloadDigest"], "/payloadSet/payloadDigest");
  if (
    !Number.isInteger(psRec["entryCount"]) ||
    Number(psRec["entryCount"]) < 1 ||
    Number(psRec["entryCount"]) > 4096
  ) {
    diagnostics.add("E_COUNT", "/payloadSet/entryCount", "must be between 1 and 4096");
  }
}

function validateReceiptMaterializer(
  materializer: unknown,
  diagnostics: Diagnostics,
): void {
  const fields = [
    "contractId", "contractVersion", "artifactManifestPath", "artifactManifestSchemaId",
    "artifactManifestSchemaVersion", "artifactManifestSchemaDigest", "artifactManifestDigest",
    "artifactDigest", "entrypoint", "validatorExport", "runtimeCompatibility",
    "compatibleReleaseReceiptKind",
  ];
  if (!diagnostics.object(materializer, "/materializer", fields, fields)) return;
  const matRec = materializer;
  diagnostics.string(matRec["contractId"], "/materializer/contractId", { constant: CONTRACT_ID });
  diagnostics.string(matRec["contractVersion"], "/materializer/contractVersion", { constant: CONTRACT_VERSION });
  diagnostics.string(matRec["artifactManifestPath"], "/materializer/artifactManifestPath", {
    constant: ARTIFACT_MANIFEST_PATH,
  });
  diagnostics.string(matRec["artifactManifestSchemaId"], "/materializer/artifactManifestSchemaId", {
    constant: SCHEMA_IDS.artifactManifest,
  });
  diagnostics.string(matRec["artifactManifestSchemaVersion"], "/materializer/artifactManifestSchemaVersion", {
    constant: CONTRACT_VERSION,
  });
  if (
    diagnostics.sha(matRec["artifactManifestSchemaDigest"], "/materializer/artifactManifestSchemaDigest") &&
    matRec["artifactManifestSchemaDigest"] !== SCHEMA_DIGESTS.artifactManifest
  ) {
    diagnostics.add(
      "E_SCHEMA_DIGEST",
      "/materializer/artifactManifestSchemaDigest",
      "artifact-manifest schema digest does not match the committed contract",
    );
  }
  diagnostics.sha(matRec["artifactManifestDigest"], "/materializer/artifactManifestDigest");
  diagnostics.sha(matRec["artifactDigest"], "/materializer/artifactDigest");
  diagnostics.string(matRec["entrypoint"], "/materializer/entrypoint", { constant: "index.js" });
  diagnostics.string(matRec["validatorExport"], "/materializer/validatorExport", {
    constant: "validateMaterializerInputV2",
  });
  diagnostics.string(matRec["runtimeCompatibility"], "/materializer/runtimeCompatibility", {
    constant: ">=24.16.0 <25",
  });
  diagnostics.string(matRec["compatibleReleaseReceiptKind"], "/materializer/compatibleReleaseReceiptKind", {
    constant: RELEASE_RECEIPT_KIND,
  });
}

function validateReceiptEvidence(evidence: unknown, diagnostics: Diagnostics): void {
  const evidenceResult = validateTemplateReleaseEvidenceV1(evidence);
  if (!evidenceResult.ok) {
    for (const row of evidenceResult.diagnostics) {
      diagnostics.add(
        row.code,
        `/releaseEvidence${row.pointer}`,
        row.message,
      );
    }
  }
}

function validateReceiptDigest(value: Record<string, unknown>, diagnostics: Diagnostics): void {
  if (typeof value["receiptDigest"] !== "string") return;
  const { receiptDigest: _receiptDigest, ...body } = value;
  try {
    if (sha256CanonicalJson(body) !== value["receiptDigest"]) {
      diagnostics.add("E_RECEIPT_DIGEST", "/receiptDigest", "receipt digest mismatch");
    }
  } catch {
    diagnostics.add(
      "E_CANONICAL_JSON",
      "/receiptDigest",
      "receipt body is not supported canonical JSON",
    );
  }
}

export function validateTemplateReleaseReceiptV1(
  value: unknown,
): ValidationResult<TemplateReleaseReceipt> {
  const diagnostics = new Diagnostics();
  const requiredFields = [
    "schemaId", "schemaVersion", "schemaDigest", "contractId", "receiptKind",
    "publicationState", "releaseId", "receiptDigestAlgorithm", "receiptDigest",
    "producer", "receiptTransport", "payloadSet", "capabilityBundles",
    "materializer", "migrationRefs",
  ];
  if (
    !diagnostics.object(
      value,
      "",
      [...requiredFields, "releaseEvidence"],
      requiredFields,
    )
  ) {
    return finish(value as TemplateReleaseReceipt, diagnostics);
  }

  const rec = value;
  validateReceiptHeader(rec, diagnostics);
  const { producerTag } = validateReceiptProducer(rec["producer"], rec["releaseId"], diagnostics);
  validateReceiptTransport(rec["receiptTransport"], producerTag, diagnostics);
  validateReceiptPayloadSet(rec["payloadSet"], diagnostics);
  validateBundleReferences(rec["capabilityBundles"], diagnostics);
  validateReceiptMaterializer(rec["materializer"], diagnostics);

  if (Object.hasOwn(rec, "releaseEvidence")) {
    validateReceiptEvidence(rec["releaseEvidence"], diagnostics);
  }

  diagnostics.array(rec["migrationRefs"], "/migrationRefs", 0, 0);
  validateReceiptDigest(rec, diagnostics);
  return finish(value as unknown as TemplateReleaseReceipt, diagnostics);
}

export function validatePublishedTemplateReleaseReceiptV1(
  value: unknown,
): ValidationResult<TemplateReleaseReceipt> {
  const result = validateTemplateReleaseReceiptV1(value);
  if (!result.ok) return result;
  if (result.value.publicationState !== "published") {
    return {
      ok: false,
      diagnostics: [
        {
          code: "E_PUBLICATION_AUTHORITY",
          pointer: "/publicationState",
          message: "only publicationState=published is authoritative",
        },
      ],
    };
  }
  return result;
}
