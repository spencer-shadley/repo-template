export type PathFailure = "absolute" | "characters" | "empty" | "length" | "reserved" | "segment" | "trailing";
export declare function portablePathFailure(value: string): PathFailure | null;
export declare function isIssueTemplateOverride(value: string): boolean;
export declare function isPreCustodyWorkflow(value: string): boolean;
export declare function resolvePayloadLink(sourcePath: string, link: string): string | null;
