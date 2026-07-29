import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  materializeAdoptionShellV2,
  validateMaterializerInputV2,
  validateReleasePayloadSetV2,
  type CapabilityBundleRegistry,
  type MaterializerInput,
  type ReleasePayloadSet,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

test("released inert seed closes over exactly its selected safe bytes", () => {
  const payload = readJson<ReleasePayloadSet>("release/release-payload-set.json");
  const selection = readJson<{
    readonly entryCount: number;
    readonly entries: readonly {
      readonly path: string;
      readonly gitMode: string;
      readonly contentSha256: string;
      readonly bytes: number;
    }[];
    readonly excluded: readonly { readonly path: string; readonly reason: string }[];
  }>("release/inert-seed-manifest.json");
  assert.equal(validateReleasePayloadSetV2(payload).ok, true);
  assert.equal(selection.entryCount, payload.entryCount);
  assert.deepEqual(
    selection.entries.map((entry) => entry.path),
    payload.entries.map((entry) => entry.path),
  );
  for (const [index, row] of selection.entries.entries()) {
    const entry = payload.entries[index];
    assert.ok(entry);
    const content = fs.readFileSync(path.join(root, ...row.path.split("/")));
    assert.equal(row.gitMode, entry.mode);
    assert.equal(row.contentSha256, entry.contentSha256);
    assert.equal(row.bytes, content.byteLength);
    assert.deepEqual(Buffer.from(entry.contentBase64, "base64"), content);
  }
  assert.deepEqual(
    selection.excluded.map((entry) => entry.path),
    [
      ".github/ISSUE_TEMPLATE/task.md",
      ".github/pull_request_template.md",
      ".github/workflows/ci.yml",
      ".ops/README.md",
      "AGENTS.md",
      "CHANGELOG.md",
      "CLAUDE.md",
      "GEMINI.md",
      "PRIORITIES.md",
      "docs/RUNBOOK.md",
    ],
  );
  assert.equal(selection.excluded[0]?.reason, "no-local-issue-template-override");
  assert.equal(selection.excluded[2]?.reason, "no-pre-custody-workflow");
  assert.ok(
    selection.excluded
      .filter((_, index) => index !== 0 && index !== 2)
      .every((entry) => entry.reason === "requires-portable-document-projection"),
  );
});

test("released inert seed passes the exact materializer and emits once in memory", () => {
  const payload = readJson<ReleasePayloadSet>("release/release-payload-set.json");
  const capabilities = readJson<CapabilityBundleRegistry>(
    "contracts/adoption-shell-v2/capability-bundle-registry.json",
  );
  const fixture = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/minimal-input.json",
  );
  const input: MaterializerInput = {
    ...fixture,
    release: payload,
    capabilities,
    requestedBundles: [],
  };
  assert.equal(validateMaterializerInputV2(input).ok, true);
  const result = materializeAdoptionShellV2(input);
  assert.equal(result.entries.length, payload.entryCount);
  assert.equal(result.manifest.releaseDigest, payload.releaseDigest);
  assert.equal(result.manifest.releasePayloadDigest, payload.payloadDigest);
});
