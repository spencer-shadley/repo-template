import { type ValidationResult } from "./contract.ts";
export declare const LOCAL_CI_OUTCOME_V1_ID: "repo-template/local-ci-outcome-v1";
export declare const LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION: "1.0.0";
export declare const LOCAL_CI_OUTCOME_V1_SCHEMA_ID: "https://schemas.repo-template.dev/local-ci-outcome-v1/local-ci-outcome-v1.schema.json";
/**
 * The outcome contract: never fewer than four states. `skipped` and
 * `could-not-execute` are distinct from both `pass` and `fail` -- a check that
 * did not run must never be recorded (or read) as satisfied.
 */
export declare const LOCAL_CI_OUTCOMES_V1: readonly ["pass", "fail", "skipped", "could-not-execute"];
export type LocalCiOutcomeStateV1 = (typeof LOCAL_CI_OUTCOMES_V1)[number];
export type LocalCiOutcomeV1 = Readonly<{
    schemaId: typeof LOCAL_CI_OUTCOME_V1_SCHEMA_ID;
    schemaVersion: typeof LOCAL_CI_OUTCOME_V1_SCHEMA_VERSION;
    contractId: typeof LOCAL_CI_OUTCOME_V1_ID;
    commandId: string;
    outcome: "pass" | "fail";
    exitCode: number;
    reason: null;
    detectionProofExercised: boolean;
    recordedAt: string;
}> | Readonly<{
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
export declare function validateLocalCiOutcomeV1(value: unknown): ValidationResult<LocalCiOutcomeV1>;
export declare function isNotExecutedOutcomeV1(outcome: LocalCiOutcomeStateV1): boolean;
