import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  materializeAdoptionShellV2,
  sha256Bytes,
  validateArtifactManifestV2,
  type ArtifactManifest,
  type MaterializerInput,
} from "../../../artifacts/adoption-shell-v2/index.js";
import { scanPublicCode } from "../../../tools/artifact-policy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactRoot = path.join(root, "artifacts", "adoption-shell-v2");

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

function inspectSchema(value: unknown, pointer = ""): void {
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record["type"] === "object") {
    assert.equal(record["additionalProperties"], false, pointer);
  }
  if (typeof record["$ref"] === "string") {
    assert.ok(
      record["$ref"].startsWith("#") || record["$ref"].startsWith("./"),
      `${pointer}: non-local ref`,
    );
  }
  for (const [key, child] of Object.entries(record)) {
    inspectSchema(child, `${pointer}/${key}`);
  }
}

test("artifact and all schema identities are closed and content-addressed", () => {
  const manifest = readJson<ArtifactManifest>(
    "artifacts/adoption-shell-v2/artifact-manifest.json",
  );
  assert.equal(validateArtifactManifestV2(manifest).ok, true);
  assert.equal(manifest.runtimeDependencyCount, 0);
  assert.equal(manifest.entrypoint, "index.js");
  assert.equal(manifest.validatorExport, "validateMaterializerInputV2");
  assert.equal(manifest.schemas.length, 9);
  const ids = new Set(Object.values(SCHEMA_IDS));
  const digests = new Set(Object.values(SCHEMA_DIGESTS));
  for (const row of manifest.schemas) {
    const schemaBytes = fs.readFileSync(path.join(root, ...row.path.split("/")));
    const schema = JSON.parse(schemaBytes.toString("utf8")) as Record<string, unknown>;
    assert.equal(schema["$schema"], "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema["$id"], row.id);
    assert.ok(ids.has(row.id as (typeof SCHEMA_IDS)[keyof typeof SCHEMA_IDS]));
    assert.ok(
      digests.has(row.sha256 as (typeof SCHEMA_DIGESTS)[keyof typeof SCHEMA_DIGESTS]),
    );
    assert.equal(sha256Bytes(schemaBytes), row.sha256);
    inspectSchema(schema);
  }
});

test("public source and committed JavaScript have only the declared import closure", () => {
  const manifest = readJson<ArtifactManifest>(
    "artifacts/adoption-shell-v2/artifact-manifest.json",
  );
  const findings = [
    ...scanPublicCode(
      root,
      manifest.sources.map((row) => row.path),
    ),
    ...scanPublicCode(
      artifactRoot,
      manifest.emitted
        .map((row) => row.path)
        .filter((relativePath) => relativePath.endsWith(".js")),
    ),
  ];
  assert.deepEqual(findings, []);
  for (const row of manifest.emitted.filter((entry) => entry.path.endsWith(".js"))) {
    const text = fs.readFileSync(path.join(artifactRoot, row.path), "utf8");
    for (const match of text.matchAll(
      /\b(?:import|export)\s+(?:[^"'`;]*?\sfrom\s*)?["']([^"']+)["']/g,
    )) {
      const specifier = match[1] ?? "";
      if (specifier === "node:crypto") continue;
      assert.ok(specifier.startsWith("./"), `${row.path}: ${specifier}`);
      const target = path.resolve(path.dirname(path.join(artifactRoot, row.path)), specifier);
      assert.ok(fs.existsSync(target), `${row.path}: missing ${specifier}`);
    }
  }
});

test("runtime tripwires observe no clock, random, fetch, or UUID access", () => {
  const input = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/minimal-input.json",
  );
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const dateDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Date");
  const originalRandom = Math.random;
  const cryptoValue = globalThis.crypto;
  const originalRandomUuid = cryptoValue.randomUUID;
  const accessed: string[] = [];
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    get: () => {
      accessed.push("fetch");
      throw new Error("fetch tripwire");
    },
  });
  Object.defineProperty(globalThis, "Date", {
    configurable: true,
    get: () => {
      accessed.push("Date");
      throw new Error("Date tripwire");
    },
  });
  Math.random = () => {
    accessed.push("Math.random");
    throw new Error("random tripwire");
  };
  cryptoValue.randomUUID = () => {
    accessed.push("crypto.randomUUID");
    throw new Error("UUID tripwire");
  };
  try {
    assert.equal(materializeAdoptionShellV2(input).manifest.entryCount, 1);
    assert.deepEqual(accessed, []);
  } finally {
    Math.random = originalRandom;
    cryptoValue.randomUUID = originalRandomUuid;
    if (fetchDescriptor === undefined) Reflect.deleteProperty(globalThis, "fetch");
    else Object.defineProperty(globalThis, "fetch", fetchDescriptor);
    if (dateDescriptor !== undefined) {
      Object.defineProperty(globalThis, "Date", dateDescriptor);
    }
  }
});
