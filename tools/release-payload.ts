import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createReleasePayloadSetV2,
  sha256CanonicalJson,
  type ReleasePayloadEntryDraftV2,
} from "../artifacts/adoption-shell-v2/index.js";
import {
  isIssueTemplateOverride,
  isPreCustodyWorkflow,
  portablePathFailure,
} from "../artifacts/adoption-shell-v2/path-policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selectionPath = path.join(root, "release", "inert-seed-manifest.json");
const payloadPath = path.join(root, "release", "release-payload-set.json");
const portableModes = new Set(["copy", "merge"]);

type TemplateMode = "copy" | "merge";

interface InventoryRow {
  readonly path: string;
  readonly templateMode: TemplateMode;
  readonly gitMode: "100644" | "100755";
  readonly contentSha256: string;
  readonly bytes: number;
}

interface ExcludedRow {
  readonly path: string;
  readonly templateMode: TemplateMode;
  readonly reason:
    | "no-local-issue-template-override"
    | "no-pre-custody-workflow"
    | "requires-portable-document-projection";
}

const portableProjectionRequired = new Set([
  ".github/pull_request_template.md",
  ".ops/README.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "GEMINI.md",
  "PRIORITIES.md",
  "docs/RUNBOOK.md",
]);

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")) as Record<
    string,
    unknown
  >;
}

function gitModes(): ReadonlyMap<string, string> {
  const rows = execFileSync("git", ["ls-files", "--stage", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const result = new Map<string, string>();
  for (const row of rows) {
    const match = /^(\d{6}) [0-9a-f]+ \d+\t(.+)$/.exec(row);
    if (!match?.[1] || !match[2]) throw new Error(`unexpected git index row: ${row}`);
    result.set(match[2].replaceAll("\\", "/"), match[1]);
  }
  return result;
}

function classifyExcluded(pathValue: string): ExcludedRow["reason"] | null {
  if (isIssueTemplateOverride(pathValue)) {
    return "no-local-issue-template-override";
  }
  if (isPreCustodyWorkflow(pathValue)) {
    return "no-pre-custody-workflow";
  }
  if (portableProjectionRequired.has(pathValue)) {
    return "requires-portable-document-projection";
  }
  return null;
}

function construct(): {
  readonly selection: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
} {
  const templateManifest = readJson("template-manifest.json");
  const modes = gitModes();
  const inventory: InventoryRow[] = [];
  const excluded: ExcludedRow[] = [];
  const drafts: ReleasePayloadEntryDraftV2[] = [];

  for (const [pathValue, rawMode] of Object.entries(templateManifest).sort(([left], [right]) =>
    compare(left, right),
  )) {
    if (!portableModes.has(String(rawMode))) continue;
    const templateMode = rawMode as TemplateMode;
    const reason = classifyExcluded(pathValue);
    if (reason !== null) {
      excluded.push({ path: pathValue, templateMode, reason });
      continue;
    }
    const portableFailure = portablePathFailure(pathValue);
    if (portableFailure !== null) {
      throw new Error(`portable template path rejected (${portableFailure}): ${pathValue}`);
    }
    const gitMode = modes.get(pathValue);
    if (gitMode !== "100644" && gitMode !== "100755") {
      throw new Error(`selected path lacks a regular tracked Git mode: ${pathValue}`);
    }
    const content = fs.readFileSync(path.join(root, ...pathValue.split("/")));
    const contentSha256 = createHash("sha256").update(content).digest("hex");
    const encoding = content.includes(0) ? "binary" : "utf-8";
    inventory.push({
      path: pathValue,
      templateMode,
      gitMode,
      contentSha256,
      bytes: content.byteLength,
    });
    drafts.push({
      path: pathValue,
      kind: "file",
      mode: gitMode,
      role: encoding === "binary" ? "generic-base-binary" : "generic-base-text",
      encoding,
      bundleId: null,
      contentBase64: content.toString("base64"),
    });
  }

  if (inventory.length === 0 || excluded.length === 0) {
    throw new Error("inert seed must contain selected bytes and explicit exclusions");
  }
  const payloadResult = createReleasePayloadSetV2(drafts);
  if (!payloadResult.ok) {
    throw new Error(
      payloadResult.diagnostics
        .map((row) => `${row.code} ${row.pointer} ${row.message}`)
        .join("\n"),
    );
  }
  const selectionBody = {
    contractId: "repo-template/inert-seed-manifest/v1",
    schemaVersion: 1,
    purpose: "inert-pre-custody-seed",
    payloadSetPath: "release/release-payload-set.json",
    inventoryDigestAlgorithm: "sha256-rfc8785-v1",
    inventoryDigest: sha256CanonicalJson({ entries: inventory }),
    entryCount: inventory.length,
    excludedCount: excluded.length,
    entries: inventory,
    excluded,
  };
  return {
    selection: {
      ...selectionBody,
      manifestDigest: sha256CanonicalJson(selectionBody),
    },
    payload: payloadResult.value as unknown as Record<string, unknown>,
  };
}

function serialized(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== "write" && mode !== "check") {
    throw new Error("usage: node tools/release-payload.ts <write|check>");
  }
  const candidate = construct();
  if (mode === "write") {
    fs.mkdirSync(path.dirname(selectionPath), { recursive: true });
    fs.writeFileSync(selectionPath, serialized(candidate.selection), "utf8");
    fs.writeFileSync(payloadPath, serialized(candidate.payload), "utf8");
    return;
  }
  for (const [filePath, expected] of [
    [selectionPath, candidate.selection],
    [payloadPath, candidate.payload],
  ] as const) {
    if (!fs.existsSync(filePath)) throw new Error(`release artifact missing: ${filePath}`);
    if (fs.readFileSync(filePath, "utf8") !== serialized(expected)) {
      throw new Error(`release artifact is not reproducible: ${filePath}`);
    }
  }
}

main();
