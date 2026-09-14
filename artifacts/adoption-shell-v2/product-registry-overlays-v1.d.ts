import { type Diagnostic, type PayloadEntry, type ValidationResult } from "./contract.ts";
import { Diagnostics } from "./validation-helpers.ts";
export declare const PRODUCT_OVERLAY_CONTRACT_ID: "repo-template/product-overlay-v1";
export declare const TECHNOLOGY_REGISTRY_OVERLAY_CONTRACT_ID: "repo-template/technology-registry-overlay-v1";
export declare const COMPONENT_REGISTRY_OVERLAY_CONTRACT_ID: "repo-template/component-registry-overlay-v1";
export declare const PRODUCT_OVERLAY_SCHEMA_ID: "https://schemas.repo-template.dev/overlays/v1/product-overlay.schema.json";
export declare const TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID: "https://schemas.repo-template.dev/overlays/v1/technology-registry.overlay.schema.json";
export declare const COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID: "https://schemas.repo-template.dev/overlays/v1/component-registry.overlay.schema.json";
export declare const OVERLAY_CAPABILITY_BUNDLE_ID: "repo-template/product-registry-overlays";
export declare const PRODUCT_OVERLAY_FILE_PATH: "product-overlay.yaml";
export declare const TECHNOLOGY_REGISTRY_OVERLAY_FILE_PATH: "technology-registry.overlay.yaml";
export declare const COMPONENT_REGISTRY_OVERLAY_FILE_PATH: "component-registry.overlay.yaml";
export declare const PRODUCT_OVERLAY_ROLES: Set<"accessory" | "dormant" | "not-targeted" | "primary" | "secondary" | "specialized">;
export type ProductOverlayRole = "primary" | "secondary" | "accessory" | "specialized" | "dormant" | "not-targeted";
export declare const REGISTRY_LIFECYCLE_VALUES: Set<"candidate" | "context-preferred" | "discouraged" | "legacy-compatibility" | "preferred-default" | "prohibited" | "supported-alternative">;
export type RegistryLifecycle = "preferred-default" | "context-preferred" | "supported-alternative" | "candidate" | "legacy-compatibility" | "discouraged" | "prohibited";
export interface TemplateReleaseProvenance {
    readonly repository: string;
    readonly semver: string;
    readonly releaseDigest: string;
    readonly releaseId?: string;
    readonly receiptDigest?: string;
}
export interface BootstrapProvenance {
    readonly templateRelease: TemplateReleaseProvenance;
    readonly bootstrappedFromGuideVersion?: string;
    readonly lastAuditedAgainstGuideVersion?: string;
}
export interface PlatformRecord {
    readonly role: ProductOverlayRole;
    readonly priority: number;
    readonly owner: string;
    readonly acceptanceSuites: readonly string[];
    readonly rationale?: string;
    readonly revisitTrigger?: string;
    readonly grandfatheredDivergences?: readonly string[];
    readonly bootstrappedFromGuideVersion?: string;
    readonly lastAuditedAgainstGuideVersion?: string;
}
export interface ProductOverlay {
    readonly schemaVersion: string;
    readonly contractId: typeof PRODUCT_OVERLAY_CONTRACT_ID;
    readonly profile: string;
    readonly provenance: BootstrapProvenance;
    readonly platforms: Readonly<Record<string, PlatformRecord>>;
}
export interface CandidateEvaluation {
    readonly owner: string;
    readonly reviewTrigger: string;
    readonly targetEvidence: string;
    readonly exitCriteria: string;
}
export interface TechnologyOverlayEntry {
    readonly logicalId: string;
    readonly lifecycle: RegistryLifecycle;
    readonly priority: number;
    readonly rationale: string;
    readonly package?: string;
    readonly selectedVersion?: string;
    readonly evaluation?: CandidateEvaluation;
}
export interface TechnologyRegistryOverlay {
    readonly schemaVersion: string;
    readonly contractId: typeof TECHNOLOGY_REGISTRY_OVERLAY_CONTRACT_ID;
    readonly provenance: BootstrapProvenance;
    readonly technologies: readonly TechnologyOverlayEntry[];
}
export interface ComponentOverlayEntry {
    readonly logicalId: string;
    readonly lifecycle: RegistryLifecycle;
    readonly priority: number;
    readonly rationale: string;
    readonly package?: string;
    readonly selectedVersion?: string;
}
export interface ComponentRegistryOverlay {
    readonly schemaVersion: string;
    readonly contractId: typeof COMPONENT_REGISTRY_OVERLAY_CONTRACT_ID;
    readonly provenance: BootstrapProvenance;
    readonly components: readonly ComponentOverlayEntry[];
}
/**
 * Checks whether a string contains mutable branch references, branch URLs, or non-immutable authority references.
 */
export declare function isMutableBranchReference(value: string): boolean;
export declare function validateBootstrapProvenance(value: unknown, pointer: string, diagnostics: Diagnostics): value is BootstrapProvenance;
export declare function validateProductOverlay(value: unknown, pointer?: string): ValidationResult<ProductOverlay>;
export declare function validateTechnologyRegistryOverlay(value: unknown, pointer?: string): ValidationResult<TechnologyRegistryOverlay>;
export declare function validateComponentRegistryOverlay(value: unknown, pointer?: string): ValidationResult<ComponentRegistryOverlay>;
export declare function parseOverlayYaml(yamlText: string): unknown;
export declare function formatOverlayYaml(data: unknown, indentLevel?: number): string;
export declare function validateOverlayPayloadEntries(entries: readonly PayloadEntry[]): readonly Diagnostic[];
