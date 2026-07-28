import { canonicalizeJson } from "./canonical-json.js";
import { portablePathFailure } from "./path-policy.js";
import { isRecord, SHA256_PATTERN } from "./validation-helpers.js";
export const PLAN_RECORD_SCHEMA_VERSION = "plan-record/v1";
export const PLAN_BODY_BASENAME_PATTERN_SOURCE = "^(?!.*\\.(?:[Ll][Oo][Gg]|[Rr][Ee][Ss][Uu][Ll][Tt]|[Cc][Rr][Ii][Tt][Ii][Cc]|[Ff][Ee][Ee][Dd][Bb][Aa][Cc][Kk]|[Dd][Ee][Aa][Dd][Ll][Ee][Tt][Tt][Ee][Rr])\\.md$)[0-9]{3,}-[A-Za-z0-9._@()+,=-]+\\.md$";
export const PLAN_RECORD_STATUSES = [
    "planned",
    "in-progress",
    "implemented",
    "closed",
    "held-authority",
];
const statuses = new Set(PLAN_RECORD_STATUSES);
const planBodyBasenamePattern = new RegExp(PLAN_BODY_BASENAME_PATTERN_SOURCE);
const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;
const gitObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const migrationTargets = {
    LEGACY_READY: "planned",
    LEGACY_ACTIVE: "in-progress",
    LEGACY_IMPLEMENTED: "implemented",
    LEGACY_CLOSED: "closed",
    LEGACY_HELD_COMPLETE: "held-authority",
};
function nonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}
export function isPlanBodyPathV1(value, location) {
    if (typeof value !== "string" || portablePathFailure(value) !== null)
        return false;
    const prefix = location === "live" ? "plans/" : "plans/archive/";
    if (!value.startsWith(prefix))
        return false;
    const basename = value.slice(prefix.length);
    return !basename.includes("/") && planBodyBasenamePattern.test(basename);
}
function integerAtLeastZero(value) {
    return Number.isSafeInteger(value) && Number(value) >= 0;
}
function exactKeys(value, allowed, required) {
    const allowedSet = new Set(allowed);
    return (Object.keys(value).every((key) => allowedSet.has(key)) &&
        required.every((key) => Object.hasOwn(value, key)));
}
function rfc3339(value) {
    if (!nonEmpty(value))
        return false;
    const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-](\d\d):(\d\d))$/.exec(value);
    if (match === null)
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
    const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const maximumDay = monthDays[month - 1] ?? 0;
    return (month >= 1 && month <= 12 &&
        day >= 1 && day <= maximumDay &&
        hour <= 23 && minute <= 59 && second <= 59 &&
        offsetHour <= 23 && offsetMinute <= 59);
}
function reference(value) {
    if (!isRecord(value) ||
        typeof value["repository"] !== "string" ||
        !repositoryPattern.test(value["repository"]))
        return false;
    if (value["kind"] === "github") {
        return exactKeys(value, ["kind", "repository", "number"], ["kind", "repository", "number"]) &&
            Number.isSafeInteger(value["number"]) && Number(value["number"]) > 0;
    }
    return value["kind"] === "plan-host" &&
        exactKeys(value, ["kind", "repository", "planNumber"], ["kind", "repository", "planNumber"]) &&
        integerAtLeastZero(value["planNumber"]);
}
function planReference(value) {
    return isRecord(value) &&
        exactKeys(value, ["repository", "planNumber"], ["repository", "planNumber"]) &&
        typeof value["repository"] === "string" &&
        repositoryPattern.test(value["repository"]) &&
        integerAtLeastZero(value["planNumber"]);
}
function snapshot(value) {
    return isRecord(value) &&
        exactKeys(value, ["algorithm", "digest"], ["algorithm", "digest"]) &&
        value["algorithm"] === "sha256" &&
        typeof value["digest"] === "string" &&
        SHA256_PATTERN.test(value["digest"]);
}
function risk(value) {
    return isRecord(value) &&
        exactKeys(value, ["tier", "rationale", "effectClasses"], ["tier", "rationale", "effectClasses"]) &&
        ["auto", "human"].includes(String(value["tier"])) &&
        nonEmpty(value["rationale"]) &&
        Array.isArray(value["effectClasses"]) &&
        value["effectClasses"].length > 0 &&
        value["effectClasses"].every(nonEmpty) &&
        new Set(value["effectClasses"]).size === value["effectClasses"].length;
}
function snapshots(value) {
    return isRecord(value) &&
        exactKeys(value, ["claim", "land"], ["claim"]) &&
        snapshot(value["claim"]) &&
        (!Object.hasOwn(value, "land") || snapshot(value["land"]));
}
function receipt(value) {
    return isRecord(value) &&
        exactKeys(value, ["kind", "commit", "deployedAt"], ["kind", "commit"]) &&
        ["landed", "deployed"].includes(String(value["kind"])) &&
        typeof value["commit"] === "string" &&
        gitObjectPattern.test(value["commit"]) &&
        (!Object.hasOwn(value, "deployedAt") || rfc3339(value["deployedAt"]));
}
export function validatePlanRecordV1(value) {
    if (!isRecord(value))
        return false;
    if (!exactKeys(value, [
        "schemaVersion", "project", "repository", "planNumber", "title", "sourcePath",
        "status", "issue", "enqueuedAt", "enqueueTimeSource", "risk", "owner", "trigger",
        "retryReason", "supersededBy", "disposition", "receipt", "contractSnapshots",
    ], [
        "schemaVersion", "project", "repository", "planNumber", "title", "sourcePath",
        "status", "issue", "enqueuedAt", "enqueueTimeSource", "risk",
    ]))
        return false;
    if (value["schemaVersion"] !== PLAN_RECORD_SCHEMA_VERSION ||
        !nonEmpty(value["project"]) ||
        typeof value["repository"] !== "string" ||
        !repositoryPattern.test(value["repository"]) ||
        !integerAtLeastZero(value["planNumber"]) ||
        !nonEmpty(value["title"]) ||
        !isPlanBodyPathV1(value["sourcePath"], "live") ||
        typeof value["status"] !== "string" ||
        !statuses.has(value["status"]) ||
        !reference(value["issue"]) ||
        !rfc3339(value["enqueuedAt"]) ||
        !["recorded", "file-add-backfill"].includes(String(value["enqueueTimeSource"])) ||
        !risk(value["risk"]))
        return false;
    for (const key of ["owner", "trigger", "retryReason"]) {
        if (Object.hasOwn(value, key) && !nonEmpty(value[key]))
            return false;
    }
    if (Object.hasOwn(value, "supersededBy") && !planReference(value["supersededBy"])) {
        return false;
    }
    if (Object.hasOwn(value, "contractSnapshots") &&
        !snapshots(value["contractSnapshots"]))
        return false;
    const status = value["status"];
    const disposition = value["disposition"];
    const snapshotValue = value["contractSnapshots"];
    const receiptValue = value["receipt"];
    const hasSnapshots = isRecord(snapshotValue);
    const hasClaim = hasSnapshots && snapshot(snapshotValue["claim"]);
    const hasLand = hasSnapshots && Object.hasOwn(snapshotValue, "land");
    const hasReceipt = Object.hasOwn(value, "receipt");
    if (Object.hasOwn(value, "supersededBy") &&
        !(status === "closed" && disposition === "duplicate"))
        return false;
    if (status === "planned") {
        if (hasSnapshots || hasReceipt || Object.hasOwn(value, "disposition"))
            return false;
    }
    else if (status === "in-progress") {
        if (!hasClaim || hasLand || hasReceipt || Object.hasOwn(value, "disposition"))
            return false;
    }
    else if (status === "implemented") {
        if (!hasClaim || !hasLand ||
            !receipt(receiptValue) ||
            receiptValue["kind"] !== "landed" ||
            Object.hasOwn(receiptValue, "deployedAt") ||
            Object.hasOwn(value, "disposition"))
            return false;
    }
    else if (status === "closed") {
        if (!["completed", "duplicate", "not-planned", "invalid"].includes(String(disposition))) {
            return false;
        }
        if (disposition === "completed") {
            if (!hasClaim || !hasLand ||
                !receipt(receiptValue) ||
                receiptValue["kind"] !== "deployed" ||
                !rfc3339(receiptValue["deployedAt"]) ||
                Object.hasOwn(value, "supersededBy"))
                return false;
        }
        else if (hasLand || hasReceipt) {
            return false;
        }
        if (Object.hasOwn(value, "supersededBy") && disposition !== "duplicate")
            return false;
    }
    else {
        if (!nonEmpty(value["trigger"]) || hasLand || hasReceipt ||
            Object.hasOwn(value, "disposition") || Object.hasOwn(value, "supersededBy"))
            return false;
    }
    return true;
}
function legacyCandidate(value, targetStatus) {
    const candidate = { ...value };
    delete candidate["Status"];
    delete candidate["status"];
    delete candidate["schemaVersion"];
    return {
        ...candidate,
        schemaVersion: PLAN_RECORD_SCHEMA_VERSION,
        status: targetStatus,
    };
}
function migrationDecision(value, normalizedStatus, targetStatus, reasonCode) {
    const candidate = legacyCandidate(value, targetStatus);
    const stalledOrParked = ["stall", "stalled", "park", "parked"].includes(normalizedStatus);
    const draft = ["draft", "draft for critic"].includes(normalizedStatus);
    if (!validatePlanRecordV1(candidate) ||
        (stalledOrParked && (!nonEmpty(value["retryReason"]) || !nonEmpty(value["trigger"]))) ||
        (draft && !nonEmpty(value["trigger"]))) {
        return { kind: "retire", reasonCode: "INCOMPLETE_EVIDENCE" };
    }
    return { kind: "migrate", targetStatus, reasonCode };
}
export function classifyPlanRecordV1(value, options = {}) {
    if (options.archive === true) {
        return { kind: "archive-receipt-only", reasonCode: "ARCHIVE_SEALED" };
    }
    if (validatePlanRecordV1(value))
        return { kind: "valid-v1", record: value };
    if (!isRecord(value))
        return { kind: "retire", reasonCode: "UNCLASSIFIED_INPUT" };
    if (value["schemaVersion"] === PLAN_RECORD_SCHEMA_VERSION) {
        return { kind: "retire", reasonCode: "INVALID_V1" };
    }
    const rawStatus = value["status"] ?? value["Status"];
    if (!nonEmpty(rawStatus))
        return { kind: "retire", reasonCode: "UNCLASSIFIED_INPUT" };
    const normalized = rawStatus.trim().toLowerCase().replaceAll("-", " ");
    if (["ready", "ready for codex", "draft", "draft for critic", "stall", "stalled", "park", "parked"].includes(normalized)) {
        return migrationDecision(value, normalized, "planned", "LEGACY_READY");
    }
    if (["active", "implementing", "in progress"].includes(normalized)) {
        return migrationDecision(value, normalized, "in-progress", "LEGACY_ACTIVE");
    }
    if (["implemented", "landed"].includes(normalized)) {
        return migrationDecision(value, normalized, "implemented", "LEGACY_IMPLEMENTED");
    }
    if (["closed", "shipped", "resolved"].includes(normalized)) {
        return migrationDecision(value, normalized, "closed", "LEGACY_CLOSED");
    }
    if (["held", "held authority"].includes(normalized)) {
        return migrationDecision(value, normalized, "held-authority", "LEGACY_HELD_COMPLETE");
    }
    return { kind: "retire", reasonCode: "AMBIGUOUS_STATUS" };
}
export function planRecordTransitionReasonV1(previous, next) {
    if (previous.enqueuedAt !== next.enqueuedAt)
        return "ENQUEUED_AT_IMMUTABLE";
    if (previous.enqueueTimeSource !== next.enqueueTimeSource) {
        return "ENQUEUE_TIME_SOURCE_IMMUTABLE";
    }
    if (previous.contractSnapshots !== undefined &&
        (next.contractSnapshots === undefined ||
            canonicalizeJson(previous.contractSnapshots.claim) !==
                canonicalizeJson(next.contractSnapshots.claim)))
        return "CLAIM_SNAPSHOT_IMMUTABLE";
    if (previous.contractSnapshots?.land !== undefined &&
        (next.contractSnapshots?.land === undefined ||
            canonicalizeJson(previous.contractSnapshots.land) !==
                canonicalizeJson(next.contractSnapshots.land)))
        return "LAND_SNAPSHOT_IMMUTABLE";
    return null;
}
