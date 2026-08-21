import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  sha256CanonicalJson,
  validateArtifactManifestV2,
  validateMaterializerOutputManifestV2,
  validateVerificationReceiptV2,
  type MaterializerOutputManifest,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

void test("capability-owned output entries reject a malformed bundleId", () => {
  const golden = readJson<{
    readonly manifest: Record<string, unknown>;
  }>("contracts/adoption-shell-v2/golden/minimal-output.json");
  const { manifestDigest: _digest, ...body } = golden.manifest;
  const capabilityEntry = {
    path: "capability/tool.sh",
    kind: "file",
    mode: "100755",
    contentSha256: "0".repeat(64),
    role: "capability-executable",
    encoding: "utf-8",
    bundleId: "Not A Valid Bundle Id!!",
  };
  const mutatedBody = {
    ...body,
    entryCount: 2,
    entries: [...(body["entries"] as readonly unknown[]), capabilityEntry],
  };
  const manifest = {
    ...mutatedBody,
    manifestDigest: sha256CanonicalJson(mutatedBody),
  } as unknown as MaterializerOutputManifest;

  const result = validateMaterializerOutputManifestV2(manifest);
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      (row) =>
        row.pointer === "/entries/1/bundleId" &&
        (row.code === "E_FORMAT" || row.code === "E_LENGTH"),
    ),
    JSON.stringify(result.diagnostics),
  );
});

function readArtifactManifest(): Record<string, unknown> {
  return readJson<Record<string, unknown>>("artifacts/adoption-shell-v2/artifact-manifest.json");
}

function withRecomputedDigest(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body, manifestDigest: sha256CanonicalJson(body) };
}

void test("artifact manifest validator rejects every mutated field with a targeted diagnostic", () => {
  const cases: readonly {
    readonly name: string;
    readonly mutate: (manifest: Record<string, unknown>) => void;
    readonly code: string;
    readonly pointer: string;
    readonly recompute: boolean;
  }[] = [
    {
      name: "schemaId mismatch",
      mutate: (m) => (m["schemaId"] = "bogus"),
      code: "E_CONST",
      pointer: "/schemaId",
      recompute: true,
    },
    {
      name: "schemaDigest mismatch",
      mutate: (m) => (m["schemaDigest"] = "0".repeat(64)),
      code: "E_SCHEMA_DIGEST",
      pointer: "/schemaDigest",
      recompute: true,
    },
    {
      name: "contractId mismatch",
      mutate: (m) => (m["contractId"] = "bogus/contract"),
      code: "E_CONST",
      pointer: "/contractId",
      recompute: true,
    },
    {
      name: "contractVersion mismatch",
      mutate: (m) => (m["contractVersion"] = "9.9.9"),
      code: "E_CONST",
      pointer: "/contractVersion",
      recompute: true,
    },
    {
      name: "digestAlgorithm mismatch",
      mutate: (m) => (m["digestAlgorithm"] = "bogus-algorithm"),
      code: "E_CONST",
      pointer: "/digestAlgorithm",
      recompute: true,
    },
    {
      name: "artifactDigestAlgorithm mismatch",
      mutate: (m) => (m["artifactDigestAlgorithm"] = "bogus-algorithm"),
      code: "E_CONST",
      pointer: "/artifactDigestAlgorithm",
      recompute: true,
    },
    {
      name: "toolchain.typescript mismatch",
      mutate: (m) =>
        ((m["toolchain"] as Record<string, unknown>)["typescript"] = "0.0.0"),
      code: "E_CONST",
      pointer: "/toolchain/typescript",
      recompute: true,
    },
    {
      name: "toolchain.nodeCompatibility mismatch",
      mutate: (m) =>
        ((m["toolchain"] as Record<string, unknown>)["nodeCompatibility"] = ">=0.0.0"),
      code: "E_CONST",
      pointer: "/toolchain/nodeCompatibility",
      recompute: true,
    },
    {
      name: "toolchain.packageManager mismatch",
      mutate: (m) =>
        ((m["toolchain"] as Record<string, unknown>)["packageManager"] = "npm@0.0.0"),
      code: "E_CONST",
      pointer: "/toolchain/packageManager",
      recompute: true,
    },
    {
      name: "entrypoint mismatch",
      mutate: (m) => (m["entrypoint"] = "main.js"),
      code: "E_CONST",
      pointer: "/entrypoint",
      recompute: true,
    },
    {
      name: "validatorExport mismatch",
      mutate: (m) => (m["validatorExport"] = "bogusExport"),
      code: "E_CONST",
      pointer: "/validatorExport",
      recompute: true,
    },
    {
      name: "runtimeDependencyCount nonzero",
      mutate: (m) => (m["runtimeDependencyCount"] = 1),
      code: "E_CONST",
      pointer: "/runtimeDependencyCount",
      recompute: true,
    },
    {
      name: "releaseReceiptKind mismatch",
      mutate: (m) => (m["releaseReceiptKind"] = "bogus/kind/v1"),
      code: "E_CONST",
      pointer: "/releaseReceiptKind",
      recompute: true,
    },
    {
      name: "sources file row bad mode",
      mutate: (m) => {
        const rows = m["sources"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no sources rows");
        first["mode"] = "100600";
      },
      code: "E_MODE",
      pointer: "/sources/0/mode",
      recompute: true,
    },
    {
      name: "sources file row bytes out of range",
      mutate: (m) => {
        const rows = m["sources"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no sources rows");
        first["bytes"] = 33_554_433;
      },
      code: "E_COUNT",
      pointer: "/sources/0/bytes",
      recompute: true,
    },
    {
      name: "schemas array wrong length",
      mutate: (m) => {
        (m["schemas"] as unknown[]).pop();
      },
      code: "E_COUNT",
      pointer: "/schemas",
      recompute: true,
    },
    {
      name: "schemas entry id pattern mismatch",
      mutate: (m) => {
        const rows = m["schemas"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no schemas rows");
        first["id"] = "https://example.com/not-a-repo-template-schema.json";
      },
      code: "E_FORMAT",
      pointer: "/schemas/0/id",
      recompute: true,
    },
    {
      name: "schemas entry version mismatch",
      mutate: (m) => {
        const rows = m["schemas"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no schemas rows");
        first["version"] = "9.9.9";
      },
      code: "E_CONST",
      pointer: "/schemas/0/version",
      recompute: true,
    },
    {
      name: "schemas entry mode is executable, not the required constant",
      mutate: (m) => {
        const rows = m["schemas"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no schemas rows");
        first["mode"] = "100755";
      },
      code: "E_MODE",
      pointer: "/schemas/0/mode",
      recompute: true,
    },
    {
      name: "schemas entry bytes exceed the schema-file maximum",
      mutate: (m) => {
        const rows = m["schemas"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no schemas rows");
        first["bytes"] = 1_048_577;
      },
      code: "E_COUNT",
      pointer: "/schemas/0/bytes",
      recompute: true,
    },
    {
      name: "manifestDigest mismatch",
      mutate: (m) => (m["artifactDigest"] = "1".repeat(64)),
      code: "E_MANIFEST_DIGEST",
      pointer: "/manifestDigest",
      recompute: false,
    },
  ];

  for (const testCase of cases) {
    const manifest = readArtifactManifest();
    testCase.mutate(manifest);
    const { manifestDigest: _digest, ...body } = manifest;
    const candidate = testCase.recompute
      ? withRecomputedDigest(body)
      : manifest;
    const result = validateArtifactManifestV2(candidate);
    assert.equal(result.ok, false, testCase.name);
    assert.ok(
      result.diagnostics.some(
        (row) => row.code === testCase.code && row.pointer === testCase.pointer,
      ),
      `${testCase.name}: ${JSON.stringify(result.diagnostics)}`,
    );
  }
});

function readVerificationReceipt(): Record<string, unknown> {
  return readJson<Record<string, unknown>>(
    "contracts/adoption-shell-v2/golden/deterministic-receipt.json",
  );
}

void test("verification receipt validator rejects every mutated field with a targeted diagnostic", () => {
  const cases: readonly {
    readonly name: string;
    readonly mutate: (receipt: Record<string, unknown>) => void;
    readonly code: string;
    readonly pointer: string;
    readonly recompute: boolean;
  }[] = [
    {
      name: "schemaId mismatch",
      mutate: (r) => (r["schemaId"] = "bogus"),
      code: "E_CONST",
      pointer: "/schemaId",
      recompute: true,
    },
    {
      name: "schemaDigest mismatch",
      mutate: (r) => (r["schemaDigest"] = "0".repeat(64)),
      code: "E_SCHEMA_DIGEST",
      pointer: "/schemaDigest",
      recompute: true,
    },
    {
      name: "contractId mismatch",
      mutate: (r) => (r["contractId"] = "bogus/contract"),
      code: "E_CONST",
      pointer: "/contractId",
      recompute: true,
    },
    {
      name: "receiptKind mismatch",
      mutate: (r) => (r["receiptKind"] = "bogus/kind/v1"),
      code: "E_CONST",
      pointer: "/receiptKind",
      recompute: true,
    },
    {
      name: "digestAlgorithm mismatch",
      mutate: (r) => (r["digestAlgorithm"] = "bogus-algorithm"),
      code: "E_CONST",
      pointer: "/digestAlgorithm",
      recompute: true,
    },
    {
      name: "independentRunCount not 2",
      mutate: (r) => (r["independentRunCount"] = 1),
      code: "E_CONST",
      pointer: "/independentRunCount",
      recompute: true,
    },
    {
      name: "result mismatch",
      mutate: (r) => (r["result"] = "pending"),
      code: "E_CONST",
      pointer: "/result",
      recompute: true,
    },
    {
      name: "receiptDigest mismatch",
      mutate: (r) => (r["artifactDigest"] = "1".repeat(64)),
      code: "E_RECEIPT_DIGEST",
      pointer: "/receiptDigest",
      recompute: false,
    },
  ];

  for (const testCase of cases) {
    const receipt = readVerificationReceipt();
    testCase.mutate(receipt);
    const { receiptDigest: _digest, ...body } = receipt;
    const candidate = testCase.recompute
      ? { ...body, receiptDigest: sha256CanonicalJson(body) }
      : receipt;
    const result = validateVerificationReceiptV2(candidate);
    assert.equal(result.ok, false, testCase.name);
    assert.ok(
      result.diagnostics.some(
        (row) => row.code === testCase.code && row.pointer === testCase.pointer,
      ),
      `${testCase.name}: ${JSON.stringify(result.diagnostics)}`,
    );
  }
});

function readOutputManifest(): Record<string, unknown> {
  const golden = readJson<{ readonly manifest: Record<string, unknown> }>(
    "contracts/adoption-shell-v2/golden/minimal-output.json",
  );
  return golden.manifest;
}

void test("materializer output manifest validator rejects every mutated field with a targeted diagnostic", () => {
  const cases: readonly {
    readonly name: string;
    readonly mutate: (manifest: Record<string, unknown>) => void;
    readonly code: string;
    readonly pointer: string;
    readonly recompute: boolean;
  }[] = [
    {
      name: "entryCount not positive",
      mutate: (m) => (m["entryCount"] = 0),
      code: "E_COUNT",
      pointer: "/entryCount",
      recompute: true,
    },
    {
      name: "entryCount does not match entries",
      mutate: (m) => (m["entryCount"] = 2),
      code: "E_ENTRY_COUNT",
      pointer: "/entryCount",
      recompute: true,
    },
    {
      name: "migrationRefs non-empty",
      mutate: (m) => (m["migrationRefs"] = ["extra"]),
      code: "E_COUNT",
      pointer: "/migrationRefs",
      recompute: true,
    },
    {
      name: "selectedBundles id pattern mismatch",
      mutate: (m) => {
        m["selectedBundles"] = [
          { id: "BAD ID!", version: "1.0.0", digest: "0".repeat(64) },
        ];
      },
      code: "E_FORMAT",
      pointer: "/selectedBundles/0/id",
      recompute: true,
    },
    {
      name: "selectedBundles version mismatch",
      mutate: (m) => {
        m["selectedBundles"] = [
          { id: "valid-id", version: "not-semver", digest: "0".repeat(64) },
        ];
      },
      code: "E_FORMAT",
      pointer: "/selectedBundles/0/version",
      recompute: true,
    },
    {
      name: "entries role unsupported",
      mutate: (m) => {
        const rows = m["entries"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no entries");
        first["role"] = "bogus-role";
      },
      code: "E_ROLE",
      pointer: "/entries/0/role",
      recompute: true,
    },
    {
      name: "entries mode invalid",
      mutate: (m) => {
        const rows = m["entries"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no entries");
        first["mode"] = "100600";
      },
      code: "E_MODE",
      pointer: "/entries/0/mode",
      recompute: true,
    },
    {
      name: "entries encoding unsupported",
      mutate: (m) => {
        const rows = m["entries"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no entries");
        first["encoding"] = "latin1";
      },
      code: "E_ENCODING",
      pointer: "/entries/0/encoding",
      recompute: true,
    },
    {
      name: "entries encoding disagrees with role",
      mutate: (m) => {
        const rows = m["entries"] as Record<string, unknown>[];
        const first = rows[0];
        if (first === undefined) throw new Error("no entries");
        first["encoding"] = "binary";
      },
      code: "E_ENCODING_ROLE",
      pointer: "/entries/0/encoding",
      recompute: true,
    },
    {
      name: "manifestDigest mismatch",
      mutate: (m) => (m["releaseDigest"] = "1".repeat(64)),
      code: "E_MANIFEST_DIGEST",
      pointer: "/manifestDigest",
      recompute: false,
    },
  ];

  for (const testCase of cases) {
    const manifest = readOutputManifest();
    testCase.mutate(manifest);
    const { manifestDigest: _digest, ...body } = manifest;
    const candidate = testCase.recompute
      ? { ...body, manifestDigest: sha256CanonicalJson(body) }
      : manifest;
    const result = validateMaterializerOutputManifestV2(
      candidate,
    );
    assert.equal(result.ok, false, testCase.name);
    assert.ok(
      result.diagnostics.some(
        (row) => row.code === testCase.code && row.pointer === testCase.pointer,
      ),
      `${testCase.name}: ${JSON.stringify(result.diagnostics)}`,
    );
  }
});
