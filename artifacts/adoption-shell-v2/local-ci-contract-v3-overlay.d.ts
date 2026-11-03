/**
 * Fleet PR-validation overlay fields for LocalCiContractV3.
 *
 * Fleet `local-ci.json` files declare PR-validation metadata (merge profile,
 * broader-gate fallback, receipt identity bindings, full-required legs, and
 * focused `simpleDiff` path classes) beside the core V3 contract. These are
 * optional, but when present each is strictly typed; unknown properties are
 * still rejected.
 */
import { Diagnostics } from "./validation-helpers.ts";
/**
 * Fleet PR-validation receipt binding overlay. Declares which identities a
 * PR-validation receipt must bind (candidate head, base, integration result).
 */
export interface LocalCiPrReceiptBindingV3 {
    readonly bindsCandidate: boolean;
    readonly bindsBase: boolean;
    readonly bindsIntegration: boolean;
}
/** One focused proof command inside a `simpleDiff` class. */
export interface LocalCiSimpleDiffCommandV3 {
    readonly name?: string;
    readonly executable: string;
    readonly args: readonly string[];
    readonly shell?: "pwsh" | "cmd" | "bash" | "sh" | "none";
    readonly cwd?: string;
    readonly timeoutSeconds?: number;
    readonly expectedExitCode?: number;
    readonly failureDisposition?: "fail-gate" | "warning" | "non-routable";
}
/**
 * A repository-owned path class whose changed-path set may be proven by
 * focused commands instead of the full gate (cli-wrappers#225). `full` and
 * `skipped` are reserved gate-class names and may not be declared.
 */
export interface LocalCiSimpleDiffClassV3 {
    readonly paths: readonly string[];
    readonly commands: Readonly<Record<string, LocalCiSimpleDiffCommandV3>>;
    /** Defaults to true; false opts the class out of dependency readiness. */
    readonly requiresDependencies?: boolean;
}
export declare const SHELLS: Set<string>;
export declare const FAILURE_DISPOSITIONS: Set<string>;
export declare const LEG_ID_PATTERN: RegExp;
export declare const COMMAND_ID_PATTERN: RegExp;
export declare function stringArray(value: unknown, pointer: string, min: number, max: number, diagnostics: Diagnostics): void;
/**
 * Validates the fleet PR-validation overlay fields that sit beside the core
 * V3 contract. Each field is optional but, when present, strictly typed.
 */
export declare function validateFleetOverlayV3(record: Record<string, unknown>, diagnostics: Diagnostics): void;
export declare const LOCAL_CI_CONTRACT_V3_FLEET_OVERLAY_FIELDS: readonly ["prMergeProfileId", "prBroaderFallback", "prReceiptBindsCandidate", "prReceiptBindsBase", "prReceiptBindsIntegration", "prReceipt", "fullRequiredLegIds", "simpleDiff"];
