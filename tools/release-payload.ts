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

function gitTreeAndBlobs(): {
  readonly tree: ReadonlyMap<string, { readonly mode: string; readonly object: string }>;
  readonly blobs: ReadonlyMap<string, Buffer>;
} {
  const rows = execFileSync("git", ["ls-tree", "-rz", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const result = new Map<string, { readonly mode: string; readonly object: string }>();
  for (const row of rows) {
    const match = /^(\d{6}) blob ([0-9a-f]+)\t(.+)$/.exec(row);
    if (!match?.[1] || !match[2] || !match[3]) {
      throw new Error(`unexpected Git tree row: ${row}`);
    }
    result.set(match[3].replaceAll("\\", "/"), {
      mode: match[1],
      object: match[2],
    });
  }
  const objects = [...new Set([...result.values()].map((entry) => entry.object))];
  const output = Buffer.from(
    execFileSync("git", ["cat-file", "--batch"], {
      cwd: root,
      input: `${objects.join("\n")}\n`,
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  const blobs = new Map<string, Buffer>();
  let offset = 0;
  for (const expectedObject of objects) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd < 0) throw new Error("truncated git cat-file batch header");
    const header = output.subarray(offset, headerEnd).toString("ascii");
    const match = /^([0-9a-f]+) blob ([0-9]+)$/.exec(header);
    if (!match?.[1] || !match[2] || match[1] !== expectedObject) {
      throw new Error(`unexpected git cat-file batch header: ${header}`);
    }
    const size = Number(match[2]);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (output[contentEnd] !== 0x0a) {
      throw new Error(`truncated git cat-file batch content: ${expectedObject}`);
    }
    blobs.set(expectedObject, Buffer.from(output.subarray(contentStart, contentEnd)));
    offset = contentEnd + 1;
  }
  if (offset !== output.length) throw new Error("unexpected trailing git cat-file batch output");
  return { tree: result, blobs };
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
  const { tree, blobs } = gitTreeAndBlobs();
  const templateManifestRow = tree.get("template-manifest.json");
  if (!templateManifestRow) throw new Error("HEAD lacks template-manifest.json");
  const templateManifest = JSON.parse(
    blobs.get(templateManifestRow.object)?.toString("utf8") ?? "",
  ) as Record<string, unknown>;
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
    const tracked = tree.get(pathValue);
    const gitMode = tracked?.mode;
    if (!tracked || (gitMode !== "100644" && gitMode !== "100755")) {
      throw new Error(`selected path lacks a regular tracked Git mode: ${pathValue}`);
    }
    const content = blobs.get(tracked.object);
    if (!content) throw new Error(`selected path lacks batched Git bytes: ${pathValue}`);
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
