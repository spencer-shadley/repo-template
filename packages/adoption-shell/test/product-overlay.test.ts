import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  COMPONENT_REGISTRY_OVERLAY_FILE,
  FULL_STACK_PROFILE,
  LIBRARY_PROFILE,
  PRODUCT_OVERLAY_BUNDLE_ID,
  PRODUCT_OVERLAY_FILE,
  SERVICE_PROFILE,
  STANDALONE_PROFILE,
  TECHNOLOGY_REGISTRY_OVERLAY_FILE,
  createProductOverlayBundle,
  isImmutableProvenance,
  materializeAdoptionShellV2,
  materializeProductOverlayEntries,
  validateComponentRegistryOverlay,
  validateMaterializerInputV2,
  validateProductOverlay,
  validateTechnologyRegistryOverlay,
} from "../src/index.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

function readJson(relativePath: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as unknown;
}

function isJsonSchema(value: unknown): value is AnySchema {
  return (
    typeof value === "boolean" ||
    (value !== null && typeof value === "object" && !Array.isArray(value))
  );
}

void test("full-stack profile materializes all required overlay files with canonical roles and revisit triggers", () => {
  const entries = materializeProductOverlayEntries(
    FULL_STACK_PROFILE,
    undefined,
    PRODUCT_OVERLAY_BUNDLE_ID,
  );
  const paths = entries.map((entry) => entry.path);
  assert.deepEqual(paths, [
    COMPONENT_REGISTRY_OVERLAY_FILE,
    PRODUCT_OVERLAY_FILE,
    TECHNOLOGY_REGISTRY_OVERLAY_FILE,
  ]);

  const productOverlayEntry = entries.find((e) => e.path === PRODUCT_OVERLAY_FILE);
  assert.ok(productOverlayEntry !== undefined);
  const rawContent = Buffer.from(productOverlayEntry.contentBase64, "base64").toString("utf8");
  const validation = validateProductOverlay(rawContent);
  if (!validation.ok) {
    assert.fail(JSON.stringify(validation));
  }

  const overlay = validation.value;
  assert.equal(overlay.platforms["web"]?.role, "primary");
  assert.equal(overlay.platforms["android"]?.role, "secondary");
  assert.equal(overlay.platforms["browser-extension"]?.role, "accessory");
  const windows = overlay.platforms["windows"];
  assert.ok(windows);
  assert.equal(windows.role, "dormant");
  assert.ok(
    typeof windows.revisitTrigger === "string" && windows.revisitTrigger.length > 0,
    "dormant platform must have non-empty revisitTrigger",
  );
  const chromeos = overlay.platforms["chromeos"];
  assert.ok(chromeos);
  assert.equal(chromeos.role, "not-targeted");
  assert.ok(
    typeof chromeos.rationale === "string" && chromeos.rationale.length > 0,
    "not-targeted platform must have rationale",
  );

  const techEntry = entries.find((e) => e.path === TECHNOLOGY_REGISTRY_OVERLAY_FILE);
  assert.ok(techEntry !== undefined);
  const techContent = Buffer.from(techEntry.contentBase64, "base64").toString("utf8");
  const techValidation = validateTechnologyRegistryOverlay(techContent);
  assert.equal(techValidation.ok, true, JSON.stringify(techValidation));

  const compEntry = entries.find((e) => e.path === COMPONENT_REGISTRY_OVERLAY_FILE);
  assert.ok(compEntry !== undefined);
  const compContent = Buffer.from(compEntry.contentBase64, "base64").toString("utf8");
  const compValidation = validateComponentRegistryOverlay(compContent);
  assert.equal(compValidation.ok, true, JSON.stringify(compValidation));
});

void test("service, library, and standalone profiles materialize appropriate platforms and overlays", () => {
  const serviceEntries = materializeProductOverlayEntries(SERVICE_PROFILE);
  const serviceEntry = serviceEntries.find((e) => e.path === PRODUCT_OVERLAY_FILE);
  assert.ok(serviceEntry);
  const serviceContent = Buffer.from(serviceEntry.contentBase64, "base64").toString("utf8");
  const serviceValidation = validateProductOverlay(serviceContent);
  if (!serviceValidation.ok) {
    assert.fail(JSON.stringify(serviceValidation));
  }
  assert.equal(serviceValidation.value.platforms["scheduled-job"]?.role, "primary");
  assert.equal(serviceValidation.value.platforms["cli"]?.role, "secondary");
  assert.equal(serviceValidation.value.platforms["web"]?.role, "not-targeted");

  const libEntries = materializeProductOverlayEntries(LIBRARY_PROFILE);
  const libEntry = libEntries.find((e) => e.path === PRODUCT_OVERLAY_FILE);
  assert.ok(libEntry);
  const libContent = Buffer.from(libEntry.contentBase64, "base64").toString("utf8");
  const libValidation = validateProductOverlay(libContent);
  if (!libValidation.ok) {
    assert.fail(JSON.stringify(libValidation));
  }
  assert.equal(libValidation.value.platforms["cli"]?.role, "specialized");
  assert.equal(libValidation.value.platforms["web"]?.role, "not-targeted");

  const standaloneEntries = materializeProductOverlayEntries(STANDALONE_PROFILE);
  const standaloneEntry = standaloneEntries.find((e) => e.path === PRODUCT_OVERLAY_FILE);
  assert.ok(standaloneEntry);
  const standaloneContent = Buffer.from(standaloneEntry.contentBase64, "base64").toString("utf8");
  const standaloneValidation = validateProductOverlay(standaloneContent);
  if (!standaloneValidation.ok) {
    assert.fail(JSON.stringify(standaloneValidation));
  }
  assert.equal(standaloneValidation.value.platforms["cli"]?.role, "primary");
  assert.equal(standaloneValidation.value.platforms["scheduled-job"]?.role, "secondary");
});

void test("product-overlay validation fails closed on invalid role", () => {
  const invalidRole = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      web: {
        role: "unsupported-experimental-role",
      },
    },
  });
  if (invalidRole.ok) {
    assert.fail("expected invalid role to fail");
  }
  assert.ok(invalidRole.diagnostics.some((d) => d.code === "E_INVALID_ROLE"));
  assert.ok(invalidRole.diagnostics.some((d) => d.pointer === "/platforms/web/role"));
});

void test("product-overlay validation fails closed on dormant surface without revisit trigger", () => {
  const dormantWithoutTrigger = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      windows: {
        role: "dormant",
      },
    },
  });
  if (dormantWithoutTrigger.ok) {
    assert.fail("expected dormant without trigger to fail");
  }
  assert.ok(
    dormantWithoutTrigger.diagnostics.some(
      (d) => d.code === "E_MISSING_DORMANT_REVISIT_TRIGGER",
    ),
  );
  assert.ok(
    dormantWithoutTrigger.diagnostics.some(
      (d) => d.pointer === "/platforms/windows/revisitTrigger",
    ),
  );

  const dormantWithEmptyTrigger = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      windows: {
        role: "dormant",
        revisitTrigger: " ".repeat(3),
      },
    },
  });
  assert.equal(dormantWithEmptyTrigger.ok, false);
});

void test("bootstrap provenance validation rejects mutable branch names and URLs", () => {
  const mutableTokens = [
    "master",
    "main",
    "HEAD",
    "origin/master",
    "trunk",
    "dev",
    "develop",
    "staging",
    "latest",
    "agent-orchestrator/master",
    "https://github.com/spencer-shadley/agent-orchestrator/blob/master/docs/AI-FIRST-ENGINEERING-STACK.md",
    "https://github.com/spencer-shadley/repo-template/tree/main/contracts",
    "",
    " ".repeat(3),
  ];

  for (const token of mutableTokens) {
    assert.equal(
      isImmutableProvenance(token),
      false,
      `expected '${token}' to be rejected as mutable provenance`,
    );

    const validation = validateProductOverlay({
      bootstrappedFromGuideVersion: token,
      platforms: {
        web: { role: "primary" },
      },
    });
    if (validation.ok) {
      assert.fail(`expected validation to fail for bootstrappedFromGuideVersion='${token}'`);
    }
    assert.ok(
      validation.diagnostics.some((d) => d.code === "E_MUTABLE_PROVENANCE" || d.code === "E_REQUIRED_PROVENANCE"),
    );
  }

  const noProvenance = validateProductOverlay({
    platforms: {
      web: { role: "primary" },
    },
  });
  if (noProvenance.ok) {
    assert.fail("expected missing provenance to fail");
  }
  assert.ok(noProvenance.diagnostics.some((d) => d.code === "E_REQUIRED_PROVENANCE"));
});

void test("bootstrap provenance validation accepts immutable release evidence", () => {
  const immutableTokens = [
    "2.0.0",
    "v2.2.0",
    "1.0.0",
    "3.0.0-rc1",
    "7264863f88e452c7bedf439b91bf47dbbebc3e49",
    "fe5527be73d4e652c14c423f428c66bf5c56aa1f206be159e2f566f2a9ba8c97",
    "sha256:fe5527be73d4e652c14c423f428c66bf5c56aa1f206be159e2f566f2a9ba8c97",
    "spencer-shadley/repo-template@2.0.0",
    "legacy",
    "https://github.com/spencer-shadley/agent-orchestrator/commit/7264863f88e452c7bedf439b91bf47dbbebc3e49",
    "https://github.com/spencer-shadley/repo-template/releases/tag/v2.2.0",
  ];

  for (const token of immutableTokens) {
    assert.equal(
      isImmutableProvenance(token),
      true,
      `expected '${token}' to be accepted as immutable provenance`,
    );

    const validation = validateProductOverlay({
      bootstrappedFromGuideVersion: token,
      platforms: {
        web: { role: "primary" },
      },
    });
    assert.equal(
      validation.ok,
      true,
      `expected validation to pass for '${token}', got: ${JSON.stringify(validation)}`,
    );
  }
});

void test("technology-registry and component-registry overlay validation fails closed on invalid lifecycle state", () => {
  const invalidTechState = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    bootstrappedFromGuideVersion: "2.0.0",
    technologies: {
      "technology.typescript": {
        state: "deprecated-state",
      },
    },
  });
  if (invalidTechState.ok) {
    assert.fail("expected invalid tech state to fail");
  }
  assert.ok(
    invalidTechState.diagnostics.some(
      (d) => d.code === "E_INVALID_LIFECYCLE_STATE",
    ),
  );

  const invalidCompState = validateComponentRegistryOverlay({
    registryKind: "component",
    bootstrappedFromGuideVersion: "2.0.0",
    components: {
      "component.tanstack-router": {
        state: "invalid-lifecycle",
      },
    },
  });
  if (invalidCompState.ok) {
    assert.fail("expected invalid comp state to fail");
  }
  assert.ok(
    invalidCompState.diagnostics.some(
      (d) => d.code === "E_INVALID_LIFECYCLE_STATE",
    ),
  );
});

void test("bundle definition contains expected artifacts and mode", () => {
  const bundle = createProductOverlayBundle(FULL_STACK_PROFILE);
  assert.equal(bundle.id, PRODUCT_OVERLAY_BUNDLE_ID);
  assert.equal(bundle.digestAlgorithm, "sha256-rfc8785-v1");
  assert.ok(bundle.artifacts.includes(PRODUCT_OVERLAY_FILE));
  assert.ok(bundle.artifacts.includes(TECHNOLOGY_REGISTRY_OVERLAY_FILE));
  assert.ok(bundle.artifacts.includes(COMPONENT_REGISTRY_OVERLAY_FILE));
  assert.equal(bundle.modes.length, 1);
  const mode = bundle.modes[0];
  assert.ok(mode);
  assert.equal(mode.id, "overlay-validation");
  assert.equal(mode.entrypoint, PRODUCT_OVERLAY_FILE);
});

void test("contracts and schemas validate against JSON Schema 2020-12", () => {
  const ajv = new Ajv2020({ allErrors: true, strictSchema: true, strictTypes: false });

  const productOverlaySchemaRaw = readJson(
    "contracts/product-overlay/v1/product-overlay.schema.json",
  );
  if (!isJsonSchema(productOverlaySchemaRaw)) {
    throw new TypeError("product overlay schema must be an object");
  }
  const validateProductOverlaySchema = ajv.compile(productOverlaySchemaRaw);

  const validOverlayFixture = readJson(
    "contracts/product-overlay/v1/fixtures/valid-product-overlay.json",
  );
  assert.equal(
    validateProductOverlaySchema(validOverlayFixture),
    true,
    JSON.stringify(validateProductOverlaySchema.errors),
  );

  const invalidDormantFixture = readJson(
    "contracts/product-overlay/v1/fixtures/invalid-dormant-no-revisit.json",
  );
  assert.equal(validateProductOverlaySchema(invalidDormantFixture), false);

  const invalidRoleFixture = readJson(
    "contracts/product-overlay/v1/fixtures/invalid-role.json",
  );
  assert.equal(validateProductOverlaySchema(invalidRoleFixture), false);

  const techSchemaRaw = readJson(
    "contracts/product-overlay/v1/technology-registry.overlay.schema.json",
  );
  if (!isJsonSchema(techSchemaRaw)) {
    throw new TypeError("tech registry overlay schema must be an object");
  }
  const validateTechSchema = ajv.compile(techSchemaRaw);
  const validTechFixture = readJson(
    "contracts/product-overlay/v1/fixtures/valid-technology-registry-overlay.json",
  );
  assert.equal(
    validateTechSchema(validTechFixture),
    true,
    JSON.stringify(validateTechSchema.errors),
  );

  const compSchemaRaw = readJson(
    "contracts/product-overlay/v1/component-registry.overlay.schema.json",
  );
  if (!isJsonSchema(compSchemaRaw)) {
    throw new TypeError("comp registry overlay schema must be an object");
  }
  const validateCompSchema = ajv.compile(compSchemaRaw);
  const validCompFixture = readJson(
    "contracts/product-overlay/v1/fixtures/valid-component-registry-overlay.json",
  );
  assert.equal(
    validateCompSchema(validCompFixture),
    true,
    JSON.stringify(validateCompSchema.errors),
  );
});

void test("materializeAdoptionShellV2 produces deterministic receipt and valid overlay files from fixture", () => {
  const inputRaw = readJson(
    "contracts/adoption-shell-v2/fixtures/product-overlay-input.json",
  );
  const validated = validateMaterializerInputV2(inputRaw);
  if (!validated.ok) {
    assert.fail(JSON.stringify(validated));
  }

  const result1 = materializeAdoptionShellV2(validated.value);
  const result2 = materializeAdoptionShellV2(validated.value);

  // Assert byte and digest stability across runs
  assert.deepEqual(result1, result2);
  assert.equal(
    result1.manifest.outputPayloadDigest,
    result2.manifest.outputPayloadDigest,
  );
  assert.equal(result1.manifest.manifestDigest, result2.manifest.manifestDigest);

  // Verify that all overlay files were materialized
  const materializedPaths = new Set(result1.entries.map((e) => e.path));
  assert.ok(materializedPaths.has(PRODUCT_OVERLAY_FILE));
  assert.ok(materializedPaths.has(TECHNOLOGY_REGISTRY_OVERLAY_FILE));
  assert.ok(materializedPaths.has(COMPONENT_REGISTRY_OVERLAY_FILE));

  // Verify receipt bundles include product overlay bundle
  const selectedBundleIds = result1.manifest.selectedBundles.map((b) => b.id);
  assert.ok(selectedBundleIds.includes(PRODUCT_OVERLAY_BUNDLE_ID));

  // Validate the content of each materialized overlay entry
  const productEntry = result1.entries.find(
    (e) => e.path === PRODUCT_OVERLAY_FILE,
  );
  assert.ok(productEntry);
  const productContent = Buffer.from(productEntry.contentBase64, "base64").toString("utf8");
  const productVal = validateProductOverlay(productContent);
  assert.equal(productVal.ok, true, JSON.stringify(productVal));

  const techEntry = result1.entries.find(
    (e) => e.path === TECHNOLOGY_REGISTRY_OVERLAY_FILE,
  );
  assert.ok(techEntry);
  const techContent = Buffer.from(techEntry.contentBase64, "base64").toString("utf8");
  const techVal = validateTechnologyRegistryOverlay(techContent);
  assert.equal(techVal.ok, true, JSON.stringify(techVal));

  const compEntry = result1.entries.find(
    (e) => e.path === COMPONENT_REGISTRY_OVERLAY_FILE,
  );
  assert.ok(compEntry);
  const compContent = Buffer.from(compEntry.contentBase64, "base64").toString("utf8");
  const compVal = validateComponentRegistryOverlay(compContent);
  assert.equal(compVal.ok, true, JSON.stringify(compVal));
});

