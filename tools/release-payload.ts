import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createReleasePayloadSetV2,
  sha256CanonicalJson,
  type ReleasePayloadEntryDraftV2,
  type ReleasePayloadSet,
} from "../artifacts/adoption-shell-v2/index.js";
import {
  isIssueTemplateOverride,
  isPreCustodyWorkflow,
  portablePathFailure,
} from "../artifacts/adoption-shell-v2/path-policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Generated release output. Both files are gitignored build artifacts computed from the source
// tree at release time (Code DOCTRINE §38); they are never committed to the default branch.
const selectionRelativePath = "release/inert-seed-manifest.json";
const payloadRelativePath = "release/release-payload-set.json";
type TemplateMode = "copy" | "merge";

function isTemplateMode(value: unknown): value is TemplateMode {
  return value === "copy" || value === "merge";
}

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

interface GitTreeEntry {
  readonly mode: string;
  readonly object: string;
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

/** Sentinel ref: enumerate tracked paths from the index and read bytes from the working tree. */
export const WORKTREE_REF = "--worktree";

function worktreeTreeAndBlobs(): {
  readonly tree: ReadonlyMap<string, GitTreeEntry>;
  readonly blobs: ReadonlyMap<string, Buffer>;
} {
  const rows = execFileSync("git", ["ls-files", "-s", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const tree = new Map<string, GitTreeEntry>();
  const blobs = new Map<string, Buffer>();
  for (const row of rows) {
    const match = /^(\d{6}) [0-9a-f]+ 0\t(.+)$/.exec(row);
    if (!match?.[1] || !match[2]) throw new Error(`unexpected Git index row: ${row}`);
    const pathValue = match[2].replaceAll("\\", "/");
    const absolute = path.join(root, ...pathValue.split("/"));
    // Index entries deleted from disk are skipped; selection then reports them missing.
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    tree.set(pathValue, { mode: match[1], object: `worktree:${pathValue}` });
    blobs.set(`worktree:${pathValue}`, fs.readFileSync(absolute));
  }
  return { tree, blobs };
}

function gitTreeAndBlobs(ref: string): {
  readonly tree: ReadonlyMap<string, GitTreeEntry>;
  readonly blobs: ReadonlyMap<string, Buffer>;
} {
  if (ref === WORKTREE_REF) return worktreeTreeAndBlobs();
  const rows = execFileSync("git", ["ls-tree", "-rz", ref], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  const result = new Map<string, GitTreeEntry>();
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

interface ProcessContext {
  readonly tree: ReadonlyMap<string, GitTreeEntry>;
  readonly blobs: ReadonlyMap<string, Buffer>;
  readonly inventory: InventoryRow[];
  readonly excluded: ExcludedRow[];
  readonly drafts: ReleasePayloadEntryDraftV2[];
}

function processManifestEntry(
  pathValue: string,
  rawMode: unknown,
  ctx: ProcessContext,
): void {
  if (!isTemplateMode(rawMode)) return;
  const templateMode = rawMode;
  const reason = classifyExcluded(pathValue);
  if (reason !== null) {
    ctx.excluded.push({ path: pathValue, templateMode, reason });
    return;
  }
  const portableFailure = portablePathFailure(pathValue);
  if (portableFailure !== null) {
    throw new Error(`portable template path rejected (${portableFailure}): ${pathValue}`);
  }
  const tracked = ctx.tree.get(pathValue);
  const gitMode = tracked?.mode;
  if (!tracked || (gitMode !== "100644" && gitMode !== "100755")) {
    throw new Error(`selected path lacks a regular tracked Git mode: ${pathValue}`);
  }
  const content = ctx.blobs.get(tracked.object);
  if (!content) throw new Error(`selected path lacks batched Git bytes: ${pathValue}`);
  const contentSha256 = createHash("sha256").update(content).digest("hex");
  const encoding = content.includes(0) ? "binary" : "utf-8";
  ctx.inventory.push({
    path: pathValue,
    templateMode,
    gitMode,
    contentSha256,
    bytes: content.byteLength,
  });
  ctx.drafts.push({
    path: pathValue,
    kind: "file",
    mode: gitMode,
    role: encoding === "binary" ? "generic-base-binary" : "generic-base-text",
    encoding,
    bundleId: null,
    contentBase64: content.toString("base64"),
  });
}

function buildSelectionBody(
  inventory: InventoryRow[],
  excluded: ExcludedRow[],
): Record<string, unknown> {
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
    ...selectionBody,
    manifestDigest: sha256CanonicalJson(selectionBody),
  };
}

/**
 * Enumerate the release payload from the git tree of `ref` -- every byte comes
 * from the object database for that exact commit-ish, never from the working
 * tree and never from a moving `HEAD` unless `HEAD` is what the caller asked
 * for. repo-template#340: the frozen-candidate receipt must describe the tree
 * it names, so its producer passes the frozen candidate commit here. A later
 * commit on top of the candidate therefore cannot change the frozen digests.
 */
export function constructReleasePayloadAt(ref: string): {
  readonly selection: Record<string, unknown>;
  readonly payload: ReleasePayloadSet;
} {
  const { tree, blobs } = gitTreeAndBlobs(ref);
  const templateManifestRow = tree.get("template-manifest.json");
  if (!templateManifestRow) throw new Error(`${ref} lacks template-manifest.json`);
  const templateManifest: unknown = JSON.parse(
    blobs.get(templateManifestRow.object)?.toString("utf8") ?? "",
  );
  if (templateManifest === null || typeof templateManifest !== "object" || Array.isArray(templateManifest)) {
    throw new Error("template-manifest.json must contain an object");
  }
  const inventory: InventoryRow[] = [];
  const excluded: ExcludedRow[] = [];
  const drafts: ReleasePayloadEntryDraftV2[] = [];
  const ctx: ProcessContext = { tree, blobs, inventory, excluded, drafts };

  for (const [pathValue, rawMode] of Object.entries(templateManifest).sort(([left], [right]) =>
    compare(left, right),
  )) {
    processManifestEntry(pathValue, rawMode, ctx);
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
  return {
    selection: buildSelectionBody(inventory, excluded),
    payload: payloadResult.value,
  };
}

function serialized(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseRef(argv: readonly string[]): string | undefined {
  const refFlagIndex = argv.indexOf("--ref");
  if (refFlagIndex === -1) return undefined;
  const refArgument = argv[refFlagIndex + 1];
  if (refArgument === undefined || refArgument.startsWith("--")) {
    throw new Error("--ref requires a commit-ish argument");
  }
  return refArgument;
}

function parseOutDir(argv: readonly string[]): string {
  const outFlagIndex = argv.indexOf("--out");
  if (outFlagIndex === -1) return root;
  const outArgument = argv[outFlagIndex + 1];
  if (outArgument === undefined || outArgument.startsWith("--")) {
    throw new Error("--out requires a directory argument");
  }
  return path.resolve(outArgument);
}

/**
 * `check` validates the live invariants over the source tree (path policy, explicit exclusions,
 * closed v2 payload schema, materializer-acceptable entries) by constructing the payload; it
 * compares against no committed snapshot. `write` is the release step: it emits the two
 * gitignored release files for the tag being cut.
 */
function main(): void {
  const mode = process.argv[2];
  if (mode !== "write" && mode !== "check") {
    throw new Error(
      "usage: node tools/release-payload.ts <write|check> [--ref <commit-ish>] [--out <dir>]",
    );
  }
  const candidate = constructReleasePayloadAt(parseRef(process.argv) ?? WORKTREE_REF);
  if (mode === "check") return;
  const outDir = parseOutDir(process.argv);
  for (const [relativePath, value] of [
    [selectionRelativePath, candidate.selection],
    [payloadRelativePath, candidate.payload],
  ] as const) {
    const target = path.join(outDir, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialized(value), "utf8");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
