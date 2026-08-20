import { canonicalizeJson } from "./canonical-json.js";
import { sha256Bytes } from "./digest.js";
import { isPlanBodyPathV1, } from "./plan-record-v1.js";
import { isRecord, SHA256_PATTERN } from "./validation-helpers.js";
export const ARCHIVE_AGGREGATE_ALGORITHM_V1 = "sha256-framed-path-blob-sha256hex-v1";
const encoder = new TextEncoder();
const gitObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;
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
    "UNKNOWN_SCHEMA_VERSION",
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
function livePlanPath(value) {
    return isPlanBodyPathV1(value, "live");
}
function archivePlanPath(value) {
    return isPlanBodyPathV1(value, "archive");
}
function sortedUnique(values) {
    return values.every((value, index) => nonEmpty(value) && (index === 0 || String(values[index - 1]) < value));
}
function u64(value) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigUint64(0, BigInt(value), false);
    return new Uint8Array(buffer);
}
function frame(value) {
    return [u64(value.byteLength), value];
}
export function archiveAggregateSha256V1(members) {
    const ordered = [...members].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const chunks = [];
    for (const member of ordered) {
        chunks.push(...frame(encoder.encode(member.path)), ...frame(encoder.encode(member.blobSha256)));
    }
    const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return sha256Bytes(bytes);
}
function validDecision(value) {
    if (!isRecord(value) || !livePlanPath(value["path"]) || !nonEmpty(value["reasonCode"])) {
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
function validArchiveHeader(value) {
    const keys = [
        "repository", "count", "aggregateAlgorithm", "aggregateSha256",
        "members", "dispositions",
    ];
    return (isRecord(value) &&
        exactKeys(value, keys, keys) &&
        typeof value["repository"] === "string" &&
        repositoryPattern.test(value["repository"]) &&
        integerAtLeastZero(value["count"]) &&
        value["aggregateAlgorithm"] === ARCHIVE_AGGREGATE_ALGORITHM_V1 &&
        typeof value["aggregateSha256"] === "string" &&
        SHA256_PATTERN.test(value["aggregateSha256"]) &&
        Array.isArray(value["members"]) &&
        Array.isArray(value["dispositions"]));
}
function validArchiveMember(member) {
    return (isRecord(member) &&
        exactKeys(member, ["path", "blobSha256"], ["path", "blobSha256"]) &&
        archivePlanPath(member["path"]) &&
        typeof member["blobSha256"] === "string" &&
        SHA256_PATTERN.test(member["blobSha256"]));
}
function validArchiveMembers(members, count, aggregateSha256) {
    return (members.every(validArchiveMember) &&
        sortedUnique(members.map((m) => String(m["path"]))) &&
        count === members.length &&
        aggregateSha256 === archiveAggregateSha256V1(members));
}
function validArchiveDispositionRow(row) {
    return (isRecord(row) &&
        exactKeys(row, ["decision", "reasonCode", "count", "aggregateSha256"], ["decision", "reasonCode", "count", "aggregateSha256"]) &&
        row["decision"] === "archive-receipt-only" &&
        row["reasonCode"] === "ARCHIVE_SEALED" &&
        integerAtLeastZero(row["count"]) &&
        typeof row["aggregateSha256"] === "string" &&
        SHA256_PATTERN.test(row["aggregateSha256"]));
}
function validArchiveDispositions(dispositions, count, aggregateSha256) {
    if (!dispositions.every(validArchiveDispositionRow))
        return false;
    const dispositionCount = dispositions.reduce((sum, row) => sum + Number(row["count"]), 0);
    return (dispositionCount === count &&
        (count === 0) === (dispositions.length === 0) &&
        dispositions.length <= 1 &&
        (dispositions.length === 0 ||
            dispositions[0]["aggregateSha256"] === aggregateSha256));
}
function archiveInventoryCloses(value) {
    if (!validArchiveHeader(value))
        return false;
    const count = Number(value["count"]);
    const aggregateSha256 = String(value["aggregateSha256"]);
    return (validArchiveMembers(value["members"], count, aggregateSha256) &&
        validArchiveDispositions(value["dispositions"], count, aggregateSha256));
}
function validStringLists(value) {
    return (Array.isArray(value["changedPaths"]) &&
        sortedUnique(value["changedPaths"]) &&
        value["changedPaths"].every((path) => livePlanPath(path)) &&
        Array.isArray(value["verification"]) &&
        value["verification"].length > 0 &&
        sortedUnique(value["verification"]));
}
function changedPathsClose(value, decisions) {
    const changedPaths = value["changedPaths"];
    return changedPaths.length === decisions.length &&
        changedPaths.every((path, index) => path === decisions[index]?.path);
}
function validCanary(value) {
    return (isRecord(value) &&
        exactKeys(value, ["repository", "state"], ["repository", "state"]) &&
        value["repository"] === "gmail-markdown" &&
        ["pending", "green", "red"].includes(String(value["state"])));
}
function validManifestHeader(value) {
    if (!isRecord(value))
        return false;
    const keys = [
        "schemaVersion", "source", "schemaRelease", "decisions", "liveCounts",
        "archive", "changedPaths", "verification", "canary", "rollbackRef",
        "unclassifiedCount",
    ];
    return (exactKeys(value, keys, keys) &&
        value["schemaVersion"] === "work-migration-manifest/v1" &&
        validSource(value["source"]) &&
        validRelease(value["schemaRelease"]));
}
function validManifestBody(value) {
    if (!validManifestHeader(value))
        return false;
    const decisions = value["decisions"];
    if (!Array.isArray(decisions) || !decisions.every(validDecision))
        return false;
    return (sortedUnique(decisions.map((row) => row.path)) &&
        liveInventoryCloses(value["liveCounts"], decisions) &&
        archiveInventoryCloses(value["archive"]) &&
        validStringLists(value) &&
        changedPathsClose(value, decisions) &&
        validCanary(value["canary"]) &&
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
    const members = [...input.archive.members].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const body = {
        ...input,
        decisions,
        archive: { ...input.archive, members, dispositions },
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
