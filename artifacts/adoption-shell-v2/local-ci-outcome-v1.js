import {} from "./contract.js";
import { Diagnostics } from "./validation-helpers.js";
export const LOCAL_CI_OUTCOME_V1_ID = "repo-template/local-ci-outcome-v1";
export const LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION = "1.0.0";
export const LOCAL_CI_OUTCOME_V1_SCHEMA_ID = "https://schemas.repo-template.dev/local-ci-outcome-v1/local-ci-outcome-v1.schema.json";
/**
 * The outcome contract: never fewer than four states. `skipped` and
 * `could-not-execute` are distinct from both `pass` and `fail` -- a check that
 * did not run must never be recorded (or read) as satisfied.
 */
export const LOCAL_CI_OUTCOMES_V1 = ["pass", "fail", "skipped", "could-not-execute"];
const OUTCOME_SET = new Set(LOCAL_CI_OUTCOMES_V1);
const EXECUTED_OUTCOMES = new Set(["pass", "fail"]);
const NOT_EXECUTED_OUTCOMES = new Set(["skipped", "could-not-execute"]);
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
function finish(value, diagnostics) {
    const sorted = diagnostics.sorted();
    return sorted.length === 0 ? { ok: true, value } : { ok: false, diagnostics: sorted };
}
export function validateLocalCiOutcomeV1(value) {
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
        return finish(value, diagnostics);
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
    const exitCode = value["exitCode"];
    const reason = value["reason"];
    const detectionProofExercised = value["detectionProofExercised"];
    if (typeof detectionProofExercised !== "boolean") {
        diagnostics.add("E_TYPE", "/detectionProofExercised", "expected boolean");
    }
    if (diagnostics.string(value["recordedAt"], "/recordedAt", { max: 35 }) &&
        !UTC_INSTANT.test(value["recordedAt"])) {
        diagnostics.add("E_FORMAT", "/recordedAt", "must be a UTC RFC 3339 instant");
    }
    if (outcomeValid && EXECUTED_OUTCOMES.has(outcome)) {
        if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
            diagnostics.add("E_TYPE", "/exitCode", "pass/fail outcomes must carry an integer exit code");
        }
        if (reason !== null) {
            diagnostics.add("E_OUTCOME_REASON", "/reason", "pass/fail outcomes must carry a null reason");
        }
    }
    else if (outcomeValid && NOT_EXECUTED_OUTCOMES.has(outcome)) {
        if (exitCode !== null) {
            diagnostics.add("E_OUTCOME_EXIT_CODE", "/exitCode", "skipped/could-not-execute outcomes never carry an exit code");
        }
        if (typeof reason !== "string" || reason.length === 0) {
            diagnostics.add("E_OUTCOME_REASON", "/reason", "skipped/could-not-execute outcomes must carry a non-empty reason");
        }
    }
    else {
        if (typeof exitCode !== "number" && exitCode !== null) {
            diagnostics.add("E_TYPE", "/exitCode", "expected integer or null");
        }
        if (typeof reason !== "string" && reason !== null) {
            diagnostics.add("E_TYPE", "/reason", "expected string or null");
        }
    }
    return finish(value, diagnostics);
}
export function isNotExecutedOutcomeV1(outcome) {
    return NOT_EXECUTED_OUTCOMES.has(outcome);
}
