import type { ViolationReason } from "./types.ts";

const ISSUE_URL_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/i;

const NON_ISSUE_GITHUB_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(pull|commit|discussions)\//i;

const DIRECTIVE_RE =
  /^\s*TODO(?:\s*\(([^)]*)\))?\s*(?:[:\-–—]\s*|\s+)(.*)$/i;

export interface DirectiveParse {
  readonly isDirective: boolean;
  readonly paren: string | null;
  readonly rest: string;
  readonly normalized: string;
}

/** Normalize block-comment decoration and leading whitespace on a logical comment line. */
export function normalizeCommentLogicalLine(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
    .join(" ")
    .trim();
}

export function parseTodoDirective(normalized: string): DirectiveParse {
  const match = DIRECTIVE_RE.exec(normalized);
  if (!match) {
    return { isDirective: false, paren: null, rest: "", normalized };
  }
  return {
    isDirective: true,
    paren: match[1]?.trim() || null,
    rest: (match[2] || "").trim(),
    normalized,
  };
}

export function classifyDirective(parsed: DirectiveParse): {
  ok: boolean;
  reason: ViolationReason | null;
  linkedIssueUrl: string | null;
} {
  if (!parsed.isDirective) {
    return { ok: true, reason: null, linkedIssueUrl: null };
  }
  const candidates = [parsed.paren, parsed.rest]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .flatMap((value) => value.split(/\s+/));

  const urls = candidates.filter((token) => /^https?:\/\//i.test(token));
  if (urls.length === 0) {
    const shorthand =
      /\bgh#/i.test(parsed.normalized) ||
      /\bgh\s+issue\b/i.test(parsed.normalized) ||
      /\bissue\s*#/i.test(parsed.normalized) ||
      /\bgithub\.com\//i.test(parsed.normalized);
    return {
      ok: false,
      reason: shorthand ? "shorthand-only" : "missing-issue-url",
      linkedIssueUrl: null,
    };
  }

  for (const url of urls) {
    const cleaned = url.replace(/[).,;]+$/g, "");
    if (ISSUE_URL_RE.test(cleaned)) {
      return { ok: true, reason: null, linkedIssueUrl: cleaned };
    }
    if (NON_ISSUE_GITHUB_RE.test(cleaned)) {
      return { ok: false, reason: "non-issue-github-url", linkedIssueUrl: cleaned };
    }
  }
  return { ok: false, reason: "malformed-issue-url", linkedIssueUrl: urls[0] || null };
}

/** Full GitHub issues URL required (closes historical fail-open substring forms). */
export function hasFullGithubIssueUrl(text: string): boolean {
  return /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*/i.test(text);
}
