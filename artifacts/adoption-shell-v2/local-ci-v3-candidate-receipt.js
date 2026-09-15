import { sha256CanonicalJson } from "./digest.js";
import {} from "./contract.js";
import { Diagnostics, isRecord } from "./validation-helpers.js";
const GIT_SHA1_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RECEIPT_ID_PATTERN = /^receipt-issue-340-[a-z0-9]+$/;
function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 && value !== undefined
        ? { ok: true, value }
        : { ok: false, diagnostics: rows };
}
function validateCandidateShape(value, diagnostics) {
    if (!diagnostics.object(value, "/candidate", ["repository", "origin", "semver", "tag", "commit", "tree"], ["repository", "origin", "semver", "tag", "commit", "tree"])) {
        return;
    }
    const candidate = value;
    diagnostics.string(candidate["repository"], "/candidate/repository", { min: 1 });
    diagnostics.string(candidate["origin"], "/candidate/origin", { min: 1 });
    diagnostics.string(candidate["semver"], "/candidate/semver", { min: 5, max: 80 });
    diagnostics.string(candidate["tag"], "/candidate/tag", { pattern: /^v/ });
    diagnostics.string(candidate["commit"], "/candidate/commit", { pattern: GIT_SHA1_PATTERN });
    diagnostics.string(candidate["tree"], "/candidate/tree", { pattern: GIT_SHA1_PATTERN });
}
function hasValidatedShape(value, diagnostics) {
    return diagnostics.rows.length === 0 && isRecord(value);
}
/**
 * Schema-validate and digest-recompute a LocalCiContractV3 canary candidate
 * receipt. Returns `ok: true` only if the shape is trustworthy AND the
 * declared `receiptDigest` is exactly the canonical digest of the receipt
 * body (every field except `receiptDigest` itself).
 */
export function validateLocalCiV3CandidateReceiptV1(value) {
    const diagnostics = new Diagnostics();
    if (!isRecord(value)) {
        diagnostics.add("E_TYPE", "", "expected object");
        return finish(undefined, diagnostics);
    }
    diagnostics.string(value["schemaId"], "/schemaId", {
        constant: "https://schemas.repo-template.dev/local-ci-v3/canary-candidate-receipt.schema.json",
    });
    diagnostics.string(value["schemaVersion"], "/schemaVersion", { constant: "3.0.0" });
    diagnostics.string(value["contractId"], "/contractId", {
        constant: "repo-template/local-ci-v3-canary-candidate",
    });
    diagnostics.string(value["receiptKind"], "/receiptKind", {
        constant: "repo-template/local-ci-v3-candidate-receipt/v1",
    });
    diagnostics.string(value["receiptId"], "/receiptId", { pattern: RECEIPT_ID_PATTERN });
    diagnostics.string(value["publicationState"], "/publicationState", { constant: "candidate" });
    diagnostics.string(value["digestAlgorithm"], "/digestAlgorithm", {
        constant: "sha256-rfc8785-v1",
    });
    const declaredDigest = value["receiptDigest"];
    if (!diagnostics.string(declaredDigest, "/receiptDigest") || !SHA256_PATTERN.test(declaredDigest)) {
        diagnostics.add("E_SHA256", "/receiptDigest", "must be lowercase SHA-256 hex");
    }
    validateCandidateShape(value["candidate"], diagnostics);
    if (diagnostics.rows.length > 0) {
        return finish(undefined, diagnostics);
    }
    // Digest recomputation: this is the check PR #360 never performed. Strip
    // receiptDigest and recompute the canonical digest of everything else;
    // a schema-valid but hand-tampered receipt fails here even though every
    // individual field still matches its declared shape.
    const { receiptDigest, ...body } = value;
    const recomputed = sha256CanonicalJson(body);
    if (recomputed !== receiptDigest) {
        diagnostics.add("E_DIGEST_MISMATCH", "/receiptDigest", `declared receiptDigest ${String(receiptDigest)} does not match recomputed canonical digest ${recomputed}`);
    }
    return finish(hasValidatedShape(value, diagnostics) ? value : undefined, diagnostics);
}
export function isValidLocalCiV3CandidateReceiptV1(value) {
    return validateLocalCiV3CandidateReceiptV1(value).ok;
}
