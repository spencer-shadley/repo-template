import { type Diagnostic, type ValidationResult } from "./contract.ts";
export declare const LOCAL_CI_CONTRACT_V2_ID: "repo-template/local-ci-v2";
export declare const LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION: "2.0.0";
export declare const LOCAL_CI_CONTRACT_V2_SCHEMA_ID: "https://schemas.repo-template.dev/local-ci-v2/local-ci-contract-v2.schema.json";
export type LocalCiShell = "pwsh" | "cmd" | "bash" | "sh" | "none";
export type LocalCiFailureDisposition = "fail-gate" | "warning" | "non-routable";
export type LocalCiNetworkExpectation = "offline-only" | "local-loopback" | "outbound-allowed";
export interface LocalCiCommandV2 {
    readonly name: string;
    readonly executable: string;
    readonly args: readonly string[];
    readonly shell: LocalCiShell;
    readonly cwd: string;
    readonly timeoutSeconds: number;
    readonly expectedExitCode: number;
    readonly failureDisposition: LocalCiFailureDisposition;
}
export interface OrderedLocalCiCommandV2 extends LocalCiCommandV2 {
    readonly id: string;
    readonly order: number;
    readonly isAuthoritativeGate: boolean;
}
export interface LocalCiRuntimeConstraint {
    readonly name: string;
    readonly versionConstraint: string;
}
export interface LocalCiPackageManagerConstraint {
    readonly name: string;
    readonly version: string;
}
export interface LocalCiEnvironmentV2 {
    readonly runtime: LocalCiRuntimeConstraint;
    readonly packageManager: LocalCiPackageManagerConstraint;
    readonly supportedPlatforms: readonly string[];
    readonly supportedArchitectures: readonly string[];
    readonly requiredEnvVars: readonly string[];
    readonly requiredCredentials: readonly string[];
    readonly networkExpectation: LocalCiNetworkExpectation;
}
export interface LocalCiEffectsV2 {
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
export interface LocalCiContractV2 {
    readonly schemaId: typeof LOCAL_CI_CONTRACT_V2_SCHEMA_ID;
    readonly schemaVersion: typeof LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION;
    readonly contractId: typeof LOCAL_CI_CONTRACT_V2_ID;
    readonly repository: string;
    readonly canonicalBranch: string;
    readonly commands: Readonly<Record<string, LocalCiCommandV2>>;
    readonly environment: LocalCiEnvironmentV2;
    readonly effects: LocalCiEffectsV2;
}
export type LegacyLineageKind = "model-gateway-v1" | "repo-factory-v1" | "none" | "unknown";
export interface LegacyLocalCiDisposition {
    readonly disposition: "valid-v2" | "migrated" | "rejected";
    readonly legacyLineage: LegacyLineageKind;
    readonly sourceBlobSha256: string;
    readonly reasonCode?: string;
    readonly contract?: LocalCiContractV2;
    readonly diagnostics?: readonly Diagnostic[];
}
export declare function orderedLocalCiCommands(contract: LocalCiContractV2): readonly OrderedLocalCiCommandV2[];
export declare function validateLocalCiContractV2(value: unknown): ValidationResult<LocalCiContractV2>;
export declare function classifyAndMigrateLegacyLocalCiV1(rawInput: unknown, sourceBlob?: Uint8Array | string): LegacyLocalCiDisposition;
