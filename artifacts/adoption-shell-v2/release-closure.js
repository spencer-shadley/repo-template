import { CONTRACT_ID, CONTRACT_VERSION, SCHEMA_DIGESTS, SCHEMA_IDS, } from "./contract.js";
import { canonicalizeJson } from "./canonical-json.js";
import { validateCapabilityBundleRegistryV2 } from "./capability-bundles.js";
import { validateTemplateReleaseReceiptV1 } from "./release-receipt.js";
import { validateMaterializerInputV2, validateReleasePayloadSetV2 } from "./validate.js";
import { validateArtifactManifestV2 } from "./validate-manifests.js";
import { Diagnostics } from "./validation-helpers.js";
function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
}
function addNested(diagnostics, prefix, rows) {
    for (const row of rows) {
        diagnostics.add(row.code, `${prefix}${row.pointer}`, row.message);
    }
}
function bundleReferences(value) {
    return value.bundles.map(({ id, version, digest }) => ({ id, version, digest }));
}
function checkEqual(actual, expected, pointer, error, diagnostics) {
    if (actual !== expected)
        diagnostics.add(error[0], pointer, error[1]);
}
function validateReceiptBinding(receipt, payload, capabilities, artifact, diagnostics) {
    checkEqual(receipt.payloadSet.manifestDigest, payload.releaseDigest, "/receipt/payloadSet/manifestDigest", ["E_RELEASE_MANIFEST_MISMATCH", "receipt does not bind the supplied release payload-set manifest"], diagnostics);
    checkEqual(receipt.payloadSet.payloadDigest, payload.payloadDigest, "/receipt/payloadSet/payloadDigest", ["E_RELEASE_PAYLOAD_MISMATCH", "receipt does not bind the supplied release payload digest"], diagnostics);
    checkEqual(receipt.payloadSet.entryCount, payload.entryCount, "/receipt/payloadSet/entryCount", ["E_RELEASE_ENTRY_COUNT_MISMATCH", "receipt does not bind the supplied release entry count"], diagnostics);
    checkEqual(receipt.materializer.artifactManifestDigest, artifact.manifestDigest, "/receipt/materializer/artifactManifestDigest", ["E_ARTIFACT_MANIFEST_MISMATCH", "receipt does not bind the supplied artifact manifest"], diagnostics);
    checkEqual(receipt.materializer.artifactDigest, artifact.artifactDigest, "/receipt/materializer/artifactDigest", ["E_ARTIFACT_MISMATCH", "receipt does not bind the supplied compiled artifact"], diagnostics);
    checkEqual(receipt.receiptKind, artifact.releaseReceiptKind, "/receipt/receiptKind", ["E_RELEASE_KIND_MISMATCH", "artifact manifest does not declare the receipt kind"], diagnostics);
    if (canonicalizeJson(receipt.capabilityBundles) !==
        canonicalizeJson(bundleReferences(capabilities))) {
        diagnostics.add("E_CAPABILITY_BUNDLES_MISMATCH", "/receipt/capabilityBundles", "receipt must bind every supplied capability bundle exactly once");
    }
}
function validateMaterializerInputClosure(receipt, payload, capabilities, diagnostics) {
    const materializerInput = {
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
export function validateTemplateReleaseClosureV1(value) {
    const diagnostics = new Diagnostics();
    const fields = ["receipt", "payloadSet", "capabilityRegistry", "artifactManifest"];
    if (!diagnostics.object(value, "", fields, fields)) {
        return finish(value, diagnostics);
    }
    const receiptResult = validateTemplateReleaseReceiptV1(value["receipt"]);
    const payloadResult = validateReleasePayloadSetV2(value["payloadSet"]);
    const capabilityResult = validateCapabilityBundleRegistryV2(value["capabilityRegistry"]);
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
    if (!receiptResult.ok ||
        !payloadResult.ok ||
        !capabilityResult.ok ||
        !artifactResult.ok) {
        return finish(value, diagnostics);
    }
    const receipt = receiptResult.value;
    const payload = payloadResult.value;
    const capabilities = capabilityResult.value;
    const artifact = artifactResult.value;
    validateReceiptBinding(receipt, payload, capabilities, artifact, diagnostics);
    validateMaterializerInputClosure(receipt, payload, capabilities, diagnostics);
    return finish({
        receipt,
        payloadSet: payload,
        capabilityRegistry: capabilities,
        artifactManifest: artifact,
    }, diagnostics);
}
