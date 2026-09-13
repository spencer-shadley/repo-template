import { type ValidationResult } from "./contract.ts";
export declare const PRODUCT_SLI_PROBE_CONTRACT_ID: "repo-template/product-sli-probe-v1";
export declare const PRODUCT_SLI_PROBE_SCHEMA_VERSION: "product-sli-probe/v1";
export declare const PRODUCT_SLI_PROBE_SCHEMA_ID: "https://schemas.repo-template.dev/product-sli-probe/v1/product-sli-probe.schema.json";
export declare const PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION: "product-sli-observation/v1";
export declare const PRODUCT_SLI_OBSERVATION_SCHEMA_ID: "https://schemas.repo-template.dev/product-sli-probe/v1/product-sli-observation.schema.json";
export declare const PRODUCT_SLI_MIGRATION_RECEIPT_SCHEMA_VERSION: "product-sli-migration-receipt/v1";
export declare const FORBIDDEN_SHELL_CHARACTERS: RegExp;
export declare const PRINCIPLE_ID_PATTERN: RegExp;
export declare const SLI_ID_PATTERN: RegExp;
export declare const REPOSITORY_PATTERN: RegExp;
export declare const ISO_DATE_PATTERN: RegExp;
export declare const ALLOWED_EFFECT_CLASSES: Set<string>;
export declare const FORBIDDEN_EFFECT_CLASSES: Set<string>;
export declare const OBSERVATION_KINDS: Set<string>;
export declare const COMPARATORS: Set<string>;
export declare const DISPOSITION_KINDS: Set<string>;
export declare const OBSERVATION_STATUSES: Set<string>;
export type ProductSliObservationKind = "gauge" | "count-ratio" | "boolean" | "report-only";
export type ProductSliEffectClass = "read-only" | "fixture-only";
export type ProductSliComparator = "<" | "<=" | ">" | ">=" | "==" | "!=" | "in-range" | "report-only";
export type ProductSliDispositionKind = "report-only" | "unsupported" | "non-mechanizable";
export type ProductSliObservationStatus = "pass" | "fail" | "warn" | "error" | "report-only";
export interface ProductSliSloReference {
    readonly target: string;
    readonly comparator?: ProductSliComparator;
}
export interface ProductSliDisposition {
    readonly kind: ProductSliDispositionKind;
    readonly owner: string;
    readonly reviewDate: string;
    readonly rationale: string;
}
export interface ProductSliEntrypoint {
    readonly path: string;
    readonly argv: readonly string[];
    readonly cwd?: string;
    readonly timeoutSeconds?: number;
}
export interface ProductSliEffects {
    readonly effectClass: ProductSliEffectClass;
    readonly spend?: false;
    readonly liveMutation?: false;
}
export interface ProductSliCadence {
    readonly freshnessSeconds: number;
    readonly suggestedIntervalSeconds?: number;
}
export interface ProductSliObservationReceiptSpec {
    readonly schemaVersion: typeof PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION;
    readonly evidenceKind?: string;
}
export interface ProductSliProbeV1 {
    readonly sliId: string;
    readonly bindsPrinciple: string;
    readonly kind: ProductSliObservationKind;
    readonly sloReference: ProductSliSloReference;
    readonly disposition?: ProductSliDisposition;
    readonly entrypoint?: ProductSliEntrypoint;
    readonly effects?: ProductSliEffects;
    readonly requiredCapabilities?: readonly string[];
    readonly cadence: ProductSliCadence;
    readonly receipt?: ProductSliObservationReceiptSpec;
}
export interface ProductSliProbeContractV1 {
    readonly $schema?: string;
    readonly schemaId: typeof PRODUCT_SLI_PROBE_SCHEMA_ID;
    readonly schemaVersion: typeof PRODUCT_SLI_PROBE_SCHEMA_VERSION;
    readonly contractId: typeof PRODUCT_SLI_PROBE_CONTRACT_ID;
    readonly repository: string;
    readonly probes: readonly ProductSliProbeV1[];
}
export interface ProductSliObservationV1 {
    readonly schemaId: typeof PRODUCT_SLI_OBSERVATION_SCHEMA_ID;
    readonly schemaVersion: typeof PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION;
    readonly contractId: typeof PRODUCT_SLI_PROBE_CONTRACT_ID;
    readonly observationId: string;
    readonly repository: string;
    readonly sliId: string;
    readonly observedAt: string;
    readonly status: ProductSliObservationStatus;
    readonly kind: ProductSliObservationKind;
    readonly value: number | boolean | string | Readonly<{
        numerator: number;
        denominator: number;
        ratio: number;
    }>;
    readonly target: string;
    readonly freshness?: Readonly<{
        observedAt: string;
        expiresAt?: string;
        freshnessSeconds?: number;
    }>;
    readonly evidence: Readonly<{
        kind: string;
        summary?: string;
        details?: unknown;
        receiptRef?: string;
    }>;
}
export interface ParsedPrioritiesRow {
    readonly id: string;
    readonly bindsPrinciple: string;
    readonly sli: string;
    readonly slo: string;
    readonly status: string;
    readonly line: number;
}
export interface ProductSliMigrationReceiptV1 {
    readonly schemaVersion: typeof PRODUCT_SLI_MIGRATION_RECEIPT_SCHEMA_VERSION;
    readonly repository: string;
    readonly migratedAt: string;
    readonly beforeSemanticDigest: string;
    readonly afterSemanticDigest: string;
    readonly provenancePreserved: boolean;
    readonly rowsCount: number;
    readonly mechanizedProbesCount: number;
    readonly reportOnlyProbesCount: number;
    readonly unboundActiveCount: 0;
    readonly bindings: readonly Readonly<{
        sliId: string;
        bindsPrinciple: string;
        status: string;
        probeKind: ProductSliObservationKind;
        target: string;
    }>[];
}
/**
 * Parse the authoritative ## Local SLI / SLO table from PRIORITIES.md
 */
export declare function parsePrioritiesLocalSliTable(prioritiesMarkdown: string): ParsedPrioritiesRow[];
/**
 * Validate ProductSliProbeContractV1 and optionally verify 1-to-1 binding against PRIORITIES.md
 */
export declare function validateProductSliProbeContractV1(contractRaw: unknown, prioritiesMarkdown?: string): ValidationResult<ProductSliProbeContractV1>;
/**
 * Validate typed observation payload
 */
export declare function validateProductSliObservationV1(value: unknown): ValidationResult<ProductSliObservationV1>;
/**
 * Creates a deterministic migration receipt asserting semantic preservation
 */
export declare function createProductSliMigrationReceipt(params: {
    readonly repository: string;
    readonly legacyDefinitions: readonly Readonly<{
        id: string;
        bindsPrinciple: string;
        sli: string;
        slo: string;
    }>[];
    readonly prioritiesRows: readonly ParsedPrioritiesRow[];
    readonly contract: ProductSliProbeContractV1;
    readonly migratedAt: string;
}): ProductSliMigrationReceiptV1;
