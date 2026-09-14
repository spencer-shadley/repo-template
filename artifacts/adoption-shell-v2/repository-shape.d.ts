import { type CapabilityBundle, type PayloadEntry, type ValidationResult } from "./contract.ts";
export declare const REPOSITORY_SHAPE_CONTRACT_ID: "repo-template/repository-shape/v1";
export declare const REPOSITORY_SHAPE_SCHEMA_VERSION: "1.0.0";
export declare const REPOSITORY_SHAPE_SCHEMA_ID: "https://schemas.repo-template.dev/repository-shape/v1/repository-shape.schema.json";
export declare const TURBO_SCHEMA_ID: "https://turbo.build/schema.json";
export declare const REPOSITORY_SHAPE_BUNDLE_ID: "repo-template/repository-shape";
export declare const REPOSITORY_SHAPE_BUNDLE_VERSION: "1.0.0";
export declare const PORTABLE_ROOT_FAMILIES: readonly ["apps", "services", "native", "tools", "packages", "database", "infrastructure"];
export type PortableRootFamily = (typeof PORTABLE_ROOT_FAMILIES)[number];
export declare const CORE_PRODUCT_ROOT_FAMILIES: readonly ["apps", "services", "tools", "packages"];
export declare const OPTIONAL_ROOT_FAMILIES: readonly ["native", "database", "infrastructure"];
export declare const CANONICAL_TURBO_TASKS: readonly ["build", "test", "lint", "verify"];
export type CanonicalTurboTask = (typeof CANONICAL_TURBO_TASKS)[number];
export interface TurboTaskDefinition {
    readonly dependsOn?: readonly string[];
    readonly outputs?: readonly string[];
    readonly cache?: boolean;
    readonly inputs?: readonly string[];
    readonly persistent?: boolean;
}
export interface TurboTaskGraph {
    readonly $schema?: string;
    readonly tasks: Readonly<Record<string, TurboTaskDefinition>>;
}
export interface RepositoryProfile {
    readonly profileId: string;
    readonly monorepo: boolean;
    readonly rootFamilies: readonly PortableRootFamily[];
    readonly declaredScripts: readonly string[] | Readonly<Record<string, string>>;
}
export declare const FULL_STACK_PROFILE: RepositoryProfile;
export declare const SERVICE_PROFILE: RepositoryProfile;
export declare const LIBRARY_PROFILE: RepositoryProfile;
export declare const STANDALONE_PROFILE: RepositoryProfile;
export declare function composeTurboTaskGraph(declaredScripts: readonly string[] | Readonly<Record<string, string>>): TurboTaskGraph;
export declare function createTurboJsonContent(declaredScripts: readonly string[] | Readonly<Record<string, string>>): string;
export declare function resolveRepositoryShapeRoots(profile: RepositoryProfile): readonly PortableRootFamily[];
export declare function createRepositorySkeletonEntries(rootFamilies: readonly PortableRootFamily[], bundleId?: string | null): readonly PayloadEntry[];
export declare function createTurboJsonPayloadEntry(declaredScripts: readonly string[] | Readonly<Record<string, string>>, bundleId?: string | null): PayloadEntry;
export declare function materializeRepositoryShapeEntries(profile: RepositoryProfile, bundleId?: string | null): readonly PayloadEntry[];
export declare function createRepositoryShapeBundle(profile: RepositoryProfile, options?: Readonly<{
    id?: string;
    version?: string;
}>): CapabilityBundle;
export declare function validateTurboTaskGraph(value: unknown): ValidationResult<TurboTaskGraph>;
export declare function validateRepositoryProfile(value: unknown): ValidationResult<RepositoryProfile>;
