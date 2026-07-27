import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  sha256CanonicalJson,
  validateMaterializerOutputManifestV2,
  type MaterializerOutputManifest,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

test("capability-owned output entries reject a malformed bundleId", () => {
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
  if (!result.ok) {
    assert.ok(
      result.diagnostics.some(
        (row) =>
          row.pointer === "/entries/1/bundleId" &&
          (row.code === "E_FORMAT" || row.code === "E_LENGTH"),
      ),
      JSON.stringify(result.diagnostics),
    );
  }
});
