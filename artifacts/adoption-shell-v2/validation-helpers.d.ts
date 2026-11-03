import type { Diagnostic } from "./contract.ts";
export declare const SHA256_PATTERN: RegExp;
export declare const SEMVER_PATTERN: RegExp;
export declare const BUNDLE_ID_PATTERN: RegExp;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare class Diagnostics {
    readonly rows: Diagnostic[];
    add(code: string, pointer: string, message: string): void;
    object(value: unknown, pointer: string, allowed: readonly string[], required: readonly string[]): value is Record<string, unknown>;
    string(value: unknown, pointer: string, options?: Readonly<{
        min?: number;
        max?: number;
        pattern?: RegExp;
        constant?: string;
    }>): value is string;
    sha(value: unknown, pointer: string): value is string;
    array(value: unknown, pointer: string, min?: number, max?: number): value is unknown[];
    sorted(): readonly Diagnostic[];
}
export declare function escapePointer(value: string): string;
export declare function compareStrings(left: string, right: string): number;
export declare function assertSortedUnique(values: readonly string[], pointer: string, diagnostics: Diagnostics): void;
