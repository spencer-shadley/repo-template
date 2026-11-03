import { type CapabilityBundle, type PayloadEntry, type ValidationResult } from "./contract.ts";
import type { RepositoryProfile } from "./repository-shape.ts";
export declare const TEST_HARNESS_CONTRACT_ID: "repo-template/test-harness/v1";
export declare const TEST_HARNESS_SCHEMA_VERSION: "1.0.0";
export declare const TEST_HARNESS_SCHEMA_ID: "https://schemas.repo-template.dev/test-harness/v1/test-harness.schema.json";
export declare const TEST_HARNESS_BUNDLE_ID: "repo-template/test-harness";
export declare const TEST_HARNESS_BUNDLE_VERSION: "1.0.0";
export declare const VITEST_HARNESS_BUNDLE_ID: "repo-template/test-harness";
export declare const DEFAULT_VITEST_VERSION: "3.0.7";
export declare const DEFAULT_VITEST_CONFIG_PATH: "vitest.config.ts";
export declare const DEFAULT_SMOKE_TEST_PATH: "test/smoke.test.ts";
export interface TestHarnessProfile {
    readonly profileId: string;
    readonly monorepo?: boolean;
    readonly rootFamilies?: readonly string[];
    readonly declaredScripts?: readonly string[] | Readonly<Record<string, string>>;
    readonly language?: string;
    readonly testRunner?: string;
    readonly framework?: "vitest";
    readonly configPath?: string;
    readonly smokeTestPath?: string;
    readonly vitestVersion?: string;
}
export interface TestHarnessOptions {
    readonly configPath?: string;
    readonly smokeTestPath?: string;
    readonly vitestVersion?: string;
    readonly language?: string;
    readonly testRunner?: string;
    readonly passWithNoTests?: boolean;
}
export interface TestHarnessConfig {
    readonly $schema?: string;
    readonly schemaId?: string;
    readonly schemaVersion?: string;
    readonly contractId?: string;
    readonly profileId: string;
    readonly framework: "vitest";
    readonly language?: "typescript" | "javascript";
    readonly configPath: string;
    readonly smokeTestPath: string;
    readonly vitestVersion?: string;
    readonly declaredScripts?: readonly string[];
}
export interface EffectiveTestHarnessSettings {
    readonly configPath: string;
    readonly smokeTestPath: string;
    readonly vitestVersion: string;
    readonly language?: string | undefined;
    readonly testRunner?: string | undefined;
    readonly passWithNoTests: boolean;
}
export declare function resolveEffectiveTestHarnessSettings(profile?: RepositoryProfile | TestHarnessProfile, options?: TestHarnessOptions): EffectiveTestHarnessSettings;
export declare function isTestHarnessApplicable(profile: RepositoryProfile | TestHarnessProfile, options?: TestHarnessOptions): boolean;
export declare function createVitestConfigContent(options?: TestHarnessOptions): string;
export declare function createSmokeTestContent(_options?: TestHarnessOptions): string;
export declare function mergePackageJsonWithTestHarness(packageJson: string | Record<string, unknown>, options?: TestHarnessOptions, profile?: RepositoryProfile | TestHarnessProfile): string;
export declare function createVitestConfigPayloadEntry(bundleId?: string | null, options?: TestHarnessOptions, profile?: RepositoryProfile | TestHarnessProfile): PayloadEntry;
export declare function createSmokeTestPayloadEntry(bundleId?: string | null, options?: TestHarnessOptions, profile?: RepositoryProfile | TestHarnessProfile): PayloadEntry;
export declare function materializeTestHarnessEntries(profile: RepositoryProfile | TestHarnessProfile, options?: TestHarnessOptions, bundleId?: string | null): readonly PayloadEntry[];
export declare function createTestHarnessBundle(profile: RepositoryProfile | TestHarnessProfile, options?: TestHarnessOptions & {
    id?: string;
    version?: string;
}): CapabilityBundle;
export declare function composeTestHarnessReleaseEntries(profile: RepositoryProfile | TestHarnessProfile, baseEntries: readonly PayloadEntry[], options?: TestHarnessOptions, bundleId?: string | null): readonly PayloadEntry[];
export declare function validateTestHarnessConfig(value: unknown): ValidationResult<TestHarnessConfig>;
