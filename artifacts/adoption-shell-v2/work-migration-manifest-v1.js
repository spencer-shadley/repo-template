import { canonicalizeJson } from "./canonical-json.js";
import { sha256Bytes } from "./digest.js";
import { portablePathFailure } from "./path-policy.js";
import { isRecord, SHA256_PATTERN } from "./validation-helpers.js";
const encoder = new TextEncoder();
const gitObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const migrationTargets = {
    LEGACY_READY: "planned",
    LEGACY_ACTIVE: "in-progress",
    LEGACY_IMPLEMENTED: "implemented",
    LEGACY_CLOSED: "closed",
    LEGACY_HELD_COMPLETE: "held-authority",
};
const migrateReasons = new Set(Object.keys(migrationTargets));
const retireReasons = new Set([
    "INCOMPLETE_EVIDENCE",
    "AMBIGUOUS_STATUS",
    "INVALID_V1",
    "UNCLASSIFIED_INPUT",
]);
function nonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function integerAtLeastZero(value) {
    return Number.isSafeInteger(value) && Number(value) >= 0;
}
function exactKeys(value, allowed, required) {
    const allowedSet = new Set(allowed);
    return (Object.keys(value).every((key) => allowedSet.has(key)) &&
        required.every((key) => Object.hasOwn(value, key)));
}
function planPath(value) {
    return (typeof value === "string" &&
        value.startsWith("plans/") &&
        value.endsWith(".md") &&
        portablePathFailure(value) === null);
}
function sortedUnique(values) {
    return values.every((value, index) => nonEmpty(value) && (index === 0 || String(values[index - 1]) < value));
}
function validDecision(value) {
    if (!isRecord(value) || !planPath(value["path"]) || !nonEmpty(value["reasonCode"])) {
        return false;
    }
    if (value["decision"] === "migrate") {
        const reason = value["reasonCode"];
        return (exactKeys(value, ["path", "decision", "targetStatus", "reasonCode"], ["path", "decision", "targetStatus", "reasonCode"]) &&
            migrateReasons.has(reason) &&
            value["targetStatus"] === migrationTargets[reason]);
    }
    return (value["decision"] === "retire" &&
        exactKeys(value, ["path", "decision", "reasonCode"], ["path", "decision", "reasonCode"]) &&
        retireReasons.has(value["reasonCode"]));
}
function validCounts(value, keys) {
    return isRecord(value) &&
        exactKeys(value, keys, keys) &&
        keys.every((key) => integerAtLeastZero(value[key]));
}
function validSource(value) {
    return isRecord(value) &&
        exactKeys(value, ["commit", "tree"], ["commit", "tree"]) &&
        typeof value["commit"] === "string" &&
        gitObjectPattern.test(value["commit"]) &&
        typeof value["tree"] === "string" &&
        gitObjectPattern.test(value["tree"]);
}
function validRelease(value) {
    return isRecord(value) &&
        exactKeys(value, ["version", "digest"], ["version", "digest"]) &&
        value["version"] === "3.0.0" &&
        typeof value["digest"] === "string" &&
        SHA256_PATTERN.test(value["digest"]);
}
function liveInventoryCloses(value, decisions) {
    if (!validCounts(value, ["before", "migrate", "retire", "after"]))
        return false;
    const migrate = decisions.filter((row) => row.decision === "migrate").length;
    const retire = decisions.length - migrate;
    return (value["before"] === decisions.length &&
        value["migrate"] === migrate &&
        value["retire"] === retire &&
        value["after"] === migrate);
}
function archiveInventoryCloses(value) {
    if (!isRecord(value) ||
        !exactKeys(value, ["count", "aggregateSha256", "dispositions"], ["count", "aggregateSha256", "dispositions"]) ||
        !integerAtLeastZero(value["count"]) ||
        typeof value["aggregateSha256"] !== "string" ||
        !SHA256_PATTERN.test(value["aggregateSha256"]) ||
        !Array.isArray(value["dispositions"]))
        return false;
    let dispositionCount = 0;
    for (const row of value["dispositions"]) {
        if (!isRecord(row) ||
            !exactKeys(row, ["decision", "reasonCode", "count", "aggregateSha256"], ["decision", "reasonCode", "count", "aggregateSha256"]) ||
            row["decision"] !== "archive-receipt-only" ||
            row["reasonCode"] !== "ARCHIVE_SEALED" ||
            !integerAtLeastZero(row["count"]) ||
            typeof row["aggregateSha256"] !== "string" ||
            !SHA256_PATTERN.test(row["aggregateSha256"]))
            return false;
        dispositionCount += Number(row["count"]);
    }
    return (dispositionCount === Number(value["count"]) &&
        (Number(value["count"]) === 0) === (value["dispositions"].length === 0) &&
        value["dispositions"].length <= 1 &&
        (value["dispositions"].length === 0 ||
            value["dispositions"][0]?.["aggregateSha256"] === value["aggregateSha256"]));
}
function validStringLists(value) {
    return (Array.isArray(value["changedPaths"]) &&
        sortedUnique(value["changedPaths"]) &&
        value["changedPaths"].every((path) => typeof path === "string" && portablePathFailure(path) === null) &&
        Array.isArray(value["verification"]) &&
        value["verification"].length > 0 &&
        sortedUnique(value["verification"]));
}
function validManifestBody(value) {
    if (!isRecord(value))
        return false;
    const keys = [
        "schemaVersion", "source", "schemaRelease", "decisions", "liveCounts",
        "archive", "changedPaths", "verification", "canary", "rollbackRef",
        "unclassifiedCount",
    ];
    if (!exactKeys(value, keys, keys) ||
        value["schemaVersion"] !== "work-migration-manifest/v1" ||
        !validSource(value["source"]) ||
        !validRelease(value["schemaRelease"]))
        return false;
    const decisions = value["decisions"];
    if (!Array.isArray(decisions) || !decisions.every(validDecision))
        return false;
    if (!sortedUnique(decisions.map((row) => row.path)) ||
        !liveInventoryCloses(value["liveCounts"], decisions) ||
        !archiveInventoryCloses(value["archive"]) ||
        !validStringLists(value))
        return false;
    const canary = value["canary"];
    return (isRecord(canary) &&
        exactKeys(canary, ["repository", "state"], ["repository", "state"]) &&
        canary["repository"] === "gmail-markdown" &&
        ["pending", "green", "red"].includes(String(canary["state"])) &&
        nonEmpty(value["rollbackRef"]) &&
        value["unclassifiedCount"] === 0);
}
export function validateWorkMigrationManifestV1(value) {
    if (!isRecord(value))
        return false;
    const keys = [
        "schemaVersion", "source", "schemaRelease", "decisions", "liveCounts",
        "archive", "changedPaths", "verification", "canary", "rollbackRef",
        "unclassifiedCount", "manifestSha256",
    ];
    if (!exactKeys(value, keys, keys))
        return false;
    const { manifestSha256, ...body } = value;
    return (typeof manifestSha256 === "string" &&
        SHA256_PATTERN.test(manifestSha256) &&
        validManifestBody(body) &&
        manifestSha256 === sha256Bytes(encoder.encode(canonicalizeJson(body))));
}
export function createWorkMigrationManifestV1(input) {
    if (input.unclassifiedCount !== 0)
        throw new TypeError("unclassifiedCount must be zero");
    const decisions = [...input.decisions].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const dispositions = [...input.archive.dispositions].sort((left, right) => left.decision < right.decision ? -1 : left.decision > right.decision ? 1 : 0);
    const body = {
        ...input,
        decisions,
        archive: { ...input.archive, dispositions },
        changedPaths: [...input.changedPaths].sort(),
        verification: [...input.verification].sort(),
    };
    if (!validManifestBody(body)) {
        throw new TypeError("work migration manifest input is invalid");
    }
    return {
        ...body,
        manifestSha256: sha256Bytes(encoder.encode(canonicalizeJson(body))),
    };
}
