import type { MigrateReasonCode, PlanRecordStatus, RetireReasonCode } from "./plan-record-v1.ts";
export type WorkMigrationDecisionV1 = Readonly<{
    path: string;
    decision: "migrate";
    targetStatus: PlanRecordStatus;
    reasonCode: MigrateReasonCode;
}> | Readonly<{
    path: string;
    decision: "retire";
    reasonCode: RetireReasonCode;
}>;
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
    readonly decisions: readonly WorkMigrationDecisionV1[];
    readonly liveCounts: Readonly<{
        before: number;
        migrate: number;
        retire: number;
        after: number;
    }>;
    readonly archive: Readonly<{
        count: number;
        aggregateSha256: string;
        dispositions: readonly Readonly<{
            decision: "archive-receipt-only";
            reasonCode: "ARCHIVE_SEALED";
            count: number;
            aggregateSha256: string;
        }>[];
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
