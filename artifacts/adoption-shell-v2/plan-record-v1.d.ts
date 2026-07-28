export declare const PLAN_RECORD_SCHEMA_VERSION: "plan-record/v1";
export declare const PLAN_BODY_BASENAME_PATTERN_SOURCE: "^(?!.*\\.(?:[Ll][Oo][Gg]|[Rr][Ee][Ss][Uu][Ll][Tt]|[Cc][Rr][Ii][Tt][Ii][Cc]|[Ff][Ee][Ee][Dd][Bb][Aa][Cc][Kk]|[Dd][Ee][Aa][Dd][Ll][Ee][Tt][Tt][Ee][Rr])\\.md$)[0-9]{3,}-[A-Za-z0-9._@()+,=-]+\\.md$";
export declare const PLAN_RECORD_STATUSES: readonly ["planned", "in-progress", "implemented", "closed", "held-authority"];
export type PlanRecordStatus = (typeof PLAN_RECORD_STATUSES)[number];
export type MigrateReasonCode = "LEGACY_READY" | "LEGACY_ACTIVE" | "LEGACY_IMPLEMENTED" | "LEGACY_CLOSED" | "LEGACY_HELD_COMPLETE";
export type RetireReasonCode = "INCOMPLETE_EVIDENCE" | "AMBIGUOUS_STATUS" | "INVALID_V1" | "UNCLASSIFIED_INPUT";
export type LegacyReasonCode = MigrateReasonCode | RetireReasonCode;
export type PlanRecordDecision = Readonly<{
    kind: "valid-v1";
    record: PlanRecordV1;
}> | Readonly<{
    kind: "migrate";
    targetStatus: PlanRecordStatus;
    reasonCode: MigrateReasonCode;
}> | Readonly<{
    kind: "retire";
    reasonCode: RetireReasonCode;
}> | Readonly<{
    kind: "archive-receipt-only";
    reasonCode: "ARCHIVE_SEALED";
}>;
export type PlanRecordTransitionReasonCode = "ENQUEUED_AT_IMMUTABLE" | "ENQUEUE_TIME_SOURCE_IMMUTABLE" | "CLAIM_SNAPSHOT_IMMUTABLE" | "LAND_SNAPSHOT_IMMUTABLE";
export interface PlanRecordV1 {
    readonly schemaVersion: "plan-record/v1";
    readonly project: string;
    readonly repository: string;
    readonly planNumber: number;
    readonly title: string;
    readonly sourcePath: string;
    readonly status: PlanRecordStatus;
    readonly issue: Readonly<{
        kind: "github";
        repository: string;
        number: number;
    } | {
        kind: "plan-host";
        repository: string;
        planNumber: number;
    }>;
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
    readonly supersededBy?: Readonly<{
        repository: string;
        planNumber: number;
    }>;
    readonly disposition?: "completed" | "duplicate" | "not-planned" | "invalid";
    readonly receipt?: Readonly<{
        kind: "landed" | "deployed";
        commit: string;
        deployedAt?: string;
    }>;
    readonly contractSnapshots?: Readonly<{
        claim: Readonly<{
            algorithm: "sha256";
            digest: string;
        }>;
        land?: Readonly<{
            algorithm: "sha256";
            digest: string;
        }>;
    }>;
}
export declare function isPlanBodyPathV1(value: unknown, location: "live" | "archive"): value is string;
export declare function validatePlanRecordV1(value: unknown): value is PlanRecordV1;
export declare function classifyPlanRecordV1(value: unknown, options?: Readonly<{
    archive?: boolean;
}>): PlanRecordDecision;
export declare function planRecordTransitionReasonV1(previous: PlanRecordV1, next: PlanRecordV1): PlanRecordTransitionReasonCode | null;
