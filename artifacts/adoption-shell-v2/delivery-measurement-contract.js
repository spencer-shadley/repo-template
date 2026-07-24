import { CONTRACT_VERSION, SCHEMA_IDS, } from "./contract.js";
export const DELIVERY_MEASUREMENT_CONTRACT_ID = "repo-template/delivery-measurement-v1";
export const DELIVERY_SLI_IDS = [
    "deliveries_per_tokens",
    "human_messages_per_meaningful_delivery",
    "meaningful_deliveries_per_tokens",
    "non_meaningful_token_consumption",
    "slo_meaningful_deliveries_per_tokens",
    "slo_work_ratio",
];
export const DELIVERY_STAGES = [
    "implementation",
    "planning",
    "recovery",
    "review",
    "verification",
];
export const DELIVERY_ANTI_GAMING_EXCLUSIONS = [
    "commit",
    "documentation",
    "elapsed-turn",
    "plan",
    "pull-request",
    "receipt",
    "review-attempt",
    "token-consumption",
];
export const DELIVERY_COVERAGE_FIELDS = [
    "human-intervention",
    "landed-or-non-delivery-outcome",
    "slo-delta",
    "stable-work-outcome-identity",
    "token-stage-model",
];
export const DELIVERY_EVIDENCE_KINDS = [
    "capability",
    "defect-class",
    "material-risk",
    "operational-improvement",
];
export const DELIVERY_COVERAGE_ERRORS = [
    "incomplete-stage-capture",
    "missing-human-message-primary-attribution",
    "missing-outcome-receipt",
    "missing-slo-verification",
    "unattributed-token-usage",
];
