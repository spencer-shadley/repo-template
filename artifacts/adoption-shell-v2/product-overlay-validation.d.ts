import type { ValidationResult } from "./contract.ts";
import { type ComponentRegistryOverlay, type ProductOverlay, type TechnologyRegistryOverlay } from "./product-overlay-contract.ts";
export declare function validateProductOverlay(value: unknown): ValidationResult<ProductOverlay>;
export declare function validateTechnologyRegistryOverlay(value: unknown): ValidationResult<TechnologyRegistryOverlay>;
export declare function validateComponentRegistryOverlay(value: unknown): ValidationResult<ComponentRegistryOverlay>;
