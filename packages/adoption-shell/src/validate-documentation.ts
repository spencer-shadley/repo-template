import type { Diagnostic, PayloadEntry } from "./contract.ts";
import { decodeCanonicalBase64 } from "./digest.ts";
import { resolvePayloadLink } from "./path-policy.ts";
import { compareStrings, Diagnostics } from "./validation-helpers.ts";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

interface MarkdownLink {
  readonly label: string;
  readonly destination: string;
  readonly end: number;
  readonly start: number;
}

function nextMarkdownLink(text: string, start: number): MarkdownLink | null {
  let candidateStart = start;
  while (candidateStart < text.length) {
    const linkStart = text.indexOf("[", candidateStart);
    if (linkStart === -1) return null;
    const labelEnd = text.indexOf("]", linkStart + 1);
    const destinationEnd = labelEnd === -1 || text[labelEnd + 1] !== "("
      ? -1
      : text.indexOf(")", labelEnd + 2);
    if (destinationEnd !== -1) {
      return {
        label: text.slice(linkStart + 1, labelEnd),
        destination: text.slice(labelEnd + 2, destinationEnd),
        end: destinationEnd + 1,
        start: linkStart,
      };
    }
    candidateStart = linkStart + 1;
  }
  return null;
}

function withoutAdrHeadingsOrLinks(text: string): string {
  const withoutHeadings = text.replaceAll(/^# ADR-\d{4}:[^\n]*$/gm, "");
  let result = "";
  let cursor = 0;
  for (let link = nextMarkdownLink(withoutHeadings, cursor); link !== null; link = nextMarkdownLink(withoutHeadings, cursor)) {
    result += withoutHeadings.slice(cursor, link.start);
    if (!/\bADR-\d{4}\b/.test(link.label)) {
      result += withoutHeadings.slice(link.start, link.end);
    }
    cursor = link.end;
  }
  return result + withoutHeadings.slice(cursor);
}

function validateAdrHeadingMatch(
  entryPath: string,
  label: string,
  target: PayloadEntry,
  diagnostics: Diagnostics,
): void {
  if (target.encoding !== "utf-8") return;
  try {
    const targetText = UTF8_DECODER.decode(
      decodeCanonicalBase64(target.contentBase64),
    );
    const heading = targetText.split(/\r?\n/, 1)[0];
    if (heading !== `# ${label}`) {
      diagnostics.add(
        "E_DOC_ADR_TITLE",
        `/entries/${entryPath}`,
        `linked ADR heading does not match ${label}`,
      );
    }
  } catch {
    // Decoding errors are caught elsewhere.
  }
}

function validateDocLinkMatch(
  entryPath: string,
  label: string,
  link: string,
  byPath: Map<string, PayloadEntry>,
  diagnostics: Diagnostics,
): void {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(link) || link.startsWith("#")) return;
  const resolved = resolvePayloadLink(entryPath, link);
  if (resolved === null || !byPath.has(resolved)) {
    diagnostics.add(
      "E_DOC_LINK_MISSING",
      `/entries/${entryPath}`,
      `relative documentation link does not resolve: ${link}`,
    );
    return;
  }
  if (/^ADR-\d{4}: /.test(label)) {
    const target = byPath.get(resolved);
    if (target !== undefined) {
      validateAdrHeadingMatch(entryPath, label, target, diagnostics);
    }
  }
}

function validateSingleDocEntry(
  entry: PayloadEntry,
  byPath: Map<string, PayloadEntry>,
  diagnostics: Diagnostics,
): void {
  if (!entry.path.endsWith(".md") || entry.encoding !== "utf-8") return;
  let text: string;
  try {
    text = UTF8_DECODER.decode(decodeCanonicalBase64(entry.contentBase64));
  } catch {
    return;
  }
  if (/\bADR-\d{4}\b/.test(withoutAdrHeadingsOrLinks(text))) {
    diagnostics.add(
      "E_DOC_BARE_ADR",
      `/entries/${entry.path}`,
      "ADR authority references must link the exact decision title",
    );
  }
  if (text.includes("../agent-orchestrator/")) {
    diagnostics.add(
      "E_DOC_CHECKOUT_LINK",
      `/entries/${entry.path}`,
      "fleet documentation links must not depend on checkout depth",
    );
  }
  let cursor = 0;
  for (let link = nextMarkdownLink(text, cursor); link !== null; link = nextMarkdownLink(text, cursor)) {
    if (link.label !== "" && link.destination !== "" && !/\s/.test(link.destination)) {
      validateDocLinkMatch(entry.path, link.label, link.destination, byPath, diagnostics);
    }
    cursor = link.end;
  }
}

export function validateDocumentationLinks(
  entries: readonly PayloadEntry[],
): readonly Diagnostic[] {
  const diagnostics = new Diagnostics();
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    validateSingleDocEntry(entry, byPath, diagnostics);
  }
  return diagnostics.sorted();
}

export function mergeDiagnostics(
  ...sets: readonly (readonly Diagnostic[])[]
): readonly Diagnostic[] {
  return sets
    .flat()
    .toSorted((left, right) =>
      compareStrings(left.pointer, right.pointer) ||
      compareStrings(left.code, right.code) ||
      compareStrings(left.message, right.message),
    );
}
