import type { Diagnostic, PayloadEntry } from "./contract.ts";
import { decodeCanonicalBase64 } from "./digest.ts";
import { resolvePayloadLink } from "./path-policy.ts";
import { compareStrings, Diagnostics } from "./validation-helpers.ts";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function withoutAdrHeadingsOrLinks(text: string): string {
  return text
    .replace(/^# ADR-\d{4}:[^\n]*$/gm, "")
    .replace(/\[[^\]]*\bADR-\d{4}\b[^\]]*\]\([^)]*\)/g, "");
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
  if (/(?:\.\.\/)+agent-orchestrator\//i.test(text)) {
    diagnostics.add(
      "E_DOC_CHECKOUT_LINK",
      `/entries/${entry.path}`,
      "fleet documentation links must not depend on checkout depth",
    );
  }
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    validateDocLinkMatch(entry.path, match[1] ?? "", match[2] ?? "", byPath, diagnostics);
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
    .sort((left, right) =>
      compareStrings(left.pointer, right.pointer) ||
      compareStrings(left.code, right.code) ||
      compareStrings(left.message, right.message),
    );
}
