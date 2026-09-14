import { type CapabilityBundle, type PayloadEntry } from "./contract.ts";
import type { RepositoryProfile } from "./repository-shape.ts";
import { type ProductOverlayOptions } from "./product-overlay-contract.ts";
export * from "./product-overlay-contract.ts";
export * from "./product-overlay-yaml.ts";
export * from "./product-overlay-validation.ts";
export declare function createProductOverlayContent(profile: RepositoryProfile, options?: ProductOverlayOptions): string;
export declare function createTechnologyRegistryOverlayContent(profile: RepositoryProfile, options?: ProductOverlayOptions): string;
export declare function createComponentRegistryOverlayContent(profile: RepositoryProfile, options?: ProductOverlayOptions): string;
export declare function materializeProductOverlayEntries(profile: RepositoryProfile, options?: ProductOverlayOptions, bundleId?: string | null): readonly PayloadEntry[];
export declare function createProductOverlayBundle(profile: RepositoryProfile, options?: Readonly<{
    id?: string;
    version?: string;
}>): CapabilityBundle;
