/** Portable TODO→GitHub-issue link contract (repo-template#345 / Code#4962). */

export type CoverageStatus = "supported" | "unsupported" | "generated" | "vendor" | "skipped";

export type ViolationReason =
  | "missing-issue-url"
  | "shorthand-only"
  | "non-issue-github-url"
  | "malformed-issue-url";

export interface LanguageClassV1 {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly specialFilenames: readonly string[];
  readonly commentSyntaxes: readonly (
    | "line-hash"
    | "line-slash"
    | "line-dash"
    | "block-c"
    | "block-html"
    | "block-powershell"
  )[];
  readonly extractorId: string;
  readonly coverage: CoverageStatus;
}

export interface CommentSpanV1 {
  readonly text: string;
  readonly line: number;
  readonly column: number;
}

export interface TodoFindingV1 {
  readonly schema: "TodoIssueLinkFindingV1";
  readonly version: 1;
  readonly repository: string | null;
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly languageId: string;
  readonly normalizedCommentText: string;
  readonly violationReason: ViolationReason;
  readonly linkedIssueUrl: string | null;
  readonly extractorId: string;
  readonly coverageStatus: CoverageStatus;
}

export interface TodoScanResultV1 {
  readonly schema: "TodoIssueLinkScanResultV1";
  readonly version: 1;
  readonly mode: "full-tree" | "changed-files";
  readonly ok: boolean;
  readonly findings: readonly TodoFindingV1[];
  readonly unsupportedPaths: readonly { path: string; languageId: string | null }[];
  readonly scannedFileCount: number;
}
