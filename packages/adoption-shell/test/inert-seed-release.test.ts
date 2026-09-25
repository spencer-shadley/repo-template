import assert from "node:assert/strict";
import crypto from "node:crypto";
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
import { isIssueTemplateOverride } from "../../../artifacts/adoption-shell-v2/path-policy.js";

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
  assert.ok(
    selection.excluded.every((entry) => entry.reason === "requires-portable-document-projection"),
  );
  assert.ok(
    selection.entries.every((entry) => !isIssueTemplateOverride(entry.path)),
  );
  assert.ok(
    selection.excluded.every((entry) => !isIssueTemplateOverride(entry.path)),
  );
});

void test("path policy still classifies local issue-template overrides", () => {
  assert.equal(isIssueTemplateOverride(".github/ISSUE_TEMPLATE/task.md"), true);
  assert.equal(isIssueTemplateOverride(".GITHUB/issue_template/task.md"), true);
  assert.equal(isIssueTemplateOverride(".github/Issue_Template/config.yml"), true);
  assert.equal(isIssueTemplateOverride(".github/pull_request_template.md"), false);
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

void test("released inert seed includes validation skills with exact content closure", () => {
  const payloadResult = validateReleasePayloadSetV2(readJson("release/release-payload-set.json"));
  if (!payloadResult.ok) throw new Error("released payload must be valid");
  const payload = payloadResult.value;
  const selection = readJson("release/inert-seed-manifest.json");
  if (!isSeedSelection(selection)) throw new Error("released inert seed selection must be valid");

  const validationSkillPaths = [
    "skills/pr-validation/SKILL.md",
    "skills/full-validation/SKILL.md",
  ] as const;

  for (const skillPath of validationSkillPaths) {
    const selectionEntry: SeedSelection["entries"][number] | undefined =
      selection.entries.find((entry) => entry.path === skillPath);
    assert.ok(selectionEntry, `inert-seed manifest must include ${skillPath}`);
    assert.equal(selectionEntry.gitMode, "100644");

    const payloadEntry = payload.entries.find((e) => e.path === skillPath);
    assert.ok(payloadEntry, `release-payload-set must include ${skillPath}`);
    assert.equal(payloadEntry.kind, "file");
    assert.equal(payloadEntry.mode, "100644");

    const diskContent = fs.readFileSync(path.join(root, ...skillPath.split("/")));
    const diskSha256 = crypto.createHash("sha256").update(diskContent).digest("hex");

    assert.equal(selectionEntry.contentSha256, diskSha256);
    assert.equal(selectionEntry.bytes, diskContent.byteLength);
    assert.equal(payloadEntry.contentSha256, diskSha256);
    assert.deepEqual(Buffer.from(payloadEntry.contentBase64, "base64"), diskContent);
  }
});

void test("materialized inert seed delivers both validation skills into adopted repo", () => {
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
  const result = materializeAdoptionShellV2(input);

  for (const skillPath of ["skills/pr-validation/SKILL.md", "skills/full-validation/SKILL.md"]) {
    const materialized = result.entries.find((e) => e.path === skillPath);
    assert.ok(materialized, `materialized output must include ${skillPath}`);
    const diskContent = fs.readFileSync(path.join(root, ...skillPath.split("/")));
    const diskSha256 = crypto.createHash("sha256").update(diskContent).digest("hex");
    assert.equal(materialized.contentSha256, diskSha256);
    assert.deepEqual(Buffer.from(materialized.contentBase64, "base64"), diskContent);
  }
});

void test("inert seed release payload fails closed if validation skill is omitted or tampered", () => {
  const payloadResult = validateReleasePayloadSetV2(readJson("release/release-payload-set.json"));
  if (!payloadResult.ok) throw new Error("released payload must be valid");
  const payload = payloadResult.value;

  // Negative 1: omitting validation skill entry
  const omitted = {
    ...payload,
    entryCount: payload.entryCount - 1,
    entries: payload.entries.filter((e) => e.path !== "skills/pr-validation/SKILL.md"),
  };
  const omittedResult = validateReleasePayloadSetV2(omitted);
  assert.equal(omittedResult.ok, false);

  // Negative 2: tampered bytes
  const tampered = {
    ...payload,
    entries: payload.entries.map((e) =>
      e.path === "skills/pr-validation/SKILL.md"
        ? { ...e, contentSha256: "0".repeat(64) }
        : e,
    ),
  };
  const tamperedResult = validateReleasePayloadSetV2(tampered);
  assert.equal(tamperedResult.ok, false);
});

