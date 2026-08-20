import { CONTRACT_VERSION, SCHEMA_IDS } from "./contract.ts";
export declare const DELIVERY_MEASUREMENT_CONTRACT_ID: "repo-template/delivery-measurement-v1";
export declare const DELIVERY_SLI_IDS: readonly ["deliveries_per_tokens", "human_messages_per_meaningful_delivery", "meaningful_deliveries_per_tokens", "non_meaningful_token_consumption", "slo_meaningful_deliveries_per_tokens", "slo_work_ratio"];
export declare const DELIVERY_STAGES: readonly ["implementation", "planning", "recovery", "review", "verification"];
export declare const DELIVERY_ANTI_GAMING_EXCLUSIONS: readonly ["commit", "documentation", "elapsed-turn", "plan", "pull-request", "receipt", "review-attempt", "token-consumption"];
export declare const DELIVERY_COVERAGE_FIELDS: readonly ["human-intervention", "landed-or-non-delivery-outcome", "slo-delta", "stable-work-outcome-identity", "token-stage-model"];
export declare const DELIVERY_EVIDENCE_KINDS: readonly ["capability", "defect-class", "material-risk", "operational-improvement"];
export declare const DELIVERY_COVERAGE_ERRORS: readonly ["incomplete-stage-capture", "missing-human-message-primary-attribution", "missing-outcome-receipt", "missing-slo-verification", "unattributed-token-usage"];
export interface DeliveryEventV1 {
    readonly schemaId: typeof SCHEMA_IDS.deliveryEvent;
    readonly schemaVersion: typeof CONTRACT_VERSION;
    readonly schemaDigest: string;
    readonly contractId: typeof DELIVERY_MEASUREMENT_CONTRACT_ID;
    readonly eventKind: "repo-template/delivery-event/v1";
    readonly eventId: string;
    readonly workId: string;
    readonly repoRef: string;
    readonly planeRef: string;
    readonly fleetRef: string;
    readonly recordedAt: string;
    readonly tokenUsage: readonly Readonly<{
        attributionId: string;
        stage: (typeof DELIVERY_STAGES)[number];
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    }>[];
    readonly outcome: Readonly<{
        outcomeId: string;
        status: "landed" | "non-delivery";
        receiptRef: string;
        meaningful: boolean;
        meaningfulClass: string | null;
        weight: number;
        qualifyingEvidence: readonly Readonly<{
            kind: (typeof DELIVERY_EVIDENCE_KINDS)[number];
            verificationRef: string;
        }>[];
        activityRefs: readonly string[];
    }>;
    readonly sloDeltas: readonly Readonly<{
        sloRef: string;
        measuredDelta: number;
        verified: boolean;
        verificationRef: string | null;
    }>[];
    readonly humanMessages: readonly Readonly<{
        messageId: string;
        kind: "approve" | "correct" | "decide" | "unblock";
        primaryWorkId: string;
        relatedRefs: readonly string[];
    }>[];
    readonly coverage: Readonly<{
        complete: boolean;
        errors: readonly (typeof DELIVERY_COVERAGE_ERRORS)[number][];
    }>;
}
export interface DeliveryDeclarationV1 {
    readonly schemaId: typeof SCHEMA_IDS.deliveryDeclaration;
    readonly schemaVersion: typeof CONTRACT_VERSION;
    readonly schemaDigest: string;
    readonly contractId: typeof DELIVERY_MEASUREMENT_CONTRACT_ID;
    readonly declarationKind: "repo-template/delivery-declaration/v1";
    readonly classificationGeneration: string;
    readonly repoBinding: Readonly<{
        repoRef: string;
        planeRef: string;
        fleetRef: string;
        registryGeneration: string;
        registryDigest: string;
        centralRollupRef: string;
    }>;
    readonly meaningfulClasses: readonly Readonly<{
        classId: string;
        description: string;
        evidenceKinds: readonly (typeof DELIVERY_EVIDENCE_KINDS)[number][];
        aggregationMode: "segmented" | "weighted";
        weight: number | null;
    }>[];
    readonly antiGamingExclusions: typeof DELIVERY_ANTI_GAMING_EXCLUSIONS;
    readonly tokenAttribution: Readonly<{
        stages: typeof DELIVERY_STAGES;
        requireComplete: true;
        unattributedPolicy: "visible-coverage-error-in-totals";
    }>;
    readonly slis: readonly Readonly<{
        id: (typeof DELIVERY_SLI_IDS)[number];
        scopes: readonly ["fleet", "plane", "repo"];
        targetRef: string;
        budgetRef: string;
        windowRef: string;
        exceptionPolicyRef: string;
        revisitTrigger: string;
        centralRollupRef: string;
    }>[];
    readonly eventCapture: Readonly<{
        appendOnly: true;
        eventKind: "repo-template/delivery-event/v1";
        coverageErrorPolicy: "visible-non-blocking";
        requiredCoverage: typeof DELIVERY_COVERAGE_FIELDS;
    }>;
}
