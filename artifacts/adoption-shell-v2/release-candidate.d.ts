import { type ReleasePayloadEntryDraftV2, type ReleasePayloadSet, type TemplateReleaseCandidateInput, type TemplateReleaseClosure, type ValidationResult } from "./contract.ts";
export declare function createTemplateReleaseCandidateV1(value: unknown): ValidationResult<TemplateReleaseClosure>;
export declare function isTemplateReleaseCandidateInput(value: unknown): value is TemplateReleaseCandidateInput;
export declare function createReleasePayloadSetV2(value: unknown): ValidationResult<ReleasePayloadSet>;
export declare function isReleasePayloadEntryDraftV2(value: unknown): value is ReleasePayloadEntryDraftV2;
