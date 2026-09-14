export declare const PRODUCT_OVERLAY_CONTRACT_ID: "repo-template/product-overlay/v1";
export declare const PRODUCT_OVERLAY_SCHEMA_VERSION: "1.0.0";
export declare const PRODUCT_OVERLAY_SCHEMA_ID: "https://schemas.repo-template.dev/product-overlay/v1/product-overlay.schema.json";
export declare const TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID: "https://schemas.repo-template.dev/product-overlay/v1/technology-registry.overlay.schema.json";
export declare const COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID: "https://schemas.repo-template.dev/product-overlay/v1/component-registry.overlay.schema.json";
export declare const PRODUCT_OVERLAY_BUNDLE_ID: "repo-template/product-overlay";
export declare const PRODUCT_OVERLAY_BUNDLE_VERSION: "1.0.0";
export declare const PRODUCT_OVERLAY_FILE: "product-overlay.yaml";
export declare const TECHNOLOGY_REGISTRY_OVERLAY_FILE: "technology-registry.overlay.yaml";
export declare const COMPONENT_REGISTRY_OVERLAY_FILE: "component-registry.overlay.yaml";
export declare const PRODUCT_PLATFORM_ROLES: readonly ["primary", "secondary", "accessory", "specialized", "dormant", "not-targeted"];
export type ProductPlatformRole = (typeof PRODUCT_PLATFORM_ROLES)[number];
export declare const REGISTRY_LIFECYCLE_STATES: readonly ["preferred-default", "context-preferred", "supported-alternative", "candidate", "legacy-compatibility", "discouraged", "prohibited"];
export type RegistryLifecycleState = (typeof REGISTRY_LIFECYCLE_STATES)[number];
export declare const CANONICAL_PLATFORM_NAMES: readonly ["web", "android", "windows", "browser-extension", "chromeos", "ios", "macos", "linux", "cli", "scheduled-job"];
export interface ProductPlatformDefinition {
    readonly role: ProductPlatformRole;
    readonly priority?: number;
    readonly rationale?: string;
    readonly revisitTrigger?: string;
    readonly owner?: string;
    readonly acceptanceSuites?: readonly string[];
}
export interface GrandfatheredDivergence {
    readonly component: string;
    readonly current: string;
    readonly guideDefault: string;
    readonly guideSection?: string;
    readonly rationale: string;
    readonly revisitTrigger?: string;
}
export interface ProductOverlayProvenance {
    readonly contractId?: string;
    readonly templateRelease: string;
    readonly templateDigest?: string;
    readonly templateCommit?: string;
    readonly bootstrappedFromGuideVersion?: string;
    readonly lastAuditedAgainstGuideVersion?: string;
}
export interface ProductOverlay {
    readonly $schema?: string;
    readonly schemaId?: string;
    readonly schemaVersion?: string;
    readonly contractId?: string;
    readonly bootstrappedFromGuideVersion?: string;
    readonly lastAuditedAgainstGuideVersion?: string;
    readonly templateRelease?: string;
    readonly templateDigest?: string;
    readonly templateCommit?: string;
    readonly provenance?: ProductOverlayProvenance;
    readonly platforms: Readonly<Record<string, ProductPlatformDefinition>>;
    readonly grandfatheredDivergences?: readonly GrandfatheredDivergence[];
}
export interface TechnologyOverlayEntry {
    readonly id?: string;
    readonly state: RegistryLifecycleState;
    readonly category?: string;
    readonly contexts?: readonly string[];
    readonly rationale?: string;
    readonly revisitTrigger?: string;
    readonly versionPolicy?: string;
    readonly selectedVersion?: string;
}
export interface TechnologyRegistryOverlay {
    readonly $schema?: string;
    readonly schemaId?: string;
    readonly schemaVersion?: string;
    readonly contractId?: string;
    readonly registryKind: "technology" | "technology-overlay";
    readonly bootstrappedFromGuideVersion?: string;
    readonly lastAuditedAgainstGuideVersion?: string;
    readonly templateRelease?: string;
    readonly templateDigest?: string;
    readonly templateCommit?: string;
    readonly provenance?: ProductOverlayProvenance;
    readonly technologies: Readonly<Record<string, TechnologyOverlayEntry>>;
}
export interface ComponentOverlayEntry {
    readonly id?: string;
    readonly state: RegistryLifecycleState;
    readonly category?: string;
    readonly contexts?: readonly string[];
    readonly rationale?: string;
    readonly revisitTrigger?: string;
    readonly versionPolicy?: string;
    readonly selectedVersion?: string;
}
export type RegistryEntryOverlay = TechnologyOverlayEntry;
export interface ComponentRegistryOverlay {
    readonly $schema?: string;
    readonly schemaId?: string;
    readonly schemaVersion?: string;
    readonly contractId?: string;
    readonly registryKind: "component" | "component-overlay";
    readonly bootstrappedFromGuideVersion?: string;
    readonly lastAuditedAgainstGuideVersion?: string;
    readonly templateRelease?: string;
    readonly templateDigest?: string;
    readonly templateCommit?: string;
    readonly provenance?: ProductOverlayProvenance;
    readonly components: Readonly<Record<string, ComponentOverlayEntry>>;
}
export interface ProductOverlayOptions {
    readonly provenance?: ProductOverlayProvenance;
    readonly platforms?: Readonly<Record<string, ProductPlatformDefinition>>;
    readonly grandfatheredDivergences?: readonly GrandfatheredDivergence[];
    readonly technologies?: Readonly<Record<string, TechnologyOverlayEntry>>;
    readonly components?: Readonly<Record<string, ComponentOverlayEntry>>;
}
export declare function isImmutableProvenance(value: unknown): boolean;
export declare function defaultPlatformsForProfile(profileId: string): Record<string, ProductPlatformDefinition>;
export declare function defaultTechnologiesForProfile(profileId: string): Record<string, TechnologyOverlayEntry>;
export declare function defaultComponentsForProfile(profileId: string): Record<string, ComponentOverlayEntry>;
export declare function defaultProvenance(): ProductOverlayProvenance;
