import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  materializeAdoptionShellV2,
  sha256Bytes,
  validateArtifactManifestV2,
  validateCapabilityBundleRegistryV2,
  validateMaterializerInputV2,
  type MaterializerInput,
} from "../../../artifacts/adoption-shell-v2/index.js";
import { scanPublicCode } from "../../../tools/artifact-policy.ts";
import { generateContractFixtures } from "../../../tools/generate-contract-fixtures.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactRoot = path.join(root, "artifacts", "adoption-shell-v2");

function readJson(relativePath: string): unknown {
  const value: unknown = JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  );
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readManifest() {
  const result = validateArtifactManifestV2(
    readJson("artifacts/adoption-shell-v2/artifact-manifest.json"),
  );
  if (!result.ok) throw new Error("artifact manifest must be valid");
  return result.value;
}

function readMaterializerInput(relativePath: string): MaterializerInput {
  const result = validateMaterializerInputV2(readJson(relativePath));
  if (!result.ok) throw new Error("fixture must be a materializer input");
  return result.value;
}

function inspectSchema(value: unknown, pointer = ""): void {
  if (value === null || typeof value !== "object") return;
  if (!isRecord(value)) return;
  const record = value;
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

void test("artifact and all schema identities are closed and content-addressed", () => {
  const manifest = readManifest();
  assert.equal(manifest.runtimeDependencyCount, 0);
  assert.equal(manifest.entrypoint, "index.js");
  assert.equal(manifest.validatorExport, "validateMaterializerInputV2");
  assert.equal(manifest.schemas.length, 9);
  const ids = new Set<string>(Object.values(SCHEMA_IDS));
  const digests = new Set<string>(Object.values(SCHEMA_DIGESTS));
  for (const row of manifest.schemas) {
    const schemaBytes = fs.readFileSync(path.join(root, ...row.path.split("/")));
    const schemaValue: unknown = JSON.parse(schemaBytes.toString("utf8"));
    assert.ok(isRecord(schemaValue));
    const schema = schemaValue;
    assert.equal(schema["$schema"], "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema["$id"], row.id);
    assert.ok(ids.has(row.id));
    assert.ok(digests.has(row.sha256));
    assert.equal(sha256Bytes(schemaBytes), row.sha256);
    inspectSchema(schema);
  }
});

void test("generated quality-lint bundle is retained in the artifact fixture closure", () => {
  const manifest = readManifest();
  const expectedArtifacts = [
    "docs/QUALITY-LINT.md",
    "eslint.config.mjs",
    "local-ci.json",
    "scripts/verify-quality-lint-required.ts",
  ];
  const ownedTemp = fs.mkdtempSync(
    path.join(os.tmpdir(), "repo-template-quality-lint-registry-"),
  );
  try {
    generateContractFixtures(ownedTemp, manifest.artifactDigest);
    const registryValue: unknown = JSON.parse(
      fs.readFileSync(
        path.join(ownedTemp, "capability-bundle-registry.json"),
        "utf8",
      ),
    );
    const registryResult = validateCapabilityBundleRegistryV2(registryValue);
    if (!registryResult.ok) throw new Error("generated registry must be valid");
    const registry = registryResult.value;
    const bundles = registry.bundles.filter(
      (bundle) => bundle.id === "repo-template/quality-lint",
    );
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0]?.version, "1.1.0");
    assert.deepEqual(bundles[0].artifacts, expectedArtifacts);
    assert.deepEqual(bundles[0].modes, [
      {
        id: "config",
        entrypoint: "eslint.config.mjs",
        requiredPaths: expectedArtifacts,
      },
      {
        id: "presence",
        entrypoint: "scripts/verify-quality-lint-required.ts",
        requiredPaths: [
          "eslint.config.mjs",
          "scripts/verify-quality-lint-required.ts",
        ],
      },
    ]);

    for (const artifactPath of expectedArtifacts) {
      const rows = manifest.fixtures.filter((row) => row.path === artifactPath);
      assert.equal(rows.length, 1, artifactPath);
      const content = fs.readFileSync(path.join(root, ...artifactPath.split("/")));
      assert.equal(rows[0]?.mode, "100644", artifactPath);
      assert.equal(rows[0].bytes, content.byteLength, artifactPath);
      assert.equal(rows[0].sha256, sha256Bytes(content), artifactPath);
    }
  } finally {
    fs.rmSync(ownedTemp, { force: true, recursive: true });
  }
});

void test("public source and committed JavaScript have only the declared import closure", () => {
  const manifest = readManifest();
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

void test("artifact policy rejects ambient imports with sorted findings", () => {
  const ownedTemp = fs.mkdtempSync(
    path.join(os.tmpdir(), "repo-template-artifact-policy-"),
  );
  try {
    fs.writeFileSync(
      path.join(ownedTemp, "b.js"),
      'import fs from "node:fs";\nDate.now();\n',
    );
    fs.writeFileSync(path.join(ownedTemp, "a.js"), 'import("dynamic");\n');

    const findings = scanPublicCode(ownedTemp, ["b.js", "a.js"]);

    assert.deepEqual(findings, [...findings].toSorted((left, right) => left.localeCompare(right)));
    assert.ok(findings.some((row) => row.includes("forbidden module import node:fs")));
    assert.ok(findings.some((row) => row.includes("dynamic import is forbidden")));
    assert.ok(findings.some((row) => row.includes("forbidden ambient identifier")));
  } finally {
    fs.rmSync(ownedTemp, { force: true, recursive: true });
  }
});

void test("runtime tripwires observe no clock, random, fetch, or UUID access", () => {
  const input = readMaterializerInput(
    "contracts/adoption-shell-v2/fixtures/minimal-input.json",
  );
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const dateDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Date");
  const originalRandom = Math.random;
  const cryptoValue = crypto;
  const originalRandomUuid = cryptoValue.randomUUID;
  const accessed: string[] = [];
  Object.defineProperties(globalThis, {
  	fetch: {
	    configurable: true,
	    get: () => {
	      accessed.push("fetch");
	      throw new Error("fetch tripwire");
	    },
	  },
  	Date: {
	    configurable: true,
	    get: () => {
	      accessed.push("Date");
	      throw new Error("Date tripwire");
	    },
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
