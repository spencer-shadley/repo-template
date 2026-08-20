import { CONTRACT_ID, CONTRACT_VERSION, ENVELOPE_DIGEST_ALGORITHM, PAYLOAD_DIGEST_ALGORITHM, RELEASE_RECEIPT_KIND, SCHEMA_DIGESTS, SCHEMA_IDS, } from "./contract.js";
import { sha256CanonicalJson } from "./digest.js";
import { isIssueTemplateOverride, isPreCustodyWorkflow, portablePathFailure, } from "./path-policy.js";
import { assertSortedUnique, BUNDLE_ID_PATTERN, Diagnostics, SEMVER_PATTERN, } from "./validation-helpers.js";
const ENTRY_ROLES = new Set([
    "generic-base-text",
    "generic-base-binary",
    "capability-executable",
    "capability-config",
    "capability-fixture",
    "capability-golden",
]);
function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
}
function schemaIdentity(record, expectedId, expectedDigest, diagnostics) {
    diagnostics.string(record["schemaId"], "/schemaId", { constant: expectedId });
    diagnostics.string(record["schemaVersion"], "/schemaVersion", {
        constant: CONTRACT_VERSION,
    });
    if (diagnostics.sha(record["schemaDigest"], "/schemaDigest") &&
        record["schemaDigest"] !== expectedDigest) {
        diagnostics.add("E_SCHEMA_DIGEST", "/schemaDigest", "schema digest does not match the committed contract");
    }
}
function portablePath(value, pointer, diagnostics) {
    if (!diagnostics.string(value, pointer, { min: 1, max: 240 }))
        return false;
    const failure = portablePathFailure(value);
    if (failure !== null) {
        diagnostics.add("E_PATH_PORTABLE", pointer, `portable path rejected: ${failure}`);
    }
    if (isIssueTemplateOverride(value)) {
        diagnostics.add("E_PATH_ISSUE_TEMPLATE", pointer, "local .github/ISSUE_TEMPLATE overrides are forbidden");
    }
    if (isPreCustodyWorkflow(value)) {
        diagnostics.add("E_PATH_PRE_CUSTODY_WORKFLOW", pointer, "pre-custody .github/workflows entries are forbidden");
    }
    return (failure === null &&
        !isIssueTemplateOverride(value) &&
        !isPreCustodyWorkflow(value));
}
function validateFileRow(value, pointer, diagnostics) {
    const fields = ["path", "kind", "mode", "sha256", "bytes"];
    if (!diagnostics.object(value, pointer, fields, fields))
        return false;
    portablePath(value["path"], `${pointer}/path`, diagnostics);
    diagnostics.string(value["kind"], `${pointer}/kind`, { constant: "file" });
    if (diagnostics.string(value["mode"], `${pointer}/mode`) &&
        value["mode"] !== "100644" &&
        value["mode"] !== "100755") {
        diagnostics.add("E_MODE", `${pointer}/mode`, "mode must be 100644 or 100755");
    }
    diagnostics.sha(value["sha256"], `${pointer}/sha256`);
    if (!Number.isSafeInteger(value["bytes"]) ||
        Number(value["bytes"]) < 0 ||
        Number(value["bytes"]) > 33_554_432) {
        diagnostics.add("E_COUNT", `${pointer}/bytes`, "bytes must be between 0 and 33554432");
    }
    return true;
}
function validateFileRows(value, pointer, diagnostics) {
    if (!diagnostics.array(value, pointer, 0, 4096))
        return [];
    const rows = [];
    value.forEach((row, index) => {
        if (validateFileRow(row, `${pointer}/${index}`, diagnostics))
            rows.push(row);
    });
    assertSortedUnique(rows.map((row) => row.path), pointer, diagnostics);
    return rows;
}
function validateOutputEntryOwnership(role, bundleId, pointer, diagnostics) {
    const generic = role === "generic-base-text" || role === "generic-base-binary";
    if (generic) {
        if (bundleId !== null) {
            diagnostics.add("E_BUNDLE_OWNERSHIP", `${pointer}/bundleId`, "generic base entries must use null bundleId");
        }
    }
    else {
        diagnostics.string(bundleId, `${pointer}/bundleId`, {
            min: 1,
            max: 80,
            pattern: BUNDLE_ID_PATTERN,
        });
    }
}
function validateOutputEntryEncoding(role, encoding, pointer, diagnostics) {
    if (diagnostics.string(encoding, `${pointer}/encoding`) &&
        encoding !== "utf-8" &&
        encoding !== "binary") {
        diagnostics.add("E_ENCODING", `${pointer}/encoding`, "unsupported encoding");
    }
    const expectedEncoding = role === "generic-base-binary" ? "binary" : "utf-8";
    if (ENTRY_ROLES.has(String(role)) && encoding !== expectedEncoding) {
        diagnostics.add("E_ENCODING_ROLE", `${pointer}/encoding`, `${String(role)} requires ${expectedEncoding}`);
    }
}
function validateOutputEntry(value, pointer, diagnostics) {
    const fields = [
        "path",
        "kind",
        "mode",
        "contentSha256",
        "role",
        "encoding",
        "bundleId",
    ];
    if (!diagnostics.object(value, pointer, fields, fields))
        return null;
    const pathValid = portablePath(value["path"], `${pointer}/path`, diagnostics);
    diagnostics.string(value["kind"], `${pointer}/kind`, { constant: "file" });
    if (diagnostics.string(value["mode"], `${pointer}/mode`) &&
        value["mode"] !== "100644" &&
        value["mode"] !== "100755") {
        diagnostics.add("E_MODE", `${pointer}/mode`, "mode must be 100644 or 100755");
    }
    diagnostics.sha(value["contentSha256"], `${pointer}/contentSha256`);
    if (diagnostics.string(value["role"], `${pointer}/role`) &&
        !ENTRY_ROLES.has(value["role"])) {
        diagnostics.add("E_ROLE", `${pointer}/role`, "unsupported payload role");
    }
    validateOutputEntryOwnership(value["role"], value["bundleId"], pointer, diagnostics);
    validateOutputEntryEncoding(value["role"], value["encoding"], pointer, diagnostics);
    return pathValid ? value["path"] : null;
}
function validateOutputSelectedBundles(value, diagnostics) {
    if (!diagnostics.array(value, "/selectedBundles", 0, 256))
        return;
    const keys = [];
    value.forEach((reference, index) => {
        const pointer = `/selectedBundles/${index}`;
        if (diagnostics.object(reference, pointer, ["id", "version", "digest"], ["id", "version", "digest"])) {
            const refRec = reference;
            diagnostics.string(refRec["id"], `${pointer}/id`, {
                min: 1,
                max: 80,
                pattern: BUNDLE_ID_PATTERN,
            });
            diagnostics.string(refRec["version"], `${pointer}/version`, {
                min: 5,
                max: 80,
                pattern: SEMVER_PATTERN,
            });
            diagnostics.sha(refRec["digest"], `${pointer}/digest`);
            keys.push(`${String(refRec["id"])}\u0000${String(refRec["version"])}\u0000${String(refRec["digest"])}`);
        }
    });
    assertSortedUnique(keys, "/selectedBundles", diagnostics);
}
export function validateMaterializerOutputManifestV2(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "schemaId", "schemaVersion", "schemaDigest", "contractId", "digestAlgorithm",
        "manifestDigest", "releaseDigest", "releasePayloadDigest", "payloadDigestAlgorithm",
        "outputPayloadDigest", "entryCount", "selectedBundles", "migrationRefs", "entries",
    ];
    if (!diagnostics.object(value, "", fields, fields)) {
        return finish(value, diagnostics);
    }
    const rec = value;
    schemaIdentity(rec, SCHEMA_IDS.materializerOutputManifest, SCHEMA_DIGESTS.materializerOutputManifest, diagnostics);
    diagnostics.string(rec["contractId"], "/contractId", { constant: CONTRACT_ID });
    diagnostics.string(rec["digestAlgorithm"], "/digestAlgorithm", { constant: ENVELOPE_DIGEST_ALGORITHM });
    diagnostics.sha(rec["manifestDigest"], "/manifestDigest");
    diagnostics.sha(rec["releaseDigest"], "/releaseDigest");
    diagnostics.sha(rec["releasePayloadDigest"], "/releasePayloadDigest");
    diagnostics.string(rec["payloadDigestAlgorithm"], "/payloadDigestAlgorithm", {
        constant: PAYLOAD_DIGEST_ALGORITHM,
    });
    diagnostics.sha(rec["outputPayloadDigest"], "/outputPayloadDigest");
    if (!Number.isInteger(rec["entryCount"]) || Number(rec["entryCount"]) < 1) {
        diagnostics.add("E_COUNT", "/entryCount", "entryCount must be a positive integer");
    }
    validateOutputSelectedBundles(rec["selectedBundles"], diagnostics);
    diagnostics.array(rec["migrationRefs"], "/migrationRefs", 0, 0);
    const paths = [];
    if (diagnostics.array(rec["entries"], "/entries", 1, 4096)) {
        rec["entries"].forEach((entry, index) => {
            const rowPath = validateOutputEntry(entry, `/entries/${index}`, diagnostics);
            if (rowPath !== null)
                paths.push(rowPath);
        });
        assertSortedUnique(paths, "/entries", diagnostics);
    }
    if (Number.isInteger(rec["entryCount"]) && rec["entryCount"] !== paths.length) {
        diagnostics.add("E_ENTRY_COUNT", "/entryCount", "entryCount does not match entries");
    }
    if (typeof rec["manifestDigest"] === "string") {
        const { manifestDigest: _manifestDigest, ...body } = rec;
        try {
            if (sha256CanonicalJson(body) !== rec["manifestDigest"]) {
                diagnostics.add("E_MANIFEST_DIGEST", "/manifestDigest", "manifest digest mismatch");
            }
        }
        catch {
            diagnostics.add("E_CANONICAL_JSON", "/manifestDigest", "manifest body is not supported canonical JSON");
        }
    }
    return finish(value, diagnostics);
}
function validateArtifactToolchain(toolchain, diagnostics) {
    if (diagnostics.object(toolchain, "/toolchain", ["typescript", "nodeCompatibility", "packageManager"], ["typescript", "nodeCompatibility", "packageManager"])) {
        const tcRec = toolchain;
        diagnostics.string(tcRec["typescript"], "/toolchain/typescript", {
            constant: "7.0.2",
        });
        diagnostics.string(tcRec["nodeCompatibility"], "/toolchain/nodeCompatibility", { constant: ">=24.16.0 <25" });
        diagnostics.string(tcRec["packageManager"], "/toolchain/packageManager", {
            constant: "pnpm@11.17.0",
        });
    }
}
function validateArtifactSchemas(schemas, diagnostics) {
    if (!diagnostics.array(schemas, "/schemas", 9, 9))
        return;
    const rows = [];
    schemas.forEach((row, index) => {
        const pointer = `/schemas/${index}`;
        const schemaFields = ["id", "version", "path", "kind", "mode", "sha256", "bytes"];
        if (!diagnostics.object(row, pointer, schemaFields, schemaFields))
            return;
        const rowRec = row;
        diagnostics.string(rowRec["id"], `${pointer}/id`, {
            min: 1,
            max: 240,
            pattern: /^https:\/\/schemas\.repo-template\.dev\//,
        });
        diagnostics.string(rowRec["version"], `${pointer}/version`, {
            constant: CONTRACT_VERSION,
        });
        const fileRow = {
            path: rowRec["path"], kind: rowRec["kind"], mode: rowRec["mode"],
            sha256: rowRec["sha256"], bytes: rowRec["bytes"],
        };
        if (validateFileRow(fileRow, pointer, diagnostics)) {
            if (rowRec["mode"] === "100755") {
                diagnostics.add("E_MODE", `${pointer}/mode`, "schema files must use mode 100644");
            }
            const schemaBytes = Number(rowRec["bytes"]);
            if (Number.isSafeInteger(schemaBytes) && (schemaBytes < 1 || schemaBytes > 1_048_576)) {
                diagnostics.add("E_COUNT", `${pointer}/bytes`, "schema bytes must be 1-1048576");
            }
            rows.push(row);
        }
    });
    assertSortedUnique(rows.map((row) => row.path), "/schemas", diagnostics);
}
export function validateArtifactManifestV2(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "schemaId", "schemaVersion", "schemaDigest", "contractId", "contractVersion",
        "digestAlgorithm", "manifestDigest", "artifactDigestAlgorithm", "artifactDigest",
        "toolchain", "entrypoint", "validatorExport", "runtimeDependencyCount",
        "releaseReceiptKind", "sources", "schemas", "emitted", "fixtures", "goldens",
    ];
    if (!diagnostics.object(value, "", fields, fields)) {
        return finish(value, diagnostics);
    }
    const rec = value;
    schemaIdentity(rec, SCHEMA_IDS.artifactManifest, SCHEMA_DIGESTS.artifactManifest, diagnostics);
    diagnostics.string(rec["contractId"], "/contractId", { constant: CONTRACT_ID });
    diagnostics.string(rec["contractVersion"], "/contractVersion", { constant: CONTRACT_VERSION });
    diagnostics.string(rec["digestAlgorithm"], "/digestAlgorithm", { constant: ENVELOPE_DIGEST_ALGORITHM });
    diagnostics.sha(rec["manifestDigest"], "/manifestDigest");
    diagnostics.string(rec["artifactDigestAlgorithm"], "/artifactDigestAlgorithm", {
        constant: ENVELOPE_DIGEST_ALGORITHM,
    });
    diagnostics.sha(rec["artifactDigest"], "/artifactDigest");
    validateArtifactToolchain(rec["toolchain"], diagnostics);
    diagnostics.string(rec["entrypoint"], "/entrypoint", { constant: "index.js" });
    diagnostics.string(rec["validatorExport"], "/validatorExport", { constant: "validateMaterializerInputV2" });
    if (rec["runtimeDependencyCount"] !== 0) {
        diagnostics.add("E_CONST", "/runtimeDependencyCount", "must equal 0");
    }
    diagnostics.string(rec["releaseReceiptKind"], "/releaseReceiptKind", { constant: RELEASE_RECEIPT_KIND });
    validateFileRows(rec["sources"], "/sources", diagnostics);
    validateFileRows(rec["emitted"], "/emitted", diagnostics);
    validateFileRows(rec["fixtures"], "/fixtures", diagnostics);
    validateFileRows(rec["goldens"], "/goldens", diagnostics);
    validateArtifactSchemas(rec["schemas"], diagnostics);
    if (typeof rec["manifestDigest"] === "string") {
        const { manifestDigest: _manifestDigest, ...body } = rec;
        try {
            if (sha256CanonicalJson(body) !== rec["manifestDigest"]) {
                diagnostics.add("E_MANIFEST_DIGEST", "/manifestDigest", "manifest digest mismatch");
            }
        }
        catch {
            diagnostics.add("E_CANONICAL_JSON", "/manifestDigest", "manifest body is not supported canonical JSON");
        }
    }
    return finish(value, diagnostics);
}
export function validateVerificationReceiptV2(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "contractId",
        "receiptKind",
        "digestAlgorithm",
        "receiptDigest",
        "artifactDigest",
        "inputDigest",
        "outputManifestDigest",
        "outputPayloadDigest",
        "independentRunCount",
        "result",
    ];
    if (!diagnostics.object(value, "", fields, fields)) {
        return finish(value, diagnostics);
    }
    schemaIdentity(value, SCHEMA_IDS.verificationReceipt, SCHEMA_DIGESTS.verificationReceipt, diagnostics);
    diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
    diagnostics.string(value["receiptKind"], "/receiptKind", {
        constant: "repo-template/adoption-shell-verification/v2",
    });
    diagnostics.string(value["digestAlgorithm"], "/digestAlgorithm", {
        constant: ENVELOPE_DIGEST_ALGORITHM,
    });
    diagnostics.sha(value["receiptDigest"], "/receiptDigest");
    diagnostics.sha(value["artifactDigest"], "/artifactDigest");
    diagnostics.sha(value["inputDigest"], "/inputDigest");
    diagnostics.sha(value["outputManifestDigest"], "/outputManifestDigest");
    diagnostics.sha(value["outputPayloadDigest"], "/outputPayloadDigest");
    if (value["independentRunCount"] !== 2) {
        diagnostics.add("E_CONST", "/independentRunCount", "must equal 2");
    }
    diagnostics.string(value["result"], "/result", { constant: "verified" });
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
