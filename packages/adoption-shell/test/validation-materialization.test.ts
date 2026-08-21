import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AdoptionShellValidationError,
  canonicalizeJson,
  materializeAdoptionShellV2,
  validateMaterializerInputV2,
  validateMaterializerOutputManifestV2,
  validateDocumentationLinks,
  validateVerificationReceiptV2,
  type Diagnostic,
  type MaterializerInput,
  type PayloadEntry,
  type VerificationReceipt,
} from "../../../artifacts/adoption-shell-v2/index.js";
import {
  portablePathFailure,
  resolvePayloadLink,
} from "../../../artifacts/adoption-shell-v2/path-policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

function diagnosticKey(value: Diagnostic): string {
  return `${value.pointer}\u{0}${value.code}\u{0}${value.message}`;
}

function assertSorted(diagnostics: readonly Diagnostic[]): void {
  assert.deepEqual(
    diagnostics.map(diagnosticKey),
    diagnostics.map(diagnosticKey).toSorted((left, right) => left.localeCompare(right)),
  );
}

void test("valid fixtures materialize deterministically without mutating inputs", () => {
  for (const name of [
    "minimal-input.json",
    "minimal-input-shuffled-keys.json",
    "multi-bundle-input.json",
    "portable-docs-input.json",
    "user-surface-lint-input.json",
  ]) {
    const input = readJson<MaterializerInput>(
      `contracts/adoption-shell-v2/fixtures/${name}`,
    );
    const before = JSON.stringify(input);
    const validation = validateMaterializerInputV2(input);
    assert.equal(validation.ok, true, name);
    const first = materializeAdoptionShellV2(input);
    const second = materializeAdoptionShellV2(JSON.parse(before));
    assert.equal(JSON.stringify(input), before, `${name} input mutated`);
    assert.equal(canonicalizeJson(first), canonicalizeJson(second), name);
    assert.equal(validateMaterializerOutputManifestV2(first.manifest).ok, true);
    assert.equal(first.entries.length, first.manifest.entryCount);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.entries));
    assert.ok(Object.isFrozen(first.manifest));
    assert.ok(first.entries.every(Object.isFrozen));
  }
});

void test("object key order cannot influence output bytes or receipts", () => {
  const ordinary = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/minimal-input.json",
  );
  const shuffled = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/minimal-input-shuffled-keys.json",
  );
  assert.notEqual(JSON.stringify(ordinary), JSON.stringify(shuffled));
  assert.equal(canonicalizeJson(ordinary), canonicalizeJson(shuffled));
  assert.equal(
    canonicalizeJson(materializeAdoptionShellV2(ordinary)),
    canonicalizeJson(materializeAdoptionShellV2(shuffled)),
  );
  const receipt = readJson<VerificationReceipt>(
    "contracts/adoption-shell-v2/golden/deterministic-receipt.json",
  );
  assert.equal(validateVerificationReceiptV2(receipt).ok, true);
  assert.equal(receipt.independentRunCount, 2);
  assert.equal(receipt.result, "verified");
  assert.equal("createdAt" in receipt, false);
  assert.equal("updatedAt" in receipt, false);
});

void test("all committed negative fixtures fail with sorted targeted diagnostics", () => {
  const fixtures = readJson<
    readonly {
      readonly name: string;
      readonly expectedCodes: readonly string[];
      readonly input: unknown;
    }[]
  >("contracts/adoption-shell-v2/fixtures/negative-inputs.json");
  assert.ok(fixtures.length >= 45);
  for (const fixture of fixtures) {
    let diagnostics: readonly Diagnostic[];
    try {
      materializeAdoptionShellV2(fixture.input);
      assert.fail(`${fixture.name} unexpectedly materialized`);
    } catch (error) {
      assert.ok(
        error instanceof AdoptionShellValidationError,
        `${fixture.name}: ${String(error)}`,
      );
      diagnostics = error.diagnostics;
    }
    assertSorted(diagnostics);
    const codes = new Set(diagnostics.map((row) => row.code));
    for (const expected of fixture.expectedCodes) {
      assert.ok(codes.has(expected), `${fixture.name} missing ${expected}`);
    }
  }
});

void test("validators fail closed instead of throwing on non-JSON unknown values", () => {
  const input = readJson<Record<string, unknown>>(
    "contracts/adoption-shell-v2/fixtures/minimal-input.json",
  );
  const release = input["release"] as Record<string, unknown>;
  release["foreign"] = 1n;
  const result = validateMaterializerInputV2(input);
  assert.equal(result.ok, false);
  assertSorted(result.diagnostics);
  assert.ok(result.diagnostics.some((row) => row.code === "E_UNKNOWN_PROPERTY"));
  assert.ok(result.diagnostics.some((row) => row.code === "E_CANONICAL_JSON"));
});

void test("Template release identity stays distinct from output payload identity", () => {
  const input = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/multi-bundle-input.json",
  );
  const result = materializeAdoptionShellV2(input);
  assert.equal(result.manifest.releaseDigest, input.release.releaseDigest);
  assert.equal(
    result.manifest.releasePayloadDigest,
    input.release.payloadDigest,
  );
  assert.notEqual(
    result.manifest.manifestDigest,
    result.manifest.outputPayloadDigest,
  );
  assert.equal("outputRoot" in result.manifest, false);
  assert.equal("invocationReceipt" in result.manifest, false);
  assert.equal("outputTreeDigest" in result.manifest, false);
});

void test("documentation link validation ignores absolute URI schemes", () => {
  const contentBase64 = Buffer.from(
    "[HTTP](http://example.com) [Mail](mailto:dev@example.com) [FTP](ftp://example.com)",
    "utf8",
  ).toString("base64");
  const entries: readonly PayloadEntry[] = [
    {
      path: "docs/guide.md",
      kind: "file",
      mode: "100644",
      contentSha256: "0".repeat(64),
      role: "generic-base-text",
      encoding: "utf-8",
      bundleId: null,
      contentBase64,
    },
  ];

  assert.deepEqual(validateDocumentationLinks(entries), []);
});

void test("compiled path policy remains portable across Windows and relative-doc boundaries", () => {
  for (const [value, expected] of [
    ["docs/guide.md", null],
    ["", "empty"],
    ["C:/work/guide.md", "absolute"],
    [String.raw`docs\guide.md`, "characters"],
    ["docs//guide.md", "segment"],
    ["docs/COM1.txt", "reserved"],
    ["docs/guide.", "trailing"],
  ] as const) {
    assert.equal(portablePathFailure(value), expected, value);
  }

  assert.equal(resolvePayloadLink("docs/guide.md", "#section"), "docs/guide.md");
  assert.equal(resolvePayloadLink("docs/guide.md", "./child.md"), "docs/child.md");
  assert.equal(resolvePayloadLink("docs/guide.md", "../README.md"), "README.md");
  assert.equal(resolvePayloadLink("docs/guide.md", "../../outside.md"), null);
  assert.equal(resolvePayloadLink("docs/guide.md", "https://example.com/guide"), null);
});
