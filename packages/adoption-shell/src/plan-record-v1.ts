import { canonicalizeJson } from "./canonical-json.ts";
import { sha256Bytes } from "./digest.ts";
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
const legacyReady = new Set(["ready", "draft", "stalled", "parked"]);
const legacyActive = new Set(["active", "implementing", "in progress"]);
const legacyTerminal = new Set(["done", "landed", "shipped", "resolved"]);

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function rfc3339(value: unknown): value is string {
  return nonEmpty(value) &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function reference(value: unknown): boolean {
  if (!isRecord(value) || !nonEmpty(value["repository"])) return false;
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

function validV1(value: unknown): value is PlanRecordV1 {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "schemaVersion", "project", "repository", "planNumber", "title", "sourcePath",
    "status", "issue", "enqueuedAt", "enqueueTimeSource", "risk", "owner", "trigger",
    "retryReason", "supersededBy", "disposition", "receipt", "contractSnapshots",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (
    value["schemaVersion"] !== PLAN_RECORD_SCHEMA_VERSION ||
    !nonEmpty(value["project"]) || !nonEmpty(value["repository"]) ||
    !Number.isSafeInteger(value["planNumber"]) || Number(value["planNumber"]) < 0 ||
    !nonEmpty(value["title"]) || !nonEmpty(value["sourcePath"]) ||
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
      typeof receipt["commit"] !== "string" || !SHA256_PATTERN.test(receipt["commit"]) ||
      Object.keys(receipt).some((key) => !["kind", "commit", "deployedAt"].includes(key))) return false;
    if (value["status"] === "implemented" && receipt["kind"] !== "landed") return false;
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
  if (validV1(value)) return { kind: "valid-v1", record: value };
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
  if (normalized === "held" && nonEmpty(value["trigger"])) {
    return { kind: "migrate", reasonCode: "LEGACY_HELD_COMPLETE" };
  }
  return { kind: "retire", reasonCode: "AMBIGUOUS_STATUS" };
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

export function createWorkMigrationManifestV1(
  input: Omit<WorkMigrationManifestV1, "manifestSha256">,
): WorkMigrationManifestV1 {
  if (input.unclassifiedCount !== 0) throw new TypeError("unclassifiedCount must be zero");
  const decisions = [...input.decisions].sort((a, b) => a.path.localeCompare(b.path, "en"));
  const changedPaths = [...input.changedPaths].sort();
  const verification = [...input.verification].sort();
  const body = { ...input, decisions, changedPaths, verification };
  return {
    ...body,
    manifestSha256: sha256Bytes(encoder.encode(canonicalizeJson(body))),
  };
}
