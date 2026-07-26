import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  sha256CanonicalJson,
  validatePublishedTemplateReleaseReceiptV1,
  validateTemplateReleaseReceiptV1,
  type TemplateReleaseReceipt,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function fixture(): TemplateReleaseReceipt {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "contracts",
        "adoption-shell-v2",
        "fixtures",
        "template-release-receipt.json",
      ),
      "utf8",
    ),
  ) as TemplateReleaseReceipt;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("candidate receipt validates but carries no publication authority", () => {
  const candidate = fixture();
  assert.equal(validateTemplateReleaseReceiptV1(candidate).ok, true);
  const authority = validatePublishedTemplateReleaseReceiptV1(candidate);
  assert.equal(authority.ok, false);
  if (!authority.ok) {
    assert.deepEqual(
      authority.diagnostics.map((diagnostic) => diagnostic.code),
      ["E_PUBLICATION_AUTHORITY"],
    );
  }
});

test("published receipt binds the same exact body without an ambient clock", () => {
  const candidate = fixture();
  const { receiptDigest: _receiptDigest, ...body } = candidate;
  const published = {
    ...body,
    publicationState: "published" as const,
  };
  const receipt = {
    ...published,
    receiptDigest: sha256CanonicalJson(published),
  };
  assert.equal(validatePublishedTemplateReleaseReceiptV1(receipt).ok, true);
});

test("identity, transport, authority fields, ordering, and digest fail closed", () => {
  const releaseId = clone(fixture()) as unknown as Record<string, unknown>;
  releaseId["releaseId"] = "spencer-shadley/repo-template@9.9.9";
  let result = validateTemplateReleaseReceiptV1(releaseId);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_RELEASE_ID"));
  }

  const transport = clone(fixture()) as unknown as {
    receiptTransport: { tagName: string };
  };
  transport.receiptTransport.tagName = "v9.9.9";
  result = validateTemplateReleaseReceiptV1(transport);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_TAG_TRANSPORT"));
  }

  const ambient = clone(fixture()) as unknown as Record<string, unknown>;
  ambient["createdAt"] = "2026-07-25T00:00:00Z";
  result = validateTemplateReleaseReceiptV1(ambient);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_UNKNOWN_PROPERTY"));
  }

  const unsorted = clone(fixture()) as unknown as {
    capabilityBundles: Array<{ id: string; version: string; digest: string }>;
  };
  const first = unsorted.capabilityBundles[0];
  assert.ok(first);
  unsorted.capabilityBundles = [
    { ...first, id: "z-last" },
    { ...first, id: "a-first" },
  ];
  result = validateTemplateReleaseReceiptV1(unsorted);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_SORT_ORDER"));
  }

  const digest = clone(fixture()) as unknown as { receiptDigest: string };
  digest.receiptDigest = "0".repeat(64);
  result = validateTemplateReleaseReceiptV1(digest);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.code === "E_RECEIPT_DIGEST"));
  }
});
