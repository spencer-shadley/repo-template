import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  canonicalizeJson,
  decodeCanonicalBase64,
  payloadFrame,
  sha256Bytes,
  sha256CanonicalJson,
  sha256PayloadEntries,
  validateMaterializerInputV2,
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

function isRfcGolden(value: unknown): value is {
  readonly vectors: readonly { readonly name: string; readonly input: unknown; readonly canonical: string }[];
} {
  return isRecord(value) && Array.isArray(value["vectors"]) && value["vectors"].every(
    (row) => isRecord(row) && typeof row["name"] === "string" && typeof row["canonical"] === "string",
  );
}

function isDigestGolden(value: unknown): value is Record<
  "envelopeAlgorithm" | "canonical" | "canonicalSha256" | "payloadAlgorithm" | "payloadSha256" | "firstEntryContentSha256",
  string
> {
  return isRecord(value) && [
    "envelopeAlgorithm", "canonical", "canonicalSha256", "payloadAlgorithm", "payloadSha256", "firstEntryContentSha256",
  ].every((field) => typeof value[field] === "string");
}

function readMaterializerInput(relativePath: string) {
  const result = validateMaterializerInputV2(readJson(relativePath));
  if (!result.ok) throw new Error("fixture must be a materializer input");
  return result.value;
}

void test("RFC 8785 published vectors and key ordering are exact", () => {
  const golden = readJson(
    "contracts/adoption-shell-v2/golden/rfc8785-vectors.json",
  );
  assert.ok(isRfcGolden(golden));
  for (const vector of golden.vectors) {
    assert.equal(canonicalizeJson(vector.input), vector.canonical, vector.name);
  }
  assert.equal(canonicalizeJson(-0), "0");
  assert.equal(canonicalizeJson(1e-7), "1e-7");
  assert.equal(canonicalizeJson(1e-6), "0.000001");
  assert.equal(canonicalizeJson({ "\u{FFFD}": 1, "😀": 2 }), "{\"😀\":2,\"\u{FFFD}\":1}");
});

void test("RFC 8785 rejects values outside its JSON domain", () => {
  for (const value of [NaN, Infinity, 1n, undefined]) {
    assert.throws(() => canonicalizeJson(value));
  }
  assert.throws(() => canonicalizeJson("\u{D800}"), /lone surrogates/);
  const sparse: unknown[] = [];
  sparse.length = 1;
  assert.throws(() => canonicalizeJson(sparse), /sparse arrays/);
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalizeJson(cyclic), /cyclic values/);
  assert.throws(() => canonicalizeJson(new Map()), /plain objects/);
});

void test("canonical base64 decoder rejects alternate spellings", () => {
  assert.deepEqual([...decodeCanonicalBase64("TWE=")], [0x4d, 0x61]);
  for (const value of ["TWE", "TWE==", "TR==", "TWE=\n"]) {
    assert.throws(() => decodeCanonicalBase64(value), /canonical padded base64/);
  }
});

void test("both named SHA-256 algorithms match committed goldens", () => {
  const golden = readJson(
    "contracts/adoption-shell-v2/golden/digest-vectors.json",
  );
  assert.ok(isDigestGolden(golden));
  const input = readMaterializerInput(
    "contracts/adoption-shell-v2/fixtures/minimal-input.json",
  );
  assert.equal(golden.envelopeAlgorithm, ENVELOPE_DIGEST_ALGORITHM);
  assert.equal(golden.payloadAlgorithm, PAYLOAD_DIGEST_ALGORITHM);
  assert.equal(canonicalizeJson({ b: 2, a: 1 }), golden.canonical);
  assert.equal(sha256CanonicalJson({ b: 2, a: 1 }), golden.canonicalSha256);
  assert.equal(
    sha256PayloadEntries(input.release.entries),
    golden.payloadSha256,
  );
  assert.equal(
    input.release.entries[0]?.contentSha256,
    golden.firstEntryContentSha256,
  );
});

void test("payload framing is length-prefixed, sorted, and unambiguous", () => {
  const input = readMaterializerInput(
    "contracts/adoption-shell-v2/fixtures/multi-bundle-input.json",
  );
  const forward = input.release.entries;
  const reversed = [...forward].reverse();
  assert.deepEqual(payloadFrame(forward), payloadFrame(reversed));
  assert.equal(sha256PayloadEntries(forward), sha256PayloadEntries(reversed));

  const changed = forward.map((row, index) =>
    index === 0 ? { ...row, path: `${row.path}x` } : row,
  );
  assert.notEqual(sha256PayloadEntries(forward), sha256PayloadEntries(changed));
  assert.equal(
    sha256Bytes(payloadFrame(forward)),
    sha256PayloadEntries(forward),
  );
});
