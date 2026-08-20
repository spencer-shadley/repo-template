import { canonicalizeJson } from "./canonical-json.ts";
import { portablePathFailure } from "./path-policy.ts";
import { isRecord, SHA256_PATTERN } from "./validation-helpers.ts";

export const PLAN_RECORD_SCHEMA_VERSION = "plan-record/v1" as const;
export const PLAN_BODY_BASENAME_PATTERN_SOURCE =
  "^(?!.*\\.(?:[Ll][Oo][Gg]|[Rr][Ee][Ss][Uu][Ll][Tt]|[Cc][Rr][Ii][Tt][Ii][Cc]|[Ff][Ee][Ee][Dd][Bb][Aa][Cc][Kk]|[Dd][Ee][Aa][Dd][Ll][Ee][Tt][Tt][Ee][Rr])\\.md$)[0-9]{3,}-[A-Za-z0-9._@()+,=-]+\\.md$" as const;
export const PLAN_RECORD_STATUSES = [
  "planned",
  "in-progress",
  "implemented",
  "closed",
  "held-authority",
] as const;

export type PlanRecordStatus = (typeof PLAN_RECORD_STATUSES)[number];
export type MigrateReasonCode =
  | "LEGACY_READY"
  | "LEGACY_ACTIVE"
  | "LEGACY_IMPLEMENTED"
  | "LEGACY_CLOSED"
  | "LEGACY_HELD_COMPLETE";
export type RetireReasonCode =
  | "INCOMPLETE_EVIDENCE"
  | "AMBIGUOUS_STATUS"
  | "INVALID_V1"
  | "UNKNOWN_SCHEMA_VERSION"
  | "UNCLASSIFIED_INPUT";
export type LegacyReasonCode = MigrateReasonCode | RetireReasonCode;
export type PlanRecordDecision =
  | Readonly<{ kind: "valid-v1"; record: PlanRecordV1 }>
  | Readonly<{
    kind: "migrate";
    targetStatus: PlanRecordStatus;
    reasonCode: MigrateReasonCode;
  }>
  | Readonly<{ kind: "retire"; reasonCode: RetireReasonCode }>
  | Readonly<{ kind: "archive-receipt-only"; reasonCode: "ARCHIVE_SEALED" }>;
export type PlanRecordTransitionReasonCode =
  | "ENQUEUED_AT_IMMUTABLE"
  | "ENQUEUE_TIME_SOURCE_IMMUTABLE"
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
  readonly contractSnapshots?: Readonly<{
    claim: Readonly<{ algorithm: "sha256"; digest: string }>;
    land?: Readonly<{ algorithm: "sha256"; digest: string }>;
  }>;
}

const statuses = new Set<string>(PLAN_RECORD_STATUSES);
const planBodyBasenamePattern = new RegExp(PLAN_BODY_BASENAME_PATTERN_SOURCE);
const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;
const gitObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const migrationTargets: Readonly<Record<MigrateReasonCode, PlanRecordStatus>> = {
  LEGACY_READY: "planned",
  LEGACY_ACTIVE: "in-progress",
  LEGACY_IMPLEMENTED: "implemented",
  LEGACY_CLOSED: "closed",
  LEGACY_HELD_COMPLETE: "held-authority",
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPlanBodyPathV1(
  value: unknown,
  location: "live" | "archive",
): value is string {
  if (typeof value !== "string" || portablePathFailure(value) !== null) return false;
  const prefix = location === "live" ? "plans/" : "plans/archive/";
  if (!value.startsWith(prefix)) return false;
  const basename = value.slice(prefix.length);
  return !basename.includes("/") && planBodyBasenamePattern.test(basename);
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

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidDay(year: number, month: number, day: number): boolean {
  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximumDay = monthDays[month - 1] ?? 0;
  return day >= 1 && day <= maximumDay;
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
  return (
    month >= 1 && month <= 12 &&
    isValidDay(year, month, day) &&
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
    return exactKeys(value, ["kind", "repository", "number"], ["kind", "repository", "number"]) &&
      Number.isSafeInteger(value["number"]) && Number(value["number"]) > 0;
  }
  return value["kind"] === "plan-host" &&
    exactKeys(
      value,
      ["kind", "repository", "planNumber"],
      ["kind", "repository", "planNumber"],
    ) &&
    integerAtLeastZero(value["planNumber"]);
}

function planReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactKeys(
      value,
      ["kind", "repository", "planNumber"],
      ["kind", "repository", "planNumber"],
    ) &&
    value["kind"] === "plan-host" &&
    typeof value["repository"] === "string" &&
    repositoryPattern.test(value["repository"]) &&
    integerAtLeastZero(value["planNumber"])
  );
}

function snapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactKeys(
      value,
      ["algorithm", "digest"],
      ["algorithm", "digest"],
    ) &&
    value["algorithm"] === "sha256" &&
    typeof value["digest"] === "string" &&
    SHA256_PATTERN.test(value["digest"])
  );
}

function risk(value: unknown): boolean {
  return isRecord(value) &&
    exactKeys(
      value,
      ["tier", "rationale", "effectClasses"],
      ["tier", "rationale", "effectClasses"],
    ) &&
    ["auto", "human"].includes(String(value["tier"])) &&
    nonEmpty(value["rationale"]) &&
    Array.isArray(value["effectClasses"]) &&
    value["effectClasses"].length > 0 &&
    value["effectClasses"].every(nonEmpty) &&
    new Set(value["effectClasses"]).size === value["effectClasses"].length;
}

function snapshots(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ["claim", "land"], ["claim"]) &&
    snapshot(value["claim"]) &&
    (!Object.hasOwn(value, "land") || snapshot(value["land"]))
  );
}

function receipt(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    exactKeys(value, ["kind", "commit", "deployedAt"], ["kind", "commit"]) &&
    ["landed", "deployed"].includes(String(value["kind"])) &&
    typeof value["commit"] === "string" &&
    gitObjectPattern.test(value["commit"]) &&
    (!Object.hasOwn(value, "deployedAt") || rfc3339(value["deployedAt"]));
}

function validatePlanRecordHeader(value: Record<string, unknown>): boolean {
  const statusStr = typeof value["status"] === "string" ? value["status"] : "";
  return (
    value["schemaVersion"] === PLAN_RECORD_SCHEMA_VERSION &&
    nonEmpty(value["project"]) &&
    typeof value["repository"] === "string" &&
    repositoryPattern.test(value["repository"]) &&
    integerAtLeastZero(value["planNumber"]) &&
    nonEmpty(value["title"]) &&
    isPlanBodyPathV1(value["sourcePath"], "live") &&
    statuses.has(statusStr) &&
    reference(value["issue"]) &&
    rfc3339(value["enqueuedAt"]) &&
    ["recorded", "file-add-backfill"].includes(String(value["enqueueTimeSource"])) &&
    risk(value["risk"])
  );
}

function validatePlanRecordOptionalFields(value: Record<string, unknown>): boolean {
  for (const key of ["owner", "trigger", "retryReason"] as const) {
    if (Object.hasOwn(value, key) && !nonEmpty(value[key])) return false;
  }
  if (Object.hasOwn(value, "supersededBy") && !planReference(value["supersededBy"])) {
    return false;
  }
  if (Object.hasOwn(value, "contractSnapshots") && !snapshots(value["contractSnapshots"])) {
    return false;
  }
  return true;
}

interface PlanStateContext {
  readonly hasSnapshots: boolean;
  readonly hasClaim: boolean;
  readonly hasLand: boolean;
  readonly hasReceipt: boolean;
  readonly hasDisposition: boolean;
  readonly hasSupersededBy: boolean;
  readonly receiptValue: unknown;
  readonly disposition: unknown;
}

function validatePlannedPlan(ctx: PlanStateContext): boolean {
  return !ctx.hasSnapshots && !ctx.hasReceipt && !ctx.hasDisposition;
}

function validateInProgressPlan(ctx: PlanStateContext): boolean {
  return ctx.hasClaim && !ctx.hasLand && !ctx.hasReceipt && !ctx.hasDisposition;
}

function validateImplementedPlan(ctx: PlanStateContext): boolean {
  return (
    ctx.hasClaim && ctx.hasLand &&
    receipt(ctx.receiptValue) &&
    ctx.receiptValue["kind"] === "landed" &&
    !Object.hasOwn(ctx.receiptValue, "deployedAt") &&
    !ctx.hasDisposition
  );
}

function validateClosedCompletedPlan(ctx: PlanStateContext): boolean {
  return (
    ctx.hasClaim && ctx.hasLand &&
    receipt(ctx.receiptValue) &&
    ctx.receiptValue["kind"] === "deployed" &&
    rfc3339(ctx.receiptValue["deployedAt"]) &&
    !ctx.hasSupersededBy
  );
}

function validateClosedPlan(ctx: PlanStateContext): boolean {
  const allowed = ["completed", "duplicate", "not-planned", "invalid"];
  if (!allowed.includes(String(ctx.disposition))) return false;
  if (ctx.disposition === "completed") {
    return validateClosedCompletedPlan(ctx);
  }
  if (ctx.hasLand || ctx.hasReceipt) return false;
  return !ctx.hasSupersededBy || ctx.disposition === "duplicate";
}

function validateDeferredPlan(value: Record<string, unknown>, ctx: PlanStateContext): boolean {
  return (
    nonEmpty(value["trigger"]) &&
    !ctx.hasLand &&
    !ctx.hasReceipt &&
    !ctx.hasDisposition &&
    !ctx.hasSupersededBy
  );
}

function validatePlanStatusRules(value: Record<string, unknown>, status: string, ctx: PlanStateContext): boolean {
  if (ctx.hasSupersededBy && !(status === "closed" && ctx.disposition === "duplicate")) {
    return false;
  }
  switch (status) {
    case "planned": {
      return validatePlannedPlan(ctx);
    }
    case "in-progress": {
      return validateInProgressPlan(ctx);
    }
    case "implemented": {
      return validateImplementedPlan(ctx);
    }
    case "closed": {
      return validateClosedPlan(ctx);
    }
    default: {
      return validateDeferredPlan(value, ctx);
    }
  }
}

export function validatePlanRecordV1(value: unknown): value is PlanRecordV1 {
  if (!isRecord(value)) return false;
  const allowed = [
    "schemaVersion", "project", "repository", "planNumber", "title", "sourcePath",
    "status", "issue", "enqueuedAt", "enqueueTimeSource", "risk", "owner", "trigger",
    "retryReason", "supersededBy", "disposition", "receipt", "contractSnapshots",
  ];
  const required = [
    "schemaVersion", "project", "repository", "planNumber", "title", "sourcePath",
    "status", "issue", "enqueuedAt", "enqueueTimeSource", "risk",
  ];
  if (!exactKeys(value, allowed, required)) return false;
  if (!validatePlanRecordHeader(value) || !validatePlanRecordOptionalFields(value)) return false;

  const status = String(value["status"]);
  const snapshotValue = value["contractSnapshots"];
  const hasSnapshots = isRecord(snapshotValue);
  const ctx: PlanStateContext = {
    hasSnapshots,
    hasClaim: hasSnapshots && snapshot(snapshotValue["claim"]),
    hasLand: hasSnapshots && Object.hasOwn(snapshotValue, "land"),
    hasReceipt: Object.hasOwn(value, "receipt"),
    hasDisposition: Object.hasOwn(value, "disposition"),
    hasSupersededBy: Object.hasOwn(value, "supersededBy"),
    receiptValue: value["receipt"],
    disposition: value["disposition"],
  };

  return validatePlanStatusRules(value, status, ctx);
}

function legacyCandidate(
  value: Record<string, unknown>,
  targetStatus: PlanRecordStatus,
): Record<string, unknown> {
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

function migrationDecision(
  value: Record<string, unknown>,
  normalizedStatus: string,
  targetStatus: PlanRecordStatus,
  reasonCode: MigrateReasonCode,
): PlanRecordDecision {
  const candidate = legacyCandidate(value, targetStatus);
  const stalledOrParked = ["stall", "stalled", "park", "parked"].includes(normalizedStatus);
  const draft = ["draft", "draft for critic"].includes(normalizedStatus);
  if (
    !validatePlanRecordV1(candidate) ||
    (stalledOrParked && (!nonEmpty(value["retryReason"]) || !nonEmpty(value["trigger"]))) ||
    (draft && !nonEmpty(value["trigger"]))
  ) {
    return { kind: "retire", reasonCode: "INCOMPLETE_EVIDENCE" };
  }
  return { kind: "migrate", targetStatus, reasonCode };
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
  if (Object.hasOwn(value, "schemaVersion")) {
    return {
      kind: "retire",
      reasonCode:
        value["schemaVersion"] === PLAN_RECORD_SCHEMA_VERSION
          ? "INVALID_V1"
          : "UNKNOWN_SCHEMA_VERSION",
    };
  }
  const rawStatus = value["status"] ?? value["Status"];
  if (!nonEmpty(rawStatus)) return { kind: "retire", reasonCode: "UNCLASSIFIED_INPUT" };
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

export function planRecordTransitionReasonV1(
  previous: PlanRecordV1,
  next: PlanRecordV1,
): PlanRecordTransitionReasonCode | null {
  if (previous.enqueuedAt !== next.enqueuedAt) return "ENQUEUED_AT_IMMUTABLE";
  if (previous.enqueueTimeSource !== next.enqueueTimeSource) {
    return "ENQUEUE_TIME_SOURCE_IMMUTABLE";
  }
  if (
    previous.contractSnapshots !== undefined &&
    (
      next.contractSnapshots === undefined ||
      canonicalizeJson(previous.contractSnapshots.claim) !==
      canonicalizeJson(next.contractSnapshots.claim)
    )
  ) return "CLAIM_SNAPSHOT_IMMUTABLE";
  if (
    previous.contractSnapshots?.land !== undefined &&
    (
      next.contractSnapshots?.land === undefined ||
      canonicalizeJson(previous.contractSnapshots.land) !==
      canonicalizeJson(next.contractSnapshots.land)
    )
  ) return "LAND_SNAPSHOT_IMMUTABLE";
  return null;
}
