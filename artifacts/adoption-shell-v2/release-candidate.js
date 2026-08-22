import { ARTIFACT_MANIFEST_PATH, CONTRACT_ID, CONTRACT_VERSION, ENVELOPE_DIGEST_ALGORITHM, PAYLOAD_DIGEST_ALGORITHM, RELEASE_PAYLOAD_MANIFEST_PATH, RELEASE_RECEIPT_KIND, REPO_TEMPLATE_ORIGIN, REPO_TEMPLATE_REPOSITORY, SCHEMA_DIGESTS, SCHEMA_IDS, } from "./contract.js";
import { validateCapabilityBundleRegistryV2 } from "./capability-bundles.js";
import { decodeCanonicalBase64, sha256Bytes, sha256CanonicalJson, sha256PayloadEntries, } from "./digest.js";
import { validateTemplateReleaseClosureV1 } from "./release-closure.js";
import { validateTemplateReleaseEvidenceV1 } from "./release-evidence.js";
import { validateReleasePayloadSetV2 } from "./validate.js";
import { validateArtifactManifestV2 } from "./validate-manifests.js";
import { Diagnostics, isRecord, SEMVER_PATTERN, } from "./validation-helpers.js";
const GIT_SHA1_PATTERN = /^[0-9a-f]{40}$/;
function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 && value !== undefined
        ? { ok: true, value }
        : { ok: false, diagnostics: rows };
}
function addNested(diagnostics, prefix, rows) {
    for (const row of rows) {
        diagnostics.add(row.code, `${prefix}${row.pointer}`, row.message);
    }
}
function validateCandidateInputs(value, diagnostics) {
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
    const capabilityResult = validateCapabilityBundleRegistryV2(value["capabilityRegistry"]);
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
    const valid = semverValid &&
        commitValid &&
        treeValid &&
        payloadResult.ok &&
        capabilityResult.ok &&
        artifactResult.ok &&
        (evidenceResult === null || evidenceResult.ok) &&
        diagnostics.rows.length === 0;
    return { payloadResult, capabilityResult, artifactResult, evidenceResult, valid };
}
function buildReceiptBody(params) {
    const { semver, commit, tree, payloadSet, capabilityRegistry, artifactManifest, releaseEvidence, } = params;
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
        capabilityBundles: capabilityRegistry.bundles.map(({ id, version, digest }) => ({ id, version, digest })),
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
        migrationRefs: [],
    };
}
export function createTemplateReleaseCandidateV1(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "semver", "commit", "tree", "payloadSet", "capabilityRegistry", "artifactManifest",
    ];
    if (!diagnostics.object(value, "", [...fields, "releaseEvidence"], fields)) {
        return finish(undefined, diagnostics);
    }
    const inputRec = value;
    const { payloadResult, capabilityResult, artifactResult, evidenceResult, valid, } = validateCandidateInputs(inputRec, diagnostics);
    if (!valid ||
        !payloadResult.ok ||
        !capabilityResult.ok ||
        !artifactResult.ok ||
        (evidenceResult !== null && !evidenceResult.ok)) {
        return finish(undefined, diagnostics);
    }
    const payloadSet = payloadResult.value;
    const capabilityRegistry = capabilityResult.value;
    const artifactManifest = artifactResult.value;
    const releaseEvidence = evidenceResult?.ok ? evidenceResult.value : undefined;
    const semver = inputRec["semver"];
    const commit = inputRec["commit"];
    const tree = inputRec["tree"];
    if (typeof semver !== "string" ||
        typeof commit !== "string" ||
        typeof tree !== "string") {
        return finish(undefined, diagnostics);
    }
    const receiptParams = {
        semver,
        commit,
        tree,
        payloadSet,
        capabilityRegistry,
        artifactManifest,
        ...(releaseEvidence === undefined ? {} : { releaseEvidence }),
    };
    const receiptBody = buildReceiptBody(receiptParams);
    const closure = {
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
export function isTemplateReleaseCandidateInput(value) {
    return createTemplateReleaseCandidateV1(value).ok;
}
export function createReleasePayloadSetV2(value) {
    if (!Array.isArray(value)) {
        const diagnostics = new Diagnostics();
        diagnostics.add("E_TYPE", "", "expected an array of release payload entry drafts");
        return finish(undefined, diagnostics);
    }
    const rawEntries = value;
    const entries = rawEntries.map((rawEntry) => {
        if (!isRecord(rawEntry))
            return rawEntry;
        let contentSha256 = "0".repeat(64);
        if (typeof rawEntry["contentBase64"] === "string") {
            try {
                contentSha256 = sha256Bytes(decodeCanonicalBase64(rawEntry["contentBase64"]));
            }
            catch {
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
        payloadDigest = sha256PayloadEntries(entries);
    }
    catch {
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
        migrationRefs: [],
        entries,
    };
    let releaseDigest = "0".repeat(64);
    try {
        releaseDigest = sha256CanonicalJson(body);
    }
    catch {
        // The canonical validator reports unsupported JSON values.
    }
    return validateReleasePayloadSetV2({
        ...body,
        releaseDigest,
    });
}
export function isReleasePayloadEntryDraftV2(value) {
    return createReleasePayloadSetV2([value]).ok;
}
