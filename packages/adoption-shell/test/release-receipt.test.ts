import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  sha256CanonicalJson,
  validatePublishedTemplateReleaseReceiptV1,
  validateTemplateReleaseReceiptV1,
  type TemplateReleaseReceipt,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function isJsonSchema(value: unknown): value is AnySchema {
  return typeof value === "boolean" || (value !== null && typeof value === "object" && !Array.isArray(value));
}

const releaseReceiptSchemaValue: unknown = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "contracts",
      "adoption-shell-v2",
      "template-release-receipt.schema.json",
  ),
    "utf8",
  ),
);
if (!isJsonSchema(releaseReceiptSchemaValue)) throw new TypeError("release receipt schema must be an object or boolean");
const releaseReceiptSchema = releaseReceiptSchemaValue;
const validateSchema = new Ajv2020({
  allErrors: true,
  strictSchema: true,
  strictTypes: false,
}).compile(releaseReceiptSchema);

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

function releaseEvidence() {
  return {
    review: {
      subject: "producer-commit",
      url: "https://github.com/spencer-shadley/repo-template/pull/111#pullrequestreview-4815250857",
      result: "approved",
    },
    canaryReceipts: {
      "model-gateway-v1": {
        url: "https://github.com/spencer-shadley/model-gateway/issues/21#issuecomment-5120000001",
        receiptSha256: "a".repeat(64),
      },
      "repo-factory-v1": {
        url: "https://github.com/spencer-shadley/repo-factory/issues/1#issuecomment-5120000002",
        receiptSha256: "b".repeat(64),
      },
    },
    checks: {
      "repo-template-verify": {
        command: "corepack.cmd pnpm verify",
        result: "passed",
      },
    },
    publicationReadback: {
      kind: "producer-tag-ref/v1",
    },
    rollback: {
      disposition: "immutable-correct-forward",
      supersession: "new-semver-only",
    },
  } as const;
}

function receiptWithEvidence(): Record<string, any> {
  const candidate = fixture();
  const { receiptDigest: _receiptDigest, ...body } = candidate;
  const withEvidence = {
    ...body,
    releaseEvidence: releaseEvidence(),
  };
  return {
    ...withEvidence,
    receiptDigest: sha256CanonicalJson(withEvidence),
  };
}

void test("candidate receipt validates but carries no publication authority", () => {
  const candidate = fixture();
  assert.equal(validateTemplateReleaseReceiptV1(candidate).ok, true);
  const authority = validatePublishedTemplateReleaseReceiptV1(candidate);
  assert.equal(authority.ok, false);
  assert.deepEqual(
    authority.diagnostics.map((diagnostic) => diagnostic.code),
    ["E_PUBLICATION_AUTHORITY"],
  );
});

void test("closed release evidence binds review, canaries, checks, readback, and rollback", () => {
  const receipt = receiptWithEvidence();
  assert.equal(validateSchema(receipt), true);
  assert.equal(validateTemplateReleaseReceiptV1(receipt).ok, true);
});

void test("legacy receipts without optional release evidence remain valid", () => {
  const candidate = receiptWithEvidence();
  delete candidate["releaseEvidence"];
  const { receiptDigest: _receiptDigest, ...body } = candidate;
  candidate["receiptDigest"] = sha256CanonicalJson(body);
  assert.equal(validateSchema(candidate), true);
  assert.equal(validateTemplateReleaseReceiptV1(candidate).ok, true);
});

void test("published schema and runtime fail closed on release-evidence drift", () => {
  const cases: readonly [string, (value: Record<string, any>) => void][] = [
    ["extra review field", (value) => { value["releaseEvidence"].review.extra = true; }],
    ["non-review URL", (value) => {
      value["releaseEvidence"].review.url = "https://github.com/spencer-shadley/repo-template/pull/111";
    }],
    ["empty canary receipts", (value) => { value["releaseEvidence"].canaryReceipts = {}; }],
    ["invalid canary identity", (value) => {
      value["releaseEvidence"].canaryReceipts["bad/id"] =
        value["releaseEvidence"].canaryReceipts["model-gateway-v1"];
    }],
    ["invalid canary URL", (value) => {
      value["releaseEvidence"].canaryReceipts["model-gateway-v1"].url =
        "https://example.com/receipt";
    }],
    ["invalid canary digest", (value) => {
      value["releaseEvidence"].canaryReceipts["model-gateway-v1"].receiptSha256 = "a";
    }],
    ["empty checks", (value) => { value["releaseEvidence"].checks = {}; }],
    ["blank command", (value) => {
      value["releaseEvidence"].checks["repo-template-verify"].command = "";
    }],
    ["failed check", (value) => {
      value["releaseEvidence"].checks["repo-template-verify"].result = "failed";
    }],
    ["ambient readback kind", (value) => {
      value["releaseEvidence"].publicationReadback.kind = "issue-comment/v1";
    }],
    ["mutable rollback", (value) => {
      value["releaseEvidence"].rollback.disposition = "move-tag";
    }],
  ];
  for (const [name, mutate] of cases) {
    const receipt = receiptWithEvidence();
    mutate(receipt);
    const { receiptDigest: _receiptDigest, ...body } = receipt;
    receipt["receiptDigest"] = sha256CanonicalJson(body);
    assert.equal(validateSchema(receipt), false, `${name}: schema`);
    assert.equal(validateTemplateReleaseReceiptV1(receipt).ok, false, `${name}: runtime`);
  }
});

void test("published receipt binds the same exact body without an ambient clock", () => {
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

void test("identity, transport, authority fields, ordering, and digest fail closed", () => {
  const releaseId = clone(fixture()) as unknown as Record<string, unknown>;
  releaseId["releaseId"] = "spencer-shadley/repo-template@9.9.9";
  let result = validateTemplateReleaseReceiptV1(releaseId);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_RELEASE_ID"));

  const transport = clone(fixture()) as unknown as {
    receiptTransport: { tagName: string };
  };
  transport.receiptTransport.tagName = "v9.9.9";
  result = validateTemplateReleaseReceiptV1(transport);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_TAG_TRANSPORT"));

  const ambient = clone(fixture()) as unknown as Record<string, unknown>;
  ambient["createdAt"] = "2026-07-25T00:00:00Z";
  result = validateTemplateReleaseReceiptV1(ambient);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_UNKNOWN_PROPERTY"));

  const unsorted = clone(fixture()) as unknown as {
    capabilityBundles: { id: string; version: string; digest: string }[];
  };
  const first = unsorted.capabilityBundles[0];
  assert.ok(first);
  unsorted.capabilityBundles = [
    { ...first, id: "z-last" },
    { ...first, id: "a-first" },
  ];
  result = validateTemplateReleaseReceiptV1(unsorted);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_SORT_ORDER"));

  const digest = clone(fixture()) as unknown as { receiptDigest: string };
  digest.receiptDigest = "0".repeat(64);
  result = validateTemplateReleaseReceiptV1(digest);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.code === "E_RECEIPT_DIGEST"));
});
