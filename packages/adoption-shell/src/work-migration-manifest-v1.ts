import { canonicalizeJson } from "./canonical-json.ts";
import { sha256Bytes } from "./digest.ts";
import { portablePathFailure } from "./path-policy.ts";
import type {
  MigrateReasonCode,
  PlanRecordStatus,
  RetireReasonCode,
} from "./plan-record-v1.ts";
import { isRecord, SHA256_PATTERN } from "./validation-helpers.ts";

export type WorkMigrationDecisionV1 =
  | Readonly<{
    path: string;
    decision: "migrate";
    targetStatus: PlanRecordStatus;
    reasonCode: MigrateReasonCode;
  }>
  | Readonly<{
    path: string;
    decision: "retire";
    reasonCode: RetireReasonCode;
  }>;

export const ARCHIVE_AGGREGATE_ALGORITHM_V1 =
  "sha256-framed-path-blob-sha256hex-v1" as const;

export interface ArchiveMemberV1 {
  readonly path: string;
  readonly blobSha256: string;
}

export interface WorkMigrationManifestV1 {
  readonly schemaVersion: "work-migration-manifest/v1";
  readonly source: Readonly<{ commit: string; tree: string }>;
  readonly schemaRelease: Readonly<{ version: string; digest: string }>;
  readonly decisions: readonly WorkMigrationDecisionV1[];
  readonly liveCounts: Readonly<{
    before: number;
    migrate: number;
    retire: number;
    after: number;
  }>;
  readonly archive: Readonly<{
    repository: string;
    count: number;
    aggregateAlgorithm: typeof ARCHIVE_AGGREGATE_ALGORITHM_V1;
    aggregateSha256: string;
    members: readonly Readonly<ArchiveMemberV1>[];
    dispositions: readonly Readonly<{
      decision: "archive-receipt-only";
      reasonCode: "ARCHIVE_SEALED";
      count: number;
      aggregateSha256: string;
    }>[];
  }>;
  readonly changedPaths: readonly string[];
  readonly verification: readonly string[];
  readonly canary: Readonly<{ repository: string; state: "pending" | "green" | "red" }>;
  readonly rollbackRef: string;
  readonly unclassifiedCount: 0;
  readonly manifestSha256: string;
}

const encoder = new TextEncoder();
const gitObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;
const migrationTargets: Readonly<Record<MigrateReasonCode, PlanRecordStatus>> = {
  LEGACY_READY: "planned",
  LEGACY_ACTIVE: "in-progress",
  LEGACY_IMPLEMENTED: "implemented",
  LEGACY_CLOSED: "closed",
  LEGACY_HELD_COMPLETE: "held-authority",
};
const migrateReasons = new Set<MigrateReasonCode>(
  Object.keys(migrationTargets) as MigrateReasonCode[],
);
const retireReasons = new Set<RetireReasonCode>([
  "INCOMPLETE_EVIDENCE",
  "AMBIGUOUS_STATUS",
  "INVALID_V1",
  "UNCLASSIFIED_INPUT",
]);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function integerAtLeastZero(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return (
    Object.keys(value).every((key) => allowedSet.has(key)) &&
    required.every((key) => Object.hasOwn(value, key))
  );
}

function livePlanPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("plans/") &&
    value.endsWith(".md") &&
    value.slice("plans/".length).indexOf("/") === -1 &&
    portablePathFailure(value) === null
  );
}

function archivePlanPath(value: unknown): value is string {
  return typeof value === "string" &&
    value.startsWith("plans/archive/") &&
    value.endsWith(".md") &&
    portablePathFailure(value) === null;
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) =>
    nonEmpty(value) && (index === 0 || String(values[index - 1]) < value));
}

function u64(value: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, BigInt(value), false);
  return new Uint8Array(buffer);
}

function frame(value: Uint8Array): readonly Uint8Array[] {
  return [u64(value.byteLength), value];
}

export function archiveAggregateSha256V1(
  members: readonly Readonly<ArchiveMemberV1>[],
): string {
  const ordered = [...members].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const chunks: Uint8Array[] = [];
  for (const member of ordered) {
    chunks.push(
      ...frame(encoder.encode(member.path)),
      ...frame(encoder.encode(member.blobSha256)),
    );
  }
  const bytes = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return sha256Bytes(bytes);
}

function validDecision(value: unknown): value is WorkMigrationDecisionV1 {
  if (!isRecord(value) || !livePlanPath(value["path"]) || !nonEmpty(value["reasonCode"])) {
    return false;
  }
  if (value["decision"] === "migrate") {
    const reason = value["reasonCode"] as MigrateReasonCode;
    return (
      exactKeys(
        value,
        ["path", "decision", "targetStatus", "reasonCode"],
        ["path", "decision", "targetStatus", "reasonCode"],
      ) &&
      migrateReasons.has(reason) &&
      value["targetStatus"] === migrationTargets[reason]
    );
  }
  return (
    value["decision"] === "retire" &&
    exactKeys(
      value,
      ["path", "decision", "reasonCode"],
      ["path", "decision", "reasonCode"],
    ) &&
    retireReasons.has(value["reasonCode"] as RetireReasonCode)
  );
}

function validCounts(
  value: unknown,
  keys: readonly string[],
): value is Record<string, number> {
  return isRecord(value) &&
    exactKeys(value, keys, keys) &&
    keys.every((key) => integerAtLeastZero(value[key]));
}

function validSource(value: unknown): boolean {
  return isRecord(value) &&
    exactKeys(value, ["commit", "tree"], ["commit", "tree"]) &&
    typeof value["commit"] === "string" &&
    gitObjectPattern.test(value["commit"]) &&
    typeof value["tree"] === "string" &&
    gitObjectPattern.test(value["tree"]);
}

function validRelease(value: unknown): boolean {
  return isRecord(value) &&
    exactKeys(value, ["version", "digest"], ["version", "digest"]) &&
    value["version"] === "3.0.0" &&
    typeof value["digest"] === "string" &&
    SHA256_PATTERN.test(value["digest"]);
}

function liveInventoryCloses(
  value: unknown,
  decisions: readonly WorkMigrationDecisionV1[],
): boolean {
  if (!validCounts(value, ["before", "migrate", "retire", "after"])) return false;
  const migrate = decisions.filter((row) => row.decision === "migrate").length;
  const retire = decisions.length - migrate;
  return (
    value["before"] === decisions.length &&
    value["migrate"] === migrate &&
    value["retire"] === retire &&
    value["after"] === migrate
  );
}

function archiveInventoryCloses(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactKeys(
      value,
      [
        "repository", "count", "aggregateAlgorithm", "aggregateSha256",
        "members", "dispositions",
      ],
      [
        "repository", "count", "aggregateAlgorithm", "aggregateSha256",
        "members", "dispositions",
      ],
    ) ||
    typeof value["repository"] !== "string" ||
    !repositoryPattern.test(value["repository"]) ||
    !integerAtLeastZero(value["count"]) ||
    value["aggregateAlgorithm"] !== ARCHIVE_AGGREGATE_ALGORITHM_V1 ||
    typeof value["aggregateSha256"] !== "string" ||
    !SHA256_PATTERN.test(value["aggregateSha256"]) ||
    !Array.isArray(value["members"]) ||
    !Array.isArray(value["dispositions"])
  ) return false;
  const members = value["members"];
  if (
    !members.every((member) =>
      isRecord(member) &&
      exactKeys(member, ["path", "blobSha256"], ["path", "blobSha256"]) &&
      archivePlanPath(member["path"]) &&
      typeof member["blobSha256"] === "string" &&
      SHA256_PATTERN.test(member["blobSha256"])) ||
    !sortedUnique(members.map((member) => String(member["path"]))) ||
    Number(value["count"]) !== members.length ||
    value["aggregateSha256"] !== archiveAggregateSha256V1(
      members as unknown as readonly ArchiveMemberV1[],
    )
  ) return false;
  let dispositionCount = 0;
  for (const row of value["dispositions"]) {
    if (
      !isRecord(row) ||
      !exactKeys(
        row,
        ["decision", "reasonCode", "count", "aggregateSha256"],
        ["decision", "reasonCode", "count", "aggregateSha256"],
      ) ||
      row["decision"] !== "archive-receipt-only" ||
      row["reasonCode"] !== "ARCHIVE_SEALED" ||
      !integerAtLeastZero(row["count"]) ||
      typeof row["aggregateSha256"] !== "string" ||
      !SHA256_PATTERN.test(row["aggregateSha256"])
    ) return false;
    dispositionCount += Number(row["count"]);
  }
  return (
    dispositionCount === Number(value["count"]) &&
    (Number(value["count"]) === 0) === (value["dispositions"].length === 0) &&
    value["dispositions"].length <= 1 &&
    (
      value["dispositions"].length === 0 ||
      value["dispositions"][0]?.["aggregateSha256"] === value["aggregateSha256"]
    )
  );
}

function validStringLists(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value["changedPaths"]) &&
    sortedUnique(value["changedPaths"] as readonly string[]) &&
    (value["changedPaths"] as readonly unknown[]).every((path) =>
      typeof path === "string" && portablePathFailure(path) === null) &&
    Array.isArray(value["verification"]) &&
    value["verification"].length > 0 &&
    sortedUnique(value["verification"] as readonly string[])
  );
}

function changedPathsClose(
  value: Record<string, unknown>,
  decisions: readonly WorkMigrationDecisionV1[],
): boolean {
  const changedPaths = value["changedPaths"] as readonly string[];
  return changedPaths.length === decisions.length &&
    changedPaths.every((path, index) => path === decisions[index]?.path);
}

function validManifestBody(
  value: unknown,
): value is Omit<WorkMigrationManifestV1, "manifestSha256"> {
  if (!isRecord(value)) return false;
  const keys = [
    "schemaVersion", "source", "schemaRelease", "decisions", "liveCounts",
    "archive", "changedPaths", "verification", "canary", "rollbackRef",
    "unclassifiedCount",
  ];
  if (!exactKeys(value, keys, keys) ||
    value["schemaVersion"] !== "work-migration-manifest/v1" ||
    !validSource(value["source"]) ||
    !validRelease(value["schemaRelease"])) return false;
  const decisions = value["decisions"];
  if (!Array.isArray(decisions) || !decisions.every(validDecision)) return false;
  if (!sortedUnique(decisions.map((row) => row.path)) ||
    !liveInventoryCloses(value["liveCounts"], decisions) ||
    !archiveInventoryCloses(value["archive"]) ||
    !validStringLists(value) ||
    !changedPathsClose(value, decisions)) return false;
  const canary = value["canary"];
  return (
    isRecord(canary) &&
    exactKeys(canary, ["repository", "state"], ["repository", "state"]) &&
    canary["repository"] === "gmail-markdown" &&
    ["pending", "green", "red"].includes(String(canary["state"])) &&
    nonEmpty(value["rollbackRef"]) &&
    value["unclassifiedCount"] === 0
  );
}

export function validateWorkMigrationManifestV1(
  value: unknown,
): value is WorkMigrationManifestV1 {
  if (!isRecord(value)) return false;
  const keys = [
    "schemaVersion", "source", "schemaRelease", "decisions", "liveCounts",
    "archive", "changedPaths", "verification", "canary", "rollbackRef",
    "unclassifiedCount", "manifestSha256",
  ];
  if (!exactKeys(value, keys, keys)) return false;
  const { manifestSha256, ...body } = value;
  return (
    typeof manifestSha256 === "string" &&
    SHA256_PATTERN.test(manifestSha256) &&
    validManifestBody(body) &&
    manifestSha256 === sha256Bytes(encoder.encode(canonicalizeJson(body)))
  );
}

export function createWorkMigrationManifestV1(
  input: Omit<WorkMigrationManifestV1, "manifestSha256">,
): WorkMigrationManifestV1 {
  if (input.unclassifiedCount !== 0) throw new TypeError("unclassifiedCount must be zero");
  const decisions = [...input.decisions].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const dispositions = [...input.archive.dispositions].sort((left, right) =>
    left.decision < right.decision ? -1 : left.decision > right.decision ? 1 : 0);
  const members = [...input.archive.members].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
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
