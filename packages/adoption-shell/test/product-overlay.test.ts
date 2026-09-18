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
  isImmutableGitHubUrl,
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

void test("product-overlay validation fails closed on not-targeted platform without rationale", () => {
  const notTargetedWithoutRationale = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      chromeos: {
        role: "not-targeted",
      },
    },
  });
  if (notTargetedWithoutRationale.ok) {
    assert.fail("expected not-targeted without rationale to fail");
  }
  assert.ok(
    notTargetedWithoutRationale.diagnostics.some(
      (d) => d.code === "E_MISSING_NOT_TARGETED_RATIONALE",
    ),
  );
  assert.ok(
    notTargetedWithoutRationale.diagnostics.some(
      (d) => d.pointer === "/platforms/chromeos/rationale",
    ),
  );

  const notTargetedWithEmptyRationale = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      chromeos: {
        role: "not-targeted",
        rationale: " ".repeat(3),
      },
    },
  });
  assert.equal(notTargetedWithEmptyRationale.ok, false);
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

void test("technology-registry and component-registry overlay validation fails closed on missing, mutable, or malformed provenance", () => {
  // Missing provenance fails closed
  const techNoProv = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    technologies: {},
  });
  assert.equal(techNoProv.ok, false);
  assert.ok(techNoProv.diagnostics.some((d) => d.code === "E_REQUIRED_PROVENANCE"));

  const compNoProv = validateComponentRegistryOverlay({
    registryKind: "component",
    components: {},
  });
  assert.equal(compNoProv.ok, false);
  assert.ok(compNoProv.diagnostics.some((d) => d.code === "E_REQUIRED_PROVENANCE"));

  // Mutable branch tokens fail closed
  const mutableTokens = ["master", "main", "HEAD", "origin/master", "dev", "staging", "latest"];
  for (const token of mutableTokens) {
    const techMutable = validateTechnologyRegistryOverlay({
      registryKind: "technology",
      templateRelease: token,
      technologies: {},
    });
    assert.equal(techMutable.ok, false);
    assert.ok(techMutable.diagnostics.some((d) => d.code === "E_MUTABLE_PROVENANCE"));

    const compMutable = validateComponentRegistryOverlay({
      registryKind: "component",
      bootstrappedFromGuideVersion: token,
      components: {},
    });
    assert.equal(compMutable.ok, false);
    assert.ok(compMutable.diagnostics.some((d) => d.code === "E_MUTABLE_PROVENANCE"));
  }

  // Malformed templateDigest (not 64 lowercase hex) fails closed
  for (const badDigest of ["not-a-hash", "fe5527be", "GE5527BE73D4E652C14C423F428C66BF5C56AA1F206BE159E2F566F2A9BA8C97", 123]) {
    const techBadDigest = validateTechnologyRegistryOverlay({
      registryKind: "technology",
      templateDigest: badDigest,
      technologies: {},
    });
    assert.equal(techBadDigest.ok, false);
    assert.ok(techBadDigest.diagnostics.some((d) => d.code === "E_MUTABLE_PROVENANCE" || d.code === "E_TYPE"));
  }

  // Malformed templateCommit (not 40 lowercase hex) fails closed
  for (const badCommit of ["short", "7264863F88E452C7BEDF439B91BF47DBBEBC3E49", 123]) {
    const compBadCommit = validateComponentRegistryOverlay({
      registryKind: "component",
      templateCommit: badCommit,
      components: {},
    });
    assert.equal(compBadCommit.ok, false);
    assert.ok(compBadCommit.diagnostics.some((d) => d.code === "E_MUTABLE_PROVENANCE" || d.code === "E_TYPE"));
  }
});

void test("nested provenance validation enforces immutable release evidence, digest/commit shapes, and closed schemas", () => {
  // Non-object provenance
  const nonObject = validateProductOverlay({
    provenance: "not-an-object",
    platforms: { web: { role: "primary" } },
  });
  assert.equal(nonObject.ok, false);
  assert.ok(nonObject.diagnostics.some((d) => d.code === "E_TYPE" && d.pointer === "/provenance"));

  // Unknown property in provenance
  const unknownProp = validateProductOverlay({
    provenance: { templateRelease: "1.0.0", unknownField: "bad" },
    platforms: { web: { role: "primary" } },
  });
  assert.equal(unknownProp.ok, false);
  assert.ok(unknownProp.diagnostics.some((d) => d.code === "E_UNKNOWN_PROPERTY" && d.pointer === "/provenance/unknownField"));

  // Mutable templateRelease in nested provenance
  const mutableNested = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    provenance: { templateRelease: "master" },
    technologies: {},
  });
  assert.equal(mutableNested.ok, false);
  assert.ok(mutableNested.diagnostics.some((d) => d.code === "E_MUTABLE_PROVENANCE" && d.pointer === "/provenance/templateRelease"));

  // Non-string templateRelease in nested provenance
  const nonStringNested = validateComponentRegistryOverlay({
    registryKind: "component",
    provenance: { templateRelease: 123 },
    components: {},
  });
  assert.equal(nonStringNested.ok, false);
  assert.ok(nonStringNested.diagnostics.some((d) => d.code === "E_TYPE" && d.pointer === "/provenance/templateRelease"));

  // Malformed templateDigest in nested provenance
  const malformedDigest = validateProductOverlay({
    provenance: { templateDigest: "bad-sha" },
    platforms: { web: { role: "primary" } },
  });
  assert.equal(malformedDigest.ok, false);
  assert.ok(malformedDigest.diagnostics.some((d) => d.code === "E_MUTABLE_PROVENANCE" && d.pointer === "/provenance/templateDigest"));

  // Malformed templateCommit in nested provenance
  const malformedCommit = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    provenance: { templateCommit: "short" },
    technologies: {},
  });
  assert.equal(malformedCommit.ok, false);
  assert.ok(malformedCommit.diagnostics.some((d) => d.code === "E_MUTABLE_PROVENANCE" && d.pointer === "/provenance/templateCommit"));

  // Valid nested provenance passes
  const validNested = validateProductOverlay({
    provenance: {
      contractId: "repo-template/product-overlay/v1",
      templateRelease: "1.0.0",
      templateDigest: "fe5527be73d4e652c14c423f428c66bf5c56aa1f206be159e2f566f2a9ba8c97",
      templateCommit: "7264863f88e452c7bedf439b91bf47dbbebc3e49",
    },
    platforms: { web: { role: "primary" } },
  });
  assert.equal(validNested.ok, true, JSON.stringify(validNested));
});

void test("technology-registry and component-registry overlay validation fails closed on invalid entry fields and states", () => {
  // Invalid lifecycle state
  const invalidTechState = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    bootstrappedFromGuideVersion: "2.0.0",
    technologies: {
      "technology.typescript": {
        state: "deprecated-state",
      },
    },
  });
  assert.equal(invalidTechState.ok, false);
  assert.ok(invalidTechState.diagnostics.some((d) => d.code === "E_INVALID_LIFECYCLE_STATE"));

  // Missing state
  const missingState = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    bootstrappedFromGuideVersion: "2.0.0",
    technologies: {
      "technology.typescript": {
        id: "typescript",
      } as unknown as { state: "preferred-default" },
    },
  });
  assert.equal(missingState.ok, false);
  assert.ok(missingState.diagnostics.some((d) => d.code === "E_REQUIRED" && d.pointer === "/technologies/technology.typescript/state"));

  // Unknown property in entry
  const unknownField = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    bootstrappedFromGuideVersion: "2.0.0",
    technologies: {
      "technology.typescript": {
        state: "preferred-default",
        unknownProp: "invalid",
      },
    },
  });
  assert.equal(unknownField.ok, false);
  assert.ok(unknownField.diagnostics.some((d) => d.code === "E_UNKNOWN_PROPERTY"));

  // Non-string entry fields
  const fieldTypes = [
    { field: "id", value: 123 },
    { field: "category", value: true },
    { field: "rationale", value: 456 },
    { field: "revisitTrigger", value: [] },
    { field: "versionPolicy", value: {} },
    { field: "selectedVersion", value: 789 },
  ];
  for (const { field, value } of fieldTypes) {
    const invalidField = validateTechnologyRegistryOverlay({
      registryKind: "technology",
      bootstrappedFromGuideVersion: "2.0.0",
      technologies: {
        "technology.typescript": {
          state: "preferred-default",
          [field]: value,
        },
      },
    });
    assert.equal(invalidField.ok, false);
    assert.ok(
      invalidField.diagnostics.some(
        (d) => d.code === "E_TYPE" && d.pointer === `/technologies/technology.typescript/${field}`,
      ),
      `expected E_TYPE for ${field}`,
    );
  }

  // Non-array contexts
  const nonArrayContexts = validateComponentRegistryOverlay({
    registryKind: "component",
    bootstrappedFromGuideVersion: "2.0.0",
    components: {
      "component.tanstack-router": {
        state: "preferred-default",
        contexts: "not-an-array",
      },
    },
  });
  assert.equal(nonArrayContexts.ok, false);
  assert.ok(
    nonArrayContexts.diagnostics.some(
      (d) => d.code === "E_TYPE" && d.pointer === "/components/component.tanstack-router/contexts",
    ),
  );

  // Non-string contexts item
  const nonStringContextItem = validateComponentRegistryOverlay({
    registryKind: "component",
    bootstrappedFromGuideVersion: "2.0.0",
    components: {
      "component.tanstack-router": {
        state: "preferred-default",
        contexts: ["web", 123, null],
      },
    },
  });
  assert.equal(nonStringContextItem.ok, false);
  assert.ok(
    nonStringContextItem.diagnostics.some(
      (d) => d.code === "E_TYPE" && d.pointer === "/components/component.tanstack-router/contexts/1",
    ),
  );
  assert.ok(
    nonStringContextItem.diagnostics.some(
      (d) => d.code === "E_TYPE" && d.pointer === "/components/component.tanstack-router/contexts/2",
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

  // Verify that empty platforms object fails schema validation (parity with validateProductOverlay)
  const emptyPlatformsFixture = {
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {},
  };
  assert.equal(validateProductOverlaySchema(emptyPlatformsFixture), false);

  const invalidDormantFixture = readJson(
    "contracts/product-overlay/v1/fixtures/invalid-dormant-no-revisit.json",
  );
  assert.equal(validateProductOverlaySchema(invalidDormantFixture), false);

  const invalidNotTargetedFixture = readJson(
    "contracts/product-overlay/v1/fixtures/invalid-not-targeted-no-rationale.json",
  );
  assert.equal(validateProductOverlaySchema(invalidNotTargetedFixture), false);

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

void test("product-overlay YAML parser fails closed on excessive nesting depth", () => {
  let deeplyNested = "root:\n";
  for (let i = 1; i <= 35; i++) {
    deeplyNested += `${"  ".repeat(i)}level_${String(i)}:\n`;
  }
  deeplyNested += `${"  ".repeat(36)}val: "deep"\n`;
  const result = validateProductOverlay(deeplyNested);
  assert.equal(result.ok, false);
  const parseError = result.diagnostics.find((d) => d.code === "E_PARSE_ERROR");
  assert.ok(parseError !== undefined, "must fail with E_PARSE_ERROR on excessive depth");
  assert.ok(parseError.message.includes("maximum nesting depth"));
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

void test("product and registry overlay validation rejects wrong schemaId, schemaVersion, or contractId", () => {
  const wrongProductSchemaId = validateProductOverlay({
    schemaId: "https://schemas.repo-template.dev/wrong.json",
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: { web: { role: "primary" } },
  });
  assert.equal(wrongProductSchemaId.ok, false);
  assert.ok(wrongProductSchemaId.diagnostics.some((d) => d.code === "E_INVALID_IDENTITY" && d.pointer === "/schemaId"));

  const wrongProductSchemaVer = validateProductOverlay({
    schemaVersion: "9.9.9",
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: { web: { role: "primary" } },
  });
  assert.equal(wrongProductSchemaVer.ok, false);
  assert.ok(wrongProductSchemaVer.diagnostics.some((d) => d.code === "E_INVALID_IDENTITY" && d.pointer === "/schemaVersion"));

  const wrongProductContractId = validateProductOverlay({
    contractId: "wrong/contract/id",
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: { web: { role: "primary" } },
  });
  assert.equal(wrongProductContractId.ok, false);
  assert.ok(wrongProductContractId.diagnostics.some((d) => d.code === "E_INVALID_IDENTITY" && d.pointer === "/contractId"));

  const wrongProvContractId = validateProductOverlay({
    provenance: {
      contractId: "wrong/contract/id",
      templateRelease: "2.0.0",
    },
    platforms: { web: { role: "primary" } },
  });
  assert.equal(wrongProvContractId.ok, false);
  assert.ok(wrongProvContractId.diagnostics.some((d) => d.code === "E_INVALID_IDENTITY" && d.pointer === "/provenance/contractId"));

  const wrongTechSchemaId = validateTechnologyRegistryOverlay({
    schemaId: "https://schemas.repo-template.dev/wrong.json",
    registryKind: "technology",
    bootstrappedFromGuideVersion: "2.0.0",
    technologies: {},
  });
  assert.equal(wrongTechSchemaId.ok, false);
  assert.ok(wrongTechSchemaId.diagnostics.some((d) => d.code === "E_INVALID_IDENTITY" && d.pointer === "/schemaId"));

  const wrongCompSchemaId = validateComponentRegistryOverlay({
    schemaId: "https://schemas.repo-template.dev/wrong.json",
    registryKind: "component",
    bootstrappedFromGuideVersion: "2.0.0",
    components: {},
  });
  assert.equal(wrongCompSchemaId.ok, false);
  assert.ok(wrongCompSchemaId.diagnostics.some((d) => d.code === "E_INVALID_IDENTITY" && d.pointer === "/schemaId"));
});

void test("technology and component registry overlays reject the opposite collection", () => {
  const techWithComponents = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    bootstrappedFromGuideVersion: "2.0.0",
    technologies: {},
    components: {
      "component.dbmate": { state: "preferred-default" },
    },
  });
  assert.equal(techWithComponents.ok, false);
  assert.ok(techWithComponents.diagnostics.some((d) => d.code === "E_UNKNOWN_PROPERTY" && d.pointer === "/components"));

  const compWithTechnologies = validateComponentRegistryOverlay({
    registryKind: "component",
    bootstrappedFromGuideVersion: "2.0.0",
    components: {},
    technologies: {
      "technology.typescript": { state: "preferred-default" },
    },
  });
  assert.equal(compWithTechnologies.ok, false);
  assert.ok(compWithTechnologies.diagnostics.some((d) => d.code === "E_UNKNOWN_PROPERTY" && d.pointer === "/technologies"));
});

void test("product overlay rejects platform priority 0 or negative", () => {
  const zeroPriority = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      web: { role: "primary", priority: 0 },
    },
  });
  assert.equal(zeroPriority.ok, false);
  assert.ok(zeroPriority.diagnostics.some((d) => d.code === "E_INVALID_PRIORITY" && d.pointer === "/platforms/web/priority"));

  const negPriority = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      web: { role: "primary", priority: -1 },
    },
  });
  assert.equal(negPriority.ok, false);
  assert.ok(negPriority.diagnostics.some((d) => d.code === "E_INVALID_PRIORITY" && d.pointer === "/platforms/web/priority"));
});

void test("overlay validation rejects whitespace-only triggers, rationales, and divergence fields", () => {
  const wsPlatformRationale = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      web: { role: "primary", rationale: "   " },
    },
  });
  assert.equal(wsPlatformRationale.ok, false);
  assert.ok(wsPlatformRationale.diagnostics.some((d) => d.code === "E_EMPTY_VALUE" && d.pointer === "/platforms/web/rationale"));

  const wsPlatformTrigger = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: {
      windows: { role: "dormant", revisitTrigger: "\t\n " },
    },
  });
  assert.equal(wsPlatformTrigger.ok, false);

  const wsTechRationale = validateTechnologyRegistryOverlay({
    registryKind: "technology",
    bootstrappedFromGuideVersion: "2.0.0",
    technologies: {
      "technology.ts": { state: "preferred-default", rationale: "  " },
    },
  });
  assert.equal(wsTechRationale.ok, false);
  assert.ok(wsTechRationale.diagnostics.some((d) => d.code === "E_EMPTY_VALUE" && d.pointer === "/technologies/technology.ts/rationale"));

  const wsDivergence = validateProductOverlay({
    bootstrappedFromGuideVersion: "2.0.0",
    platforms: { web: { role: "primary" } },
    grandfatheredDivergences: [
      {
        component: "comp",
        current: "curr",
        guideDefault: "def",
        rationale: "   ",
      },
    ],
  });
  assert.equal(wsDivergence.ok, false);
  assert.ok(wsDivergence.diagnostics.some((d) => d.code === "E_EMPTY_VALUE" && d.pointer === "/grandfatheredDivergences/0/rationale"));
});

void test("GitHub provenance URL validation rejects query, fragment, traversal, and suffix ambiguity", () => {
  const invalidUrls = [
    "https://github.com/spencer-shadley/repo-template/commit/7264863f88e452c7bedf439b91bf47dbbebc3e49?ref=master",
    "https://github.com/spencer-shadley/repo-template/commit/7264863f88e452c7bedf439b91bf47dbbebc3e49#heading",
    "https://github.com/spencer-shadley/repo-template/commit/7264863f88e452c7bedf439b91bf47dbbebc3e49/extra",
    "https://github.com/spencer-shadley/repo-template/commit/7264863f88e452c7bedf439b91bf47dbbebc3e49/../../tree/master",
    "https://github.com/spencer-shadley/repo-template/releases/tag/v2.2.0?raw=true",
    "https://github.com/spencer-shadley/repo-template/releases/tag/v2.2.0#section",
    "https://github.com/spencer-shadley/repo-template/releases/tag/v2.2.0/more",
    "http://github.com/spencer-shadley/repo-template/commit/7264863f88e452c7bedf439b91bf47dbbebc3e49",
    "https://gitlab.com/spencer-shadley/repo-template/commit/7264863f88e452c7bedf439b91bf47dbbebc3e49",
  ];

  for (const url of invalidUrls) {
    assert.equal(isImmutableGitHubUrl(url), false, `expected isImmutableGitHubUrl('${url}') to be false`);
    assert.equal(isImmutableProvenance(url), false, `expected isImmutableProvenance('${url}') to be false`);

    const res = validateProductOverlay({
      bootstrappedFromGuideVersion: url,
      platforms: { web: { role: "primary" } },
    });
    assert.equal(res.ok, false, `expected validateProductOverlay with '${url}' to fail`);
  }
});

void test("materializeProductOverlayEntries throws on invalid options before payload generation", () => {
  assert.throws(
    () => {
      materializeProductOverlayEntries(FULL_STACK_PROFILE, {
        platforms: {
          web: { role: "non-existent" as any },
        },
      });
    },
    /Failed to generate valid product overlay/,
  );

  assert.throws(
    () => {
      materializeProductOverlayEntries(FULL_STACK_PROFILE, {
        platforms: {
          windows: { role: "dormant" },
        },
      });
    },
    /Failed to generate valid product overlay/,
  );

  assert.throws(
    () => {
      materializeProductOverlayEntries(FULL_STACK_PROFILE, {
        provenance: {
          templateRelease: "https://github.com/spencer-shadley/repo-template/tree/main",
        },
      });
    },
    /Failed to generate valid product overlay/,
  );
});

