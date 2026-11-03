import type { Diagnostic, PayloadEntry } from "./contract.ts";
export declare function validateDocumentationLinks(entries: readonly PayloadEntry[]): readonly Diagnostic[];
export declare function mergeDiagnostics(...sets: readonly (readonly Diagnostic[])[]): readonly Diagnostic[];
