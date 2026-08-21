import { type ValidationResult } from "./contract.ts";
import { Diagnostics } from "./validation-helpers.ts";

export const LOCAL_CI_OUTCOME_V1_ID = "repo-template/local-ci-outcome-v1" as const;
export const LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION = "1.0.0" as const;
export const LOCAL_CI_OUTCOME_V1_SCHEMA_ID =
  "https://schemas.repo-template.dev/local-ci-outcome-v1/local-ci-outcome-v1.schema.json" as const;

/**
 * The outcome contract: never fewer than four states. `skipped` and
 * `could-not-execute` are distinct from both `pass` and `fail` -- a check that
 * did not run must never be recorded (or read) as satisfied.
 */
export const LOCAL_CI_OUTCOMES_V1 = ["pass", "fail", "skipped", "could-not-execute"] as const;
export type LocalCiOutcomeStateV1 = (typeof LOCAL_CI_OUTCOMES_V1)[number];

export type LocalCiOutcomeV1 =
  | Readonly<{
      schemaId: typeof LOCAL_CI_OUTCOME_V1_SCHEMA_ID;
      schemaVersion: typeof LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION;
      contractId: typeof LOCAL_CI_OUTCOME_V1_ID;
      commandId: string;
      outcome: "pass" | "fail";
      exitCode: number;
      reason: null;
      detectionProofExercised: boolean;
      recordedAt: string;
    }>
  | Readonly<{
      schemaId: typeof LOCAL_CI_OUTCOME_V1_SCHEMA_ID;
      schemaVersion: typeof LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION;
      contractId: typeof LOCAL_CI_OUTCOME_V1_ID;
      commandId: string;
      outcome: "skipped" | "could-not-execute";
      exitCode: null;
      reason: string;
      detectionProofExercised: boolean;
      recordedAt: string;
    }>;

const OUTCOME_SET = new Set<string>(LOCAL_CI_OUTCOMES_V1);
const EXECUTED_OUTCOMES = new Set(["pass", "fail"]);
const NOT_EXECUTED_OUTCOMES = new Set(["skipped", "could-not-execute"]);
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function finish<T>(value: T | undefined, diagnostics: Diagnostics): ValidationResult<T> {
  const sorted = diagnostics.sorted();
  return sorted.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: sorted };
}

function hasValidatedShape(value: unknown, diagnostics: Diagnostics): value is LocalCiOutcomeV1 {
  return diagnostics.rows.length === 0;
}

function validateExecutedOutcome(
  exitCode: unknown,
  reason: unknown,
  diagnostics: Diagnostics,
): void {
  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
    diagnostics.add("E_TYPE", "/exitCode", "pass/fail outcomes must carry an integer exit code");
  }
  if (reason !== null) {
    diagnostics.add(
      "E_OUTCOME_REASON",
      "/reason",
      "pass/fail outcomes must carry a null reason",
    );
  }
}

function validateNotExecutedOutcome(
  exitCode: unknown,
  reason: unknown,
  diagnostics: Diagnostics,
): void {
  if (exitCode !== null) {
    diagnostics.add(
      "E_OUTCOME_EXIT_CODE",
      "/exitCode",
      "skipped/could-not-execute outcomes never carry an exit code",
    );
  }
  if (typeof reason !== "string" || reason.length === 0) {
    diagnostics.add(
      "E_OUTCOME_REASON",
      "/reason",
      "skipped/could-not-execute outcomes must carry a non-empty reason",
    );
  }
}

function validateOutcomePayload(
  outcome: unknown,
  outcomeValid: boolean,
  exitCode: unknown,
  reason: unknown,
  diagnostics: Diagnostics,
): void {
  if (outcomeValid && typeof outcome === "string" && EXECUTED_OUTCOMES.has(outcome)) {
    validateExecutedOutcome(exitCode, reason, diagnostics);
  } else if (outcomeValid && typeof outcome === "string" && NOT_EXECUTED_OUTCOMES.has(outcome)) {
    validateNotExecutedOutcome(exitCode, reason, diagnostics);
  } else {
    if (typeof exitCode !== "number" && exitCode !== null) {
      diagnostics.add("E_TYPE", "/exitCode", "expected integer or null");
    }
    if (typeof reason !== "string" && reason !== null) {
      diagnostics.add("E_TYPE", "/reason", "expected string or null");
    }
  }
}

export function validateLocalCiOutcomeV1(value: unknown): ValidationResult<LocalCiOutcomeV1> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId",
    "schemaVersion",
    "contractId",
    "commandId",
    "outcome",
    "exitCode",
    "reason",
    "detectionProofExercised",
    "recordedAt",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish<LocalCiOutcomeV1>(undefined, diagnostics);
  }

  diagnostics.string(value["schemaId"], "/schemaId", { constant: LOCAL_CI_OUTCOME_V1_SCHEMA_ID });
  diagnostics.string(value["schemaVersion"], "/schemaVersion", { constant: LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION });
  diagnostics.string(value["contractId"], "/contractId", { constant: LOCAL_CI_OUTCOME_V1_ID });
  diagnostics.string(value["commandId"], "/commandId", { min: 1 });

  const outcome = value["outcome"];
  const outcomeValid = diagnostics.string(outcome, "/outcome") && OUTCOME_SET.has(outcome);
  if (typeof outcome === "string" && !OUTCOME_SET.has(outcome)) {
    diagnostics.add("E_ENUM", "/outcome", "unsupported outcome state");
  }

  if (typeof value["detectionProofExercised"] !== "boolean") {
    diagnostics.add("E_TYPE", "/detectionProofExercised", "expected boolean");
  }
  if (
    diagnostics.string(value["recordedAt"], "/recordedAt", { max: 35 }) &&
    !UTC_INSTANT.test(value["recordedAt"])
  ) {
    diagnostics.add("E_FORMAT", "/recordedAt", "must be a UTC RFC 3339 instant");
  }

  validateOutcomePayload(
    outcome,
    outcomeValid,
    value["exitCode"],
    value["reason"],
    diagnostics,
  );
  return finish(
    hasValidatedShape(value, diagnostics) ? value : undefined,
    diagnostics,
  );
}

export function isNotExecutedOutcomeV1(outcome: LocalCiOutcomeStateV1): boolean {
  return NOT_EXECUTED_OUTCOMES.has(outcome);
}
