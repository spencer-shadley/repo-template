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
  type PayloadEntry,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson(relativePath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as unknown;
}

test("RFC 8785 published vectors and key ordering are exact", () => {
  const golden = readJson(
    "contracts/adoption-shell-v2/golden/rfc8785-vectors.json",
  ) as {
    readonly vectors: readonly {
      readonly name: string;
      readonly input: unknown;
      readonly canonical: string;
    }[];
  };
  for (const vector of golden.vectors) {
    assert.equal(canonicalizeJson(vector.input), vector.canonical, vector.name);
  }
  assert.equal(canonicalizeJson(-0), "0");
  assert.equal(canonicalizeJson(1e-7), "1e-7");
  assert.equal(canonicalizeJson(1e-6), "0.000001");
  assert.equal(canonicalizeJson({ "\uFFFD": 1, "😀": 2 }), "{\"😀\":2,\"\uFFFD\":1}");
});

test("RFC 8785 rejects values outside its JSON domain", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1n, undefined]) {
    assert.throws(() => canonicalizeJson(value));
  }
  assert.throws(() => canonicalizeJson("\uD800"), /lone surrogates/);
  const sparse = new Array<unknown>(1);
  assert.throws(() => canonicalizeJson(sparse), /sparse arrays/);
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalizeJson(cyclic), /cyclic values/);
  assert.throws(() => canonicalizeJson(new Map()), /plain objects/);
});

test("canonical base64 decoder rejects alternate spellings", () => {
  assert.deepEqual([...decodeCanonicalBase64("TWE=")], [0x4d, 0x61]);
  for (const value of ["TWE", "TWE==", "TR==", "TWE=\n"]) {
    assert.throws(() => decodeCanonicalBase64(value), /canonical padded base64/);
  }
});

test("both named SHA-256 algorithms match committed goldens", () => {
  const golden = readJson(
    "contracts/adoption-shell-v2/golden/digest-vectors.json",
  ) as {
    readonly envelopeAlgorithm: string;
    readonly canonical: string;
    readonly canonicalSha256: string;
    readonly payloadAlgorithm: string;
    readonly payloadSha256: string;
    readonly firstEntryContentSha256: string;
  };
  const input = readJson(
    "contracts/adoption-shell-v2/fixtures/minimal-input.json",
  ) as { readonly release: { readonly entries: readonly PayloadEntry[] } };
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

test("payload framing is length-prefixed, sorted, and unambiguous", () => {
  const input = readJson(
    "contracts/adoption-shell-v2/fixtures/multi-bundle-input.json",
  ) as { readonly release: { readonly entries: readonly PayloadEntry[] } };
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
