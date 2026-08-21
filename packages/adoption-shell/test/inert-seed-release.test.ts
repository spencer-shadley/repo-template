import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  materializeAdoptionShellV2,
  validateCapabilityBundleRegistryV2,
  validateMaterializerInputV2,
  validateReleasePayloadSetV2,
  type MaterializerInput,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson(relativePath: string): unknown {
  const value: unknown = JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  );
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

interface SeedSelection {
  readonly entryCount: number;
  readonly entries: readonly { readonly path: string; readonly gitMode: string; readonly contentSha256: string; readonly bytes: number }[];
  readonly excluded: readonly { readonly path: string; readonly reason: string }[];
}

function isSeedSelection(value: unknown): value is SeedSelection {
  const isEntry = (entry: unknown): boolean => isRecord(entry) &&
    typeof entry["path"] === "string" && typeof entry["gitMode"] === "string" &&
    typeof entry["contentSha256"] === "string" && typeof entry["bytes"] === "number";
  const isExcluded = (entry: unknown): boolean => isRecord(entry) &&
    typeof entry["path"] === "string" && typeof entry["reason"] === "string";
  return isRecord(value) && typeof value["entryCount"] === "number" &&
    Array.isArray(value["entries"]) && value["entries"].every(isEntry) &&
    Array.isArray(value["excluded"]) && value["excluded"].every(isExcluded);
}

function readMaterializerInput(relativePath: string): MaterializerInput {
  const result = validateMaterializerInputV2(readJson(relativePath));
  if (!result.ok) throw new Error("fixture must be a materializer input");
  return result.value;
}

void test("released inert seed closes over exactly its selected safe bytes", () => {
  const payloadResult = validateReleasePayloadSetV2(readJson("release/release-payload-set.json"));
  if (!payloadResult.ok) throw new Error("released payload must be valid");
  const payload = payloadResult.value;
  const selection = readJson("release/inert-seed-manifest.json");
  assert.ok(isSeedSelection(selection));
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
  assert.ok(
    selection.excluded
      .filter((_, index) => index !== 0)
      .every((entry) => entry.reason === "requires-portable-document-projection"),
  );
});

void test("released inert seed passes the exact materializer and emits once in memory", () => {
  const payloadResult = validateReleasePayloadSetV2(readJson("release/release-payload-set.json"));
  if (!payloadResult.ok) throw new Error("released payload must be valid");
  const payload = payloadResult.value;
  const capabilitiesResult = validateCapabilityBundleRegistryV2(readJson(
    "contracts/adoption-shell-v2/capability-bundle-registry.json",
  ));
  if (!capabilitiesResult.ok) throw new Error("capability registry must be valid");
  const capabilities = capabilitiesResult.value;
  const fixture = readMaterializerInput(
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
