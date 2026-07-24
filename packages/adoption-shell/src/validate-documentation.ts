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

export function validateDocumentationLinks(
  entries: readonly PayloadEntry[],
): readonly Diagnostic[] {
  const diagnostics = new Diagnostics();
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    if (!entry.path.endsWith(".md") || entry.encoding !== "utf-8") continue;
    let text: string;
    try {
      text = UTF8_DECODER.decode(decodeCanonicalBase64(entry.contentBase64));
    } catch {
      continue;
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
      const label = match[1] ?? "";
      const link = match[2] ?? "";
      if (/^https:\/\//.test(link) || link.startsWith("#")) continue;
      const resolved = resolvePayloadLink(entry.path, link);
      if (resolved === null || !byPath.has(resolved)) {
        diagnostics.add(
          "E_DOC_LINK_MISSING",
          `/entries/${entry.path}`,
          `relative documentation link does not resolve: ${link}`,
        );
        continue;
      }
      if (/^ADR-\d{4}: /.test(label)) {
        const target = byPath.get(resolved);
        if (target?.encoding === "utf-8") {
          const targetText = UTF8_DECODER.decode(
            decodeCanonicalBase64(target.contentBase64),
          );
          const heading = targetText.split(/\r?\n/, 1)[0];
          if (heading !== `# ${label}`) {
            diagnostics.add(
              "E_DOC_ADR_TITLE",
              `/entries/${entry.path}`,
              `linked ADR heading does not match ${label}`,
            );
          }
        }
      }
    }
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
