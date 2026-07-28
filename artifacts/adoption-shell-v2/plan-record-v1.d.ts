export declare const PLAN_RECORD_SCHEMA_VERSION: "plan-record/v1";
export declare const PLAN_RECORD_STATUSES: readonly ["planned", "in-progress", "implemented", "closed", "held-authority"];
export type PlanRecordStatus = (typeof PLAN_RECORD_STATUSES)[number];
export type PlanRecordDecision = Readonly<{
    kind: "valid-v1";
    record: PlanRecordV1;
}> | Readonly<{
    kind: "migrate";
    reasonCode: LegacyReasonCode;
}> | Readonly<{
    kind: "retire";
    reasonCode: LegacyReasonCode;
}> | Readonly<{
    kind: "archive-receipt-only";
    reasonCode: "ARCHIVE_SEALED";
}>;
export type LegacyReasonCode = "LEGACY_READY" | "LEGACY_ACTIVE" | "LEGACY_TERMINAL" | "LEGACY_HELD_COMPLETE" | "AMBIGUOUS_STATUS" | "INVALID_V1" | "UNCLASSIFIED_INPUT";
export type PlanRecordTransitionReasonCode = "ENQUEUED_AT_IMMUTABLE" | "CLAIM_SNAPSHOT_IMMUTABLE" | "LAND_SNAPSHOT_IMMUTABLE";
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
    readonly contractSnapshots: Readonly<{
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
export declare function validatePlanRecordV1(value: unknown): value is PlanRecordV1;
export declare function classifyPlanRecordV1(value: unknown, options?: Readonly<{
    archive?: boolean;
}>): PlanRecordDecision;
export declare function planRecordTransitionReasonV1(previous: PlanRecordV1, next: PlanRecordV1): PlanRecordTransitionReasonCode | null;
export interface WorkMigrationManifestV1 {
    readonly schemaVersion: "work-migration-manifest/v1";
    readonly source: Readonly<{
        commit: string;
        tree: string;
    }>;
    readonly schemaRelease: Readonly<{
        version: string;
        digest: string;
    }>;
    readonly decisions: readonly Readonly<{
        path: string;
        decision: "migrate" | "retire";
        reasonCode: LegacyReasonCode;
    }>[];
    readonly archive: Readonly<{
        count: number;
        aggregateSha256: string;
    }>;
    readonly changedPaths: readonly string[];
    readonly verification: readonly string[];
    readonly canary: Readonly<{
        repository: string;
        state: "pending" | "green" | "red";
    }>;
    readonly rollbackRef: string;
    readonly unclassifiedCount: 0;
    readonly manifestSha256: string;
}
export declare function validateWorkMigrationManifestV1(value: unknown): value is WorkMigrationManifestV1;
export declare function createWorkMigrationManifestV1(input: Omit<WorkMigrationManifestV1, "manifestSha256">): WorkMigrationManifestV1;
