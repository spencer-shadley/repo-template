export { LANGUAGE_REGISTRY, resolveLanguageClass } from "./registry.ts";
export { extractComments } from "./extractors.ts";
export {
  classifyDirective,
  hasFullGithubIssueUrl,
  normalizeCommentLogicalLine,
  parseTodoDirective,
} from "./classify.ts";
export { scanTodoIssueLinks } from "./scan.ts";
export type {
  CommentSpanV1,
  CoverageStatus,
  LanguageClassV1,
  TodoFindingV1,
  TodoScanResultV1,
  ViolationReason,
} from "./types.ts";
