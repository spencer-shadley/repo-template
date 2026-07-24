import {
  CONTRACT_VERSION,
  SCHEMA_IDS,
} from "./contract.ts";

export const DELIVERY_MEASUREMENT_CONTRACT_ID =
  "repo-template/delivery-measurement-v1" as const;
export const DELIVERY_SLI_IDS = [
  "deliveries_per_tokens",
  "human_messages_per_meaningful_delivery",
  "meaningful_deliveries_per_tokens",
  "non_meaningful_token_consumption",
  "slo_meaningful_deliveries_per_tokens",
  "slo_work_ratio",
] as const;
export const DELIVERY_STAGES = [
  "implementation",
  "planning",
  "recovery",
  "review",
  "verification",
] as const;
export const DELIVERY_ANTI_GAMING_EXCLUSIONS = [
  "commit",
  "documentation",
  "elapsed-turn",
  "plan",
  "pull-request",
  "receipt",
  "review-attempt",
  "token-consumption",
] as const;
export const DELIVERY_COVERAGE_FIELDS = [
  "human-intervention",
  "landed-or-non-delivery-outcome",
  "slo-delta",
  "stable-work-outcome-identity",
  "token-stage-model",
] as const;
export const DELIVERY_EVIDENCE_KINDS = [
  "capability",
  "defect-class",
  "material-risk",
  "operational-improvement",
] as const;
export const DELIVERY_COVERAGE_ERRORS = [
  "incomplete-stage-capture",
  "missing-human-message-primary-attribution",
  "missing-outcome-receipt",
  "missing-slo-verification",
  "unattributed-token-usage",
] as const;

export interface DeliveryEventV1 extends Readonly<{
  schemaId: typeof SCHEMA_IDS.deliveryEvent;
  schemaVersion: typeof CONTRACT_VERSION;
  schemaDigest: string;
  contractId: typeof DELIVERY_MEASUREMENT_CONTRACT_ID;
  eventKind: "repo-template/delivery-event/v1";
  eventId: string;
  workId: string;
  repoRef: string;
  planeRef: string;
  fleetRef: string;
  recordedAt: string;
  tokenUsage: readonly Readonly<{
    attributionId: string;
    stage: (typeof DELIVERY_STAGES)[number];
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>[];
  outcome: Readonly<{
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
  sloDeltas: readonly Readonly<{
    sloRef: string;
    measuredDelta: number;
    verified: boolean;
    verificationRef: string | null;
  }>[];
  humanMessages: readonly Readonly<{
    messageId: string;
    kind: "approve" | "correct" | "decide" | "unblock";
    primaryWorkId: string;
    relatedRefs: readonly string[];
  }>[];
  coverage: Readonly<{
    complete: boolean;
    errors: readonly (typeof DELIVERY_COVERAGE_ERRORS)[number][];
  }>;
}> {}

export interface DeliveryDeclarationV1 extends Readonly<{
  schemaId: typeof SCHEMA_IDS.deliveryDeclaration;
  schemaVersion: typeof CONTRACT_VERSION;
  schemaDigest: string;
  contractId: typeof DELIVERY_MEASUREMENT_CONTRACT_ID;
  declarationKind: "repo-template/delivery-declaration/v1";
  classificationGeneration: string;
  repoBinding: Readonly<{
    repoRef: string;
    planeRef: string;
    fleetRef: string;
    registryGeneration: string;
    registryDigest: string;
    centralRollupRef: string;
  }>;
  meaningfulClasses: readonly Readonly<{
    classId: string;
    description: string;
    evidenceKinds: readonly (typeof DELIVERY_EVIDENCE_KINDS)[number][];
    aggregationMode: "segmented" | "weighted";
    weight: number | null;
  }>[];
  antiGamingExclusions: typeof DELIVERY_ANTI_GAMING_EXCLUSIONS;
  tokenAttribution: Readonly<{
    stages: typeof DELIVERY_STAGES;
    requireComplete: true;
    unattributedPolicy: "visible-coverage-error-in-totals";
  }>;
  slis: readonly Readonly<{
    id: (typeof DELIVERY_SLI_IDS)[number];
    scopes: readonly ["fleet", "plane", "repo"];
    targetRef: string;
    budgetRef: string;
    windowRef: string;
    exceptionPolicyRef: string;
    revisitTrigger: string;
    centralRollupRef: string;
  }>[];
  eventCapture: Readonly<{
    appendOnly: true;
    eventKind: "repo-template/delivery-event/v1";
    coverageErrorPolicy: "visible-non-blocking";
    requiredCoverage: typeof DELIVERY_COVERAGE_FIELDS;
  }>;
}> {}
