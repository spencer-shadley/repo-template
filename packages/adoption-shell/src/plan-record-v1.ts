import { canonicalizeJson } from "./canonical-json.ts";
import { sha256Bytes } from "./digest.ts";
import { portablePathFailure } from "./path-policy.ts";
import { isRecord, SHA256_PATTERN } from "./validation-helpers.ts";

export const PLAN_RECORD_SCHEMA_VERSION = "plan-record/v1" as const;
export const PLAN_RECORD_STATUSES = [
  "planned",
  "in-progress",
  "implemented",
  "closed",
  "held-authority",
] as const;

export type PlanRecordStatus = (typeof PLAN_RECORD_STATUSES)[number];
export type PlanRecordDecision =
  | Readonly<{ kind: "valid-v1"; record: PlanRecordV1 }>
  | Readonly<{ kind: "migrate"; reasonCode: LegacyReasonCode }>
  | Readonly<{ kind: "retire"; reasonCode: LegacyReasonCode }>
  | Readonly<{ kind: "archive-receipt-only"; reasonCode: "ARCHIVE_SEALED" }>;

export type LegacyReasonCode =
  | "LEGACY_READY"
  | "LEGACY_ACTIVE"
  | "LEGACY_TERMINAL"
  | "LEGACY_HELD_COMPLETE"
  | "AMBIGUOUS_STATUS"
  | "INVALID_V1"
  | "UNCLASSIFIED_INPUT";
export type PlanRecordTransitionReasonCode =
  | "ENQUEUED_AT_IMMUTABLE"
  | "CLAIM_SNAPSHOT_IMMUTABLE"
  | "LAND_SNAPSHOT_IMMUTABLE";

export interface PlanRecordV1 {
  readonly schemaVersion: "plan-record/v1";
  readonly project: string;
  readonly repository: string;
  readonly planNumber: number;
  readonly title: string;
  readonly sourcePath: string;
  readonly status: PlanRecordStatus;
  readonly issue: Readonly<
    | { kind: "github"; repository: string; number: number }
    | { kind: "plan-host"; repository: string; planNumber: number }
  >;
  readonly enqueuedAt: string;
  readonly enqueueTimeSource: "recorded" | "file-add-backfill";
  readonly risk: Readonly<{
    tier: "auto" | "human";
    rationale: string;
    effectClasses: readonly string[];
  }>;
  readonly owner?: string;
  readonly trigger?: string;
  readonly retryReason?: string;
  readonly supersededBy?: Readonly<{ repository: string; planNumber: number }>;
  readonly disposition?: "completed" | "duplicate" | "not-planned" | "invalid";
  readonly receipt?: Readonly<{
    kind: "landed" | "deployed";
    commit: string;
    deployedAt?: string;
  }>;
  readonly contractSnapshots: Readonly<{
    claim: Readonly<{ algorithm: "sha256"; digest: string }>;
    land?: Readonly<{ algorithm: "sha256"; digest: string }>;
  }>;
}

const encoder = new TextEncoder();
const statuses = new Set<string>(PLAN_RECORD_STATUSES);
const legacyReady = new Set([
  "ready", "ready for codex", "draft", "draft for critic",
  "stall", "stalled", "park", "parked",
]);
const legacyActive = new Set(["active", "implementing", "in progress"]);
const legacyTerminal = new Set([
  "done", "implemented", "landed", "closed", "shipped", "resolved",
]);
const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;
const gitObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function planPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("plans/") &&
    value.endsWith(".md") &&
    portablePathFailure(value) === null
  );
}

function rfc3339(value: unknown): value is string {
  if (!nonEmpty(value)) return false;
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-](\d\d):(\d\d))$/.exec(value);
  if (match === null) return false;
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
  return (
    month >= 1 && month <= 12 &&
    day >= 1 && day <= maximumDay &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    offsetHour <= 23 && offsetMinute <= 59
  );
}

function reference(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value["repository"] !== "string" ||
    !repositoryPattern.test(value["repository"])
  ) return false;
  if (value["kind"] === "github") {
    return Object.keys(value).length === 3 &&
      Number.isSafeInteger(value["number"]) && Number(value["number"]) > 0;
  }
  return value["kind"] === "plan-host" &&
    Object.keys(value).length === 3 &&
    Number.isSafeInteger(value["planNumber"]) && Number(value["planNumber"]) > 0;
}

function snapshot(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 2 &&
    value["algorithm"] === "sha256" &&
    typeof value["digest"] === "string" && SHA256_PATTERN.test(value["digest"]);
}

export function validatePlanRecordV1(value: unknown): value is PlanRecordV1 {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "schemaVersion", "project", "repository", "planNumber", "title", "sourcePath",
    "status", "issue", "enqueuedAt", "enqueueTimeSource", "risk", "owner", "trigger",
    "retryReason", "supersededBy", "disposition", "receipt", "contractSnapshots",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (
    value["schemaVersion"] !== PLAN_RECORD_SCHEMA_VERSION ||
    !nonEmpty(value["project"]) || typeof value["repository"] !== "string" ||
    !repositoryPattern.test(value["repository"]) ||
    !Number.isSafeInteger(value["planNumber"]) || Number(value["planNumber"]) < 0 ||
    !nonEmpty(value["title"]) || !planPath(value["sourcePath"]) ||
    typeof value["status"] !== "string" || !statuses.has(value["status"]) ||
    !reference(value["issue"]) || !rfc3339(value["enqueuedAt"]) ||
    !["recorded", "file-add-backfill"].includes(String(value["enqueueTimeSource"]))
  ) return false;

  const risk = value["risk"];
  if (!isRecord(risk) || Object.keys(risk).some((key) =>
    !["tier", "rationale", "effectClasses"].includes(key)) ||
    !["auto", "human"].includes(String(risk["tier"])) || !nonEmpty(risk["rationale"]) ||
    !Array.isArray(risk["effectClasses"]) || risk["effectClasses"].length === 0 ||
    !risk["effectClasses"].every(nonEmpty) ||
    [...risk["effectClasses"]].sort().join("\0") !== risk["effectClasses"].join("\0") ||
    new Set(risk["effectClasses"]).size !== risk["effectClasses"].length
  ) return false;

  for (const key of ["owner", "trigger", "retryReason"] as const) {
    if (key in value && !nonEmpty(value[key])) return false;
  }
  if ("supersededBy" in value && !reference({
    ...(isRecord(value["supersededBy"]) ? value["supersededBy"] : {}),
    kind: "plan-host",
  })) return false;

  const snapshots = value["contractSnapshots"];
  if (!isRecord(snapshots) || !snapshot(snapshots["claim"]) ||
    Object.keys(snapshots).some((key) => !["claim", "land"].includes(key))) return false;
  const needsLand = value["status"] === "implemented" || value["status"] === "closed";
  if (needsLand !== ("land" in snapshots) || ("land" in snapshots && !snapshot(snapshots["land"]))) {
    return false;
  }

  const receipt = value["receipt"];
  if (needsLand) {
    if (!isRecord(receipt) || !["landed", "deployed"].includes(String(receipt["kind"])) ||
      typeof receipt["commit"] !== "string" || !gitObjectPattern.test(receipt["commit"]) ||
      Object.keys(receipt).some((key) => !["kind", "commit", "deployedAt"].includes(key))) return false;
    if (
      value["status"] === "implemented" &&
      (receipt["kind"] !== "landed" || "deployedAt" in receipt)
    ) return false;
    if (value["status"] === "closed" &&
      (receipt["kind"] !== "deployed" || !rfc3339(receipt["deployedAt"]))) return false;
  } else if ("receipt" in value) return false;

  if (value["status"] === "closed") {
    if (!["completed", "duplicate", "not-planned", "invalid"].includes(String(value["disposition"]))) {
      return false;
    }
  } else if ("disposition" in value) return false;
  if (value["status"] === "held-authority" && !nonEmpty(value["trigger"])) return false;
  if ("supersededBy" in value && value["status"] !== "closed") return false;
  return true;
}

export function classifyPlanRecordV1(
  value: unknown,
  options: Readonly<{ archive?: boolean }> = {},
): PlanRecordDecision {
  if (options.archive === true) {
    return { kind: "archive-receipt-only", reasonCode: "ARCHIVE_SEALED" };
  }
  if (validatePlanRecordV1(value)) return { kind: "valid-v1", record: value };
  if (!isRecord(value)) return { kind: "retire", reasonCode: "UNCLASSIFIED_INPUT" };
  if (value["schemaVersion"] === PLAN_RECORD_SCHEMA_VERSION) {
    return { kind: "retire", reasonCode: "INVALID_V1" };
  }
  const rawStatus = value["status"] ?? value["Status"];
  if (!nonEmpty(rawStatus)) return { kind: "retire", reasonCode: "UNCLASSIFIED_INPUT" };
  const normalized = rawStatus.trim().toLowerCase().replaceAll("-", " ");
  if (legacyReady.has(normalized)) return { kind: "migrate", reasonCode: "LEGACY_READY" };
  if (legacyActive.has(normalized)) return { kind: "migrate", reasonCode: "LEGACY_ACTIVE" };
  if (legacyTerminal.has(normalized)) return { kind: "migrate", reasonCode: "LEGACY_TERMINAL" };
  if (["held", "held authority"].includes(normalized) && nonEmpty(value["trigger"])) {
    return { kind: "migrate", reasonCode: "LEGACY_HELD_COMPLETE" };
  }
  return { kind: "retire", reasonCode: "AMBIGUOUS_STATUS" };
}

export function planRecordTransitionReasonV1(
  previous: PlanRecordV1,
  next: PlanRecordV1,
): PlanRecordTransitionReasonCode | null {
  if (previous.enqueuedAt !== next.enqueuedAt) return "ENQUEUED_AT_IMMUTABLE";
  if (
    canonicalizeJson(previous.contractSnapshots.claim) !==
    canonicalizeJson(next.contractSnapshots.claim)
  ) return "CLAIM_SNAPSHOT_IMMUTABLE";
  if (
    previous.contractSnapshots.land !== undefined &&
    (
      next.contractSnapshots.land === undefined ||
      canonicalizeJson(previous.contractSnapshots.land) !==
      canonicalizeJson(next.contractSnapshots.land)
    )
  ) return "LAND_SNAPSHOT_IMMUTABLE";
  return null;
}

export interface WorkMigrationManifestV1 {
  readonly schemaVersion: "work-migration-manifest/v1";
  readonly source: Readonly<{ commit: string; tree: string }>;
  readonly schemaRelease: Readonly<{ version: string; digest: string }>;
  readonly decisions: readonly Readonly<{
    path: string;
    decision: "migrate" | "retire";
    reasonCode: LegacyReasonCode;
  }>[];
  readonly archive: Readonly<{ count: number; aggregateSha256: string }>;
  readonly changedPaths: readonly string[];
  readonly verification: readonly string[];
  readonly canary: Readonly<{ repository: string; state: "pending" | "green" | "red" }>;
  readonly rollbackRef: string;
  readonly unclassifiedCount: 0;
  readonly manifestSha256: string;
}

const migrateReasons = new Set<LegacyReasonCode>([
  "LEGACY_READY", "LEGACY_ACTIVE", "LEGACY_TERMINAL", "LEGACY_HELD_COMPLETE",
]);
const retireReasons = new Set<LegacyReasonCode>([
  "AMBIGUOUS_STATUS", "INVALID_V1", "UNCLASSIFIED_INPUT",
]);

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) =>
    nonEmpty(value) && (index === 0 || String(values[index - 1]) < value));
}

function validManifestBody(
  value: unknown,
): value is Omit<WorkMigrationManifestV1, "manifestSha256"> {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "schemaVersion", "source", "schemaRelease", "decisions", "archive",
    "changedPaths", "verification", "canary", "rollbackRef", "unclassifiedCount",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (value["schemaVersion"] !== "work-migration-manifest/v1") return false;
  const source = value["source"];
  if (
    !isRecord(source) || Object.keys(source).length !== 2 ||
    typeof source["commit"] !== "string" || !gitObjectPattern.test(source["commit"]) ||
    typeof source["tree"] !== "string" || !gitObjectPattern.test(source["tree"])
  ) return false;
  const release = value["schemaRelease"];
  if (
    !isRecord(release) || Object.keys(release).length !== 2 ||
    release["version"] !== "3.0.0" ||
    typeof release["digest"] !== "string" || !SHA256_PATTERN.test(release["digest"])
  ) return false;
  const decisions = value["decisions"];
  if (!Array.isArray(decisions)) return false;
  const decisionPaths: string[] = [];
  for (const row of decisions) {
    if (
      !isRecord(row) || Object.keys(row).length !== 3 ||
      !planPath(row["path"]) ||
      !["migrate", "retire"].includes(String(row["decision"])) ||
      !nonEmpty(row["reasonCode"])
    ) return false;
    const decision = row["decision"];
    const reason = row["reasonCode"] as LegacyReasonCode;
    if (
      (decision === "migrate" && !migrateReasons.has(reason)) ||
      (decision === "retire" && !retireReasons.has(reason))
    ) return false;
    decisionPaths.push(row["path"]);
  }
  if (!sortedUnique(decisionPaths)) return false;
  const archive = value["archive"];
  if (
    !isRecord(archive) || Object.keys(archive).length !== 2 ||
    !Number.isSafeInteger(archive["count"]) || Number(archive["count"]) < 0 ||
    typeof archive["aggregateSha256"] !== "string" ||
    !SHA256_PATTERN.test(archive["aggregateSha256"])
  ) return false;
  if (
    !Array.isArray(value["changedPaths"]) ||
    !sortedUnique(value["changedPaths"] as readonly string[]) ||
    !(value["changedPaths"] as readonly unknown[]).every((path) =>
      typeof path === "string" && portablePathFailure(path) === null) ||
    !Array.isArray(value["verification"]) ||
    value["verification"].length === 0 ||
    !sortedUnique(value["verification"] as readonly string[])
  ) return false;
  const canary = value["canary"];
  if (
    !isRecord(canary) || Object.keys(canary).length !== 2 ||
    canary["repository"] !== "gmail-markdown" ||
    !["pending", "green", "red"].includes(String(canary["state"]))
  ) return false;
  return nonEmpty(value["rollbackRef"]) && value["unclassifiedCount"] === 0;
}

export function validateWorkMigrationManifestV1(
  value: unknown,
): value is WorkMigrationManifestV1 {
  if (!isRecord(value) || Object.keys(value).length !== 11) return false;
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
  const decisions = [...input.decisions].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const changedPaths = [...input.changedPaths].sort();
  const verification = [...input.verification].sort();
  const body = { ...input, decisions, changedPaths, verification };
  if (!validManifestBody(body)) {
    throw new TypeError("work migration manifest input is invalid");
  }
  return {
    ...body,
    manifestSha256: sha256Bytes(encoder.encode(canonicalizeJson(body))),
  };
}
