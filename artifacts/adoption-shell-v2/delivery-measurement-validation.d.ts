import { type ValidationResult } from "./contract.ts";
import { Diagnostics } from "./validation-helpers.ts";
export declare function finish<T>(value: T, diagnostics: Diagnostics): ValidationResult<T>;
export declare function ref(value: unknown, pointer: string, diagnostics: Diagnostics): value is string;
export declare function oneOf(value: unknown, pointer: string, allowed: readonly string[], diagnostics: Diagnostics): value is string;
export declare function bool(value: unknown, pointer: string, diagnostics: Diagnostics): value is boolean;
export declare function number(value: unknown, pointer: string, diagnostics: Diagnostics, integer?: boolean): value is number;
export declare function exactArray(value: unknown, pointer: string, expected: readonly string[], diagnostics: Diagnostics): void;
export declare function schemaIdentity(value: Record<string, unknown>, id: string, digest: string, diagnostics: Diagnostics): void;
