import { type Diagnostic, type ValidationResult } from "./contract.ts";
import { type LegacyLineageKind } from "./local-ci-contract-v2.ts";
import { type LocalCiPrReceiptBindingV3, type LocalCiSimpleDiffClassV3 } from "./local-ci-contract-v3-overlay.ts";
export declare const LOCAL_CI_CONTRACT_V3_ID: "repo-template/local-ci-v3";
export declare const LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION: "3.0.0";
export declare const LOCAL_CI_CONTRACT_V3_SCHEMA_ID: "https://schemas.repo-template.dev/local-ci-v3/local-ci-contract-v3.schema.json";
export type LocalCiShellV3 = "pwsh" | "cmd" | "bash" | "sh" | "none";
export type LocalCiFailureDispositionV3 = "fail-gate" | "warning" | "non-routable";
export type LocalCiNetworkExpectationV3 = "offline-only" | "local-loopback" | "outbound-allowed";
export type DetectionProofExpectationV3 = "non-zero-exit";
export interface DetectionProofFixtureV3 {
    readonly path: string;
    readonly description: string;
    readonly expectation: DetectionProofExpectationV3;
}
export type DetectionProofV3 = Readonly<{
    fixture: DetectionProofFixtureV3;
    exempt?: undefined;
}> | Readonly<{
    fixture?: undefined;
    exempt: string;
}>;
export interface LocalCiCommandV3 {
    readonly name: string;
    readonly executable: string;
    readonly args: readonly string[];
    readonly shell: LocalCiShellV3;
    readonly cwd: string;
    readonly timeoutSeconds: number;
    readonly expectedExitCode: number;
    readonly failureDisposition: LocalCiFailureDispositionV3;
    readonly detectionProof: DetectionProofV3;
}
export interface OrderedLocalCiCommandV3 extends LocalCiCommandV3 {
    readonly id: string;
    readonly order: number;
    readonly isAuthoritativeGate: boolean;
}
export interface LocalCiEnvironmentV3 {
    readonly runtime: Readonly<{
        name: string;
        versionConstraint: string;
    }>;
    readonly packageManager: Readonly<{
        name: string;
        version: string;
    }>;
    readonly supportedPlatforms: readonly string[];
    readonly supportedArchitectures: readonly string[];
    readonly requiredEnvVars: readonly string[];
    readonly requiredCredentials: readonly string[];
    readonly networkExpectation: LocalCiNetworkExpectationV3;
}
export interface LocalCiEffectsV3 {
    readonly credentialsAccess: boolean;
    readonly networkProviderAccess: boolean;
    readonly providerSpend: boolean;
    readonly externalMutation: boolean;
    readonly registrationMutation: boolean;
    readonly schedulesMutation: boolean;
    readonly deploymentMutation: boolean;
    readonly consumerBindingMutation: boolean;
    readonly servingAuthorityMutation: boolean;
}
/** Platforms that can bind a required validation leg (repo-template#417). */
export type LocalCiPlatformLegPlatformV3 = "linux" | "win32" | "darwin";
/**
 * Declares a merge-blocking validation leg that must be proven on a specific
 * executor platform. Optional on LocalCiContractV3; absent means no platform-
 * bound required legs (legacy default-only consumers).
 */
export interface LocalCiRequiredPlatformLegV3 {
    readonly legId: string;
    readonly platform: LocalCiPlatformLegPlatformV3;
    /** Command id from `commands` that this leg exercises (must exist). */
    readonly commandId: string;
}
/**
 * Typed receipt proving a required platform leg ran on the declared platform.
 * Executor placement/dispatch is owned outside this contract (code validation
 * coverage / FCP / FHR — see linked owner from repo-template#417).
 */
export interface LocalCiPlatformLegReceiptV3 {
    readonly schema: "LocalCiPlatformLegReceiptV3";
    readonly legId: string;
    readonly platform: LocalCiPlatformLegPlatformV3;
    readonly commandId: string;
    readonly evaluatedAt: string;
    readonly executorKind?: string;
    readonly hostId?: string;
}
export interface LocalCiPlatformLegVerdictV3 {
    readonly ok: boolean;
    readonly requiredCount: number;
    readonly satisfiedCount: number;
    readonly missingLegs: readonly LocalCiRequiredPlatformLegV3[];
    readonly detail: string;
}
export interface LocalCiContractV3 {
    readonly schemaId: typeof LOCAL_CI_CONTRACT_V3_SCHEMA_ID;
    readonly schemaVersion: typeof LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION;
    readonly contractId: typeof LOCAL_CI_CONTRACT_V3_ID;
    readonly repository: string;
    readonly canonicalBranch: string;
    readonly commands: Readonly<Record<string, LocalCiCommandV3>>;
    readonly environment: LocalCiEnvironmentV3;
    readonly effects: LocalCiEffectsV3;
    /** Optional platform-bound required legs (repo-template#417). */
    readonly requiredPlatformLegs?: readonly LocalCiRequiredPlatformLegV3[];
    /** Fleet PR-validation overlay (see local-ci-contract-v3-overlay.ts). */
    readonly prMergeProfileId?: string;
    readonly prBroaderFallback?: boolean;
    readonly prReceiptBindsCandidate?: boolean;
    readonly prReceiptBindsBase?: boolean;
    readonly prReceiptBindsIntegration?: boolean;
    readonly prReceipt?: LocalCiPrReceiptBindingV3;
    readonly fullRequiredLegIds?: readonly string[];
    readonly simpleDiff?: Readonly<Record<string, LocalCiSimpleDiffClassV3>>;
}
export type LegacyLineageKindV3 = LegacyLineageKind | "local-ci-v2";
export interface LegacyLocalCiDispositionV3 {
    readonly disposition: "valid-v3" | "migrated" | "rejected";
    readonly legacyLineage: LegacyLineageKindV3;
    readonly sourceBlobSha256: string;
    readonly reasonCode?: string;
    readonly commandsMissingDetectionProof?: readonly string[];
    readonly contract?: LocalCiContractV3;
    readonly diagnostics?: readonly Diagnostic[];
}
export declare function orderedLocalCiCommandsV3(contract: LocalCiContractV3): readonly OrderedLocalCiCommandV3[];
/**
 * Full-required verdict for platform-bound legs (repo-template#417).
 * Missing or mismatched receipts fail closed — never pass without proof.
 */
export declare function evaluateRequiredPlatformLegsV3(contract: LocalCiContractV3, receipts?: readonly LocalCiPlatformLegReceiptV3[]): LocalCiPlatformLegVerdictV3;
export declare function validateLocalCiContractV3(value: unknown): ValidationResult<LocalCiContractV3>;
export declare function classifyAndMigrateLocalCiV2ToV3(rawInput: unknown, sourceBlob?: Uint8Array | string): LegacyLocalCiDispositionV3;
