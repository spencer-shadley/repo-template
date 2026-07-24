import { type BundleReference, type CapabilityBundle, type CapabilityBundleRegistry, type Diagnostic, type PayloadEntry, type ValidationResult } from "./contract.ts";
export declare function validateCapabilityBundleRegistryV2(value: unknown): ValidationResult<CapabilityBundleRegistry>;
export interface CapabilityClosure {
    readonly bundles: readonly CapabilityBundle[];
    readonly diagnostics: readonly Diagnostic[];
}
export declare function resolveCapabilityClosure(registry: CapabilityBundleRegistry, requested: readonly BundleReference[], entries: readonly PayloadEntry[]): CapabilityClosure;
