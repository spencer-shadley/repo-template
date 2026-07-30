import {} from "./contract.js";
import { Diagnostics, escapePointer, isRecord, } from "./validation-helpers.js";
const EVIDENCE_NAME_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const REVIEW_URL_PATTERN = /^https:\/\/github\.com\/spencer-shadley\/repo-template\/pull\/[1-9][0-9]*#pullrequestreview-[1-9][0-9]*$/;
const RECEIPT_URL_PATTERN = /^https:\/\/github\.com\/spencer-shadley\/[A-Za-z0-9_.-]+\/(?:issues|pull)\/[1-9][0-9]*#(?:issuecomment|pullrequestreview)-[1-9][0-9]*$/;
function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
}
function validateNamedRecord(value, pointer, diagnostics, visit) {
    if (!isRecord(value)) {
        diagnostics.add("E_TYPE", pointer, "expected object");
        return;
    }
    const names = Object.keys(value);
    if (names.length < 1 || names.length > 32) {
        diagnostics.add("E_COUNT", pointer, "object must contain between 1 and 32 entries");
    }
    for (const name of names) {
        const entryPointer = `${pointer}/${escapePointer(name)}`;
        if (!EVIDENCE_NAME_PATTERN.test(name)) {
            diagnostics.add("E_FORMAT", entryPointer, "invalid evidence identity");
        }
        visit(name, value[name], entryPointer);
    }
}
export function validateTemplateReleaseEvidenceV1(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "review",
        "canaryReceipts",
        "checks",
        "publicationReadback",
        "rollback",
    ];
    if (!diagnostics.object(value, "", fields, fields)) {
        return finish(value, diagnostics);
    }
    const review = value["review"];
    if (diagnostics.object(review, "/review", ["subject", "url", "result"], ["subject", "url", "result"])) {
        diagnostics.string(review["subject"], "/review/subject", {
            constant: "producer-commit",
        });
        diagnostics.string(review["url"], "/review/url", {
            min: 1,
            max: 512,
            pattern: REVIEW_URL_PATTERN,
        });
        diagnostics.string(review["result"], "/review/result", { constant: "approved" });
    }
    validateNamedRecord(value["canaryReceipts"], "/canaryReceipts", diagnostics, (_name, entry, pointer) => {
        if (!diagnostics.object(entry, pointer, ["url", "receiptSha256"], ["url", "receiptSha256"]))
            return;
        diagnostics.string(entry["url"], `${pointer}/url`, {
            min: 1,
            max: 512,
            pattern: RECEIPT_URL_PATTERN,
        });
        diagnostics.sha(entry["receiptSha256"], `${pointer}/receiptSha256`);
    });
    validateNamedRecord(value["checks"], "/checks", diagnostics, (_name, entry, pointer) => {
        if (!diagnostics.object(entry, pointer, ["command", "result"], ["command", "result"])) {
            return;
        }
        diagnostics.string(entry["command"], `${pointer}/command`, { min: 1, max: 2048 });
        diagnostics.string(entry["result"], `${pointer}/result`, { constant: "passed" });
    });
    const readback = value["publicationReadback"];
    if (diagnostics.object(readback, "/publicationReadback", ["kind"], ["kind"])) {
        diagnostics.string(readback["kind"], "/publicationReadback/kind", {
            constant: "producer-tag-ref/v1",
        });
    }
    const rollback = value["rollback"];
    if (diagnostics.object(rollback, "/rollback", ["disposition", "supersession"], ["disposition", "supersession"])) {
        diagnostics.string(rollback["disposition"], "/rollback/disposition", {
            constant: "immutable-correct-forward",
        });
        diagnostics.string(rollback["supersession"], "/rollback/supersession", {
            constant: "new-semver-only",
        });
    }
    return finish(value, diagnostics);
}
