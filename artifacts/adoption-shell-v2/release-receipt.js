import { ARTIFACT_MANIFEST_PATH, CONTRACT_ID, CONTRACT_VERSION, ENVELOPE_DIGEST_ALGORITHM, PAYLOAD_DIGEST_ALGORITHM, RELEASE_PAYLOAD_MANIFEST_PATH, RELEASE_RECEIPT_KIND, REPO_TEMPLATE_ORIGIN, REPO_TEMPLATE_REPOSITORY, SCHEMA_DIGESTS, SCHEMA_IDS, } from "./contract.js";
import { sha256CanonicalJson } from "./digest.js";
import { assertSortedUnique, BUNDLE_ID_PATTERN, Diagnostics, SEMVER_PATTERN, } from "./validation-helpers.js";
const GIT_SHA1_PATTERN = /^[0-9a-f]{40}$/;
function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
}
function validateBundleReferences(value, diagnostics) {
    if (!diagnostics.array(value, "/capabilityBundles", 0, 256))
        return [];
    const rows = [];
    value.forEach((reference, index) => {
        const pointer = `/capabilityBundles/${index}`;
        if (!diagnostics.object(reference, pointer, ["id", "version", "digest"], ["id", "version", "digest"])) {
            return;
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
        rows.push(reference);
    });
    assertSortedUnique(rows.map((row) => `${row.id}\u0000${row.version}\u0000${row.digest}`), "/capabilityBundles", diagnostics);
    return rows;
}
export function validateTemplateReleaseReceiptV1(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "contractId",
        "receiptKind",
        "publicationState",
        "releaseId",
        "receiptDigestAlgorithm",
        "receiptDigest",
        "producer",
        "receiptTransport",
        "payloadSet",
        "capabilityBundles",
        "materializer",
        "migrationRefs",
    ];
    if (!diagnostics.object(value, "", fields, fields)) {
        return finish(value, diagnostics);
    }
    diagnostics.string(value["schemaId"], "/schemaId", {
        constant: SCHEMA_IDS.templateReleaseReceipt,
    });
    diagnostics.string(value["schemaVersion"], "/schemaVersion", {
        constant: CONTRACT_VERSION,
    });
    if (diagnostics.sha(value["schemaDigest"], "/schemaDigest") &&
        value["schemaDigest"] !== SCHEMA_DIGESTS.templateReleaseReceipt) {
        diagnostics.add("E_SCHEMA_DIGEST", "/schemaDigest", "schema digest does not match the committed contract");
    }
    diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
    diagnostics.string(value["receiptKind"], "/receiptKind", {
        constant: RELEASE_RECEIPT_KIND,
    });
    if (diagnostics.string(value["publicationState"], "/publicationState") &&
        value["publicationState"] !== "candidate" &&
        value["publicationState"] !== "published") {
        diagnostics.add("E_PUBLICATION_STATE", "/publicationState", "must be candidate or published");
    }
    diagnostics.string(value["receiptDigestAlgorithm"], "/receiptDigestAlgorithm", {
        constant: ENVELOPE_DIGEST_ALGORITHM,
    });
    diagnostics.sha(value["receiptDigest"], "/receiptDigest");
    let semver = null;
    let producerTag = null;
    if (diagnostics.object(value["producer"], "/producer", ["repository", "origin", "semver", "tag", "commit", "tree"], ["repository", "origin", "semver", "tag", "commit", "tree"])) {
        diagnostics.string(value["producer"]["repository"], "/producer/repository", {
            constant: REPO_TEMPLATE_REPOSITORY,
        });
        diagnostics.string(value["producer"]["origin"], "/producer/origin", {
            constant: REPO_TEMPLATE_ORIGIN,
        });
        if (diagnostics.string(value["producer"]["semver"], "/producer/semver", {
            min: 5,
            max: 80,
            pattern: SEMVER_PATTERN,
        })) {
            semver = value["producer"]["semver"];
        }
        if (diagnostics.string(value["producer"]["tag"], "/producer/tag", {
            min: 6,
            max: 81,
        })) {
            producerTag = value["producer"]["tag"];
        }
        diagnostics.string(value["producer"]["commit"], "/producer/commit", {
            pattern: GIT_SHA1_PATTERN,
        });
        diagnostics.string(value["producer"]["tree"], "/producer/tree", {
            pattern: GIT_SHA1_PATTERN,
        });
    }
    if (semver !== null &&
        diagnostics.string(value["releaseId"], "/releaseId", { min: 34, max: 120 }) &&
        value["releaseId"] !== `${REPO_TEMPLATE_REPOSITORY}@${semver}`) {
        diagnostics.add("E_RELEASE_ID", "/releaseId", "releaseId must bind the producer repository and SemVer");
    }
    if (semver !== null && producerTag !== null && producerTag !== `v${semver}`) {
        diagnostics.add("E_TAG_SEMVER", "/producer/tag", "producer tag must equal v followed by producer SemVer");
    }
    let transportTag = null;
    if (diagnostics.object(value["receiptTransport"], "/receiptTransport", ["kind", "tagName", "targetObjectType", "bodyEncoding", "bodyCanonicalization"], ["kind", "tagName", "targetObjectType", "bodyEncoding", "bodyCanonicalization"])) {
        diagnostics.string(value["receiptTransport"]["kind"], "/receiptTransport/kind", {
            constant: "annotated-git-tag-message/v1",
        });
        if (diagnostics.string(value["receiptTransport"]["tagName"], "/receiptTransport/tagName", { min: 6, max: 81 })) {
            transportTag = value["receiptTransport"]["tagName"];
        }
        diagnostics.string(value["receiptTransport"]["targetObjectType"], "/receiptTransport/targetObjectType", { constant: "commit" });
        diagnostics.string(value["receiptTransport"]["bodyEncoding"], "/receiptTransport/bodyEncoding", { constant: "utf-8" });
        diagnostics.string(value["receiptTransport"]["bodyCanonicalization"], "/receiptTransport/bodyCanonicalization", { constant: "rfc8785" });
    }
    if (producerTag !== null && transportTag !== null && producerTag !== transportTag) {
        diagnostics.add("E_TAG_TRANSPORT", "/receiptTransport/tagName", "transport tagName must equal producer tag");
    }
    if (diagnostics.object(value["payloadSet"], "/payloadSet", [
        "manifestPath",
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "manifestDigest",
        "payloadDigestAlgorithm",
        "payloadDigest",
        "entryCount",
    ], [
        "manifestPath",
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "manifestDigest",
        "payloadDigestAlgorithm",
        "payloadDigest",
        "entryCount",
    ])) {
        diagnostics.string(value["payloadSet"]["manifestPath"], "/payloadSet/manifestPath", {
            constant: RELEASE_PAYLOAD_MANIFEST_PATH,
        });
        diagnostics.string(value["payloadSet"]["schemaId"], "/payloadSet/schemaId", {
            constant: SCHEMA_IDS.releasePayloadSet,
        });
        diagnostics.string(value["payloadSet"]["schemaVersion"], "/payloadSet/schemaVersion", {
            constant: CONTRACT_VERSION,
        });
        if (diagnostics.sha(value["payloadSet"]["schemaDigest"], "/payloadSet/schemaDigest") &&
            value["payloadSet"]["schemaDigest"] !== SCHEMA_DIGESTS.releasePayloadSet) {
            diagnostics.add("E_SCHEMA_DIGEST", "/payloadSet/schemaDigest", "payload-set schema digest does not match the committed contract");
        }
        diagnostics.sha(value["payloadSet"]["manifestDigest"], "/payloadSet/manifestDigest");
        diagnostics.string(value["payloadSet"]["payloadDigestAlgorithm"], "/payloadSet/payloadDigestAlgorithm", { constant: PAYLOAD_DIGEST_ALGORITHM });
        diagnostics.sha(value["payloadSet"]["payloadDigest"], "/payloadSet/payloadDigest");
        if (!Number.isInteger(value["payloadSet"]["entryCount"]) ||
            Number(value["payloadSet"]["entryCount"]) < 1 ||
            Number(value["payloadSet"]["entryCount"]) > 4096) {
            diagnostics.add("E_COUNT", "/payloadSet/entryCount", "must be between 1 and 4096");
        }
    }
    validateBundleReferences(value["capabilityBundles"], diagnostics);
    if (diagnostics.object(value["materializer"], "/materializer", [
        "contractId",
        "contractVersion",
        "artifactManifestPath",
        "artifactManifestSchemaId",
        "artifactManifestSchemaVersion",
        "artifactManifestSchemaDigest",
        "artifactManifestDigest",
        "artifactDigest",
        "entrypoint",
        "validatorExport",
        "runtimeCompatibility",
        "compatibleReleaseReceiptKind",
    ], [
        "contractId",
        "contractVersion",
        "artifactManifestPath",
        "artifactManifestSchemaId",
        "artifactManifestSchemaVersion",
        "artifactManifestSchemaDigest",
        "artifactManifestDigest",
        "artifactDigest",
        "entrypoint",
        "validatorExport",
        "runtimeCompatibility",
        "compatibleReleaseReceiptKind",
    ])) {
        const materializer = value["materializer"];
        diagnostics.string(materializer["contractId"], "/materializer/contractId", {
            constant: CONTRACT_ID,
        });
        diagnostics.string(materializer["contractVersion"], "/materializer/contractVersion", {
            constant: CONTRACT_VERSION,
        });
        diagnostics.string(materializer["artifactManifestPath"], "/materializer/artifactManifestPath", { constant: ARTIFACT_MANIFEST_PATH });
        diagnostics.string(materializer["artifactManifestSchemaId"], "/materializer/artifactManifestSchemaId", { constant: SCHEMA_IDS.artifactManifest });
        diagnostics.string(materializer["artifactManifestSchemaVersion"], "/materializer/artifactManifestSchemaVersion", { constant: CONTRACT_VERSION });
        if (diagnostics.sha(materializer["artifactManifestSchemaDigest"], "/materializer/artifactManifestSchemaDigest") &&
            materializer["artifactManifestSchemaDigest"] !== SCHEMA_DIGESTS.artifactManifest) {
            diagnostics.add("E_SCHEMA_DIGEST", "/materializer/artifactManifestSchemaDigest", "artifact-manifest schema digest does not match the committed contract");
        }
        diagnostics.sha(materializer["artifactManifestDigest"], "/materializer/artifactManifestDigest");
        diagnostics.sha(materializer["artifactDigest"], "/materializer/artifactDigest");
        diagnostics.string(materializer["entrypoint"], "/materializer/entrypoint", {
            constant: "index.js",
        });
        diagnostics.string(materializer["validatorExport"], "/materializer/validatorExport", {
            constant: "validateMaterializerInputV2",
        });
        diagnostics.string(materializer["runtimeCompatibility"], "/materializer/runtimeCompatibility", { constant: ">=24.16.0 <25" });
        diagnostics.string(materializer["compatibleReleaseReceiptKind"], "/materializer/compatibleReleaseReceiptKind", { constant: RELEASE_RECEIPT_KIND });
    }
    diagnostics.array(value["migrationRefs"], "/migrationRefs", 0, 0);
    if (typeof value["receiptDigest"] === "string") {
        const { receiptDigest: _receiptDigest, ...body } = value;
        try {
            if (sha256CanonicalJson(body) !== value["receiptDigest"]) {
                diagnostics.add("E_RECEIPT_DIGEST", "/receiptDigest", "receipt digest mismatch");
            }
        }
        catch {
            diagnostics.add("E_CANONICAL_JSON", "/receiptDigest", "receipt body is not supported canonical JSON");
        }
    }
    return finish(value, diagnostics);
}
export function validatePublishedTemplateReleaseReceiptV1(value) {
    const result = validateTemplateReleaseReceiptV1(value);
    if (!result.ok)
        return result;
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
