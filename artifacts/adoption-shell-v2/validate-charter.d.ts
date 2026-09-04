export type CharterValidationMode = "template-source" | "materialized-repository";
export interface CharterValidationResult {
    valid: boolean;
    errors: string[];
}
export declare const portableCharterHeadings: readonly ["Mission", "Responsibilities", "Non-responsibilities"];
export declare function validateCharter(text: string, mode: CharterValidationMode): CharterValidationResult;
