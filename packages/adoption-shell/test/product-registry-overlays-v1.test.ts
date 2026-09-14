import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  PRODUCT_OVERLAY_CONTRACT_ID,
  PRODUCT_OVERLAY_SCHEMA_ID,
  TECHNOLOGY_REGISTRY_OVERLAY_CONTRACT_ID,
  TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID,
  COMPONENT_REGISTRY_OVERLAY_CONTRACT_ID,
  COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID,
  PRODUCT_OVERLAY_ROLES,
  REGISTRY_LIFECYCLE_VALUES,
  parseOverlayYaml,
  validateProductOverlay,
  validateTechnologyRegistryOverlay,
  validateComponentRegistryOverlay,
  isMutableBranchReference,
  AdoptionShellValidationError,
  materializeAdoptionShellV2,
  validateMaterializerInputV2,
  canonicalizeJson,
} from "../src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const overlaysDir = path.join(root, "contracts", "overlays", "v1");
const fixturesDir = path.join(overlaysDir, "fixtures");

function isJsonSchema(value: unknown): value is AnySchema {
  return (
    typeof value === "boolean" ||
    (value !== null && typeof value === "object" && !Array.isArray(value))
  );
}

function createSchemaValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    strictSchema: true,
    strictTypes: false,
  });
  // @ts-expect-error ajv-formats typing
  addFormats(ajv);

  const productSchema = JSON.parse(
    fs.readFileSync(path.join(overlaysDir, "product-overlay.schema.json"), "utf8"),
  );
  const techSchema = JSON.parse(
    fs.readFileSync(path.join(overlaysDir, "technology-registry.overlay.schema.json"), "utf8"),
  );
  const compSchema = JSON.parse(
    fs.readFileSync(path.join(overlaysDir, "component-registry.overlay.schema.json"), "utf8"),
  );

  ajv.addSchema(productSchema);
  ajv.addSchema(techSchema);
  ajv.addSchema(compSchema);

  return {
    productValidator: ajv.compile(productSchema),
    techValidator: ajv.compile(techSchema),
    compValidator: ajv.compile(compSchema),
  };
}

void test("JSON Schema compilation and valid fixture conformance", () => {
  const { productValidator, techValidator, compValidator } = createSchemaValidators();

  // 1. Valid Product Overlay fixture
  const validProductRaw = fs.readFileSync(path.join(fixturesDir, "valid-product-overlay.yaml"), "utf8");
  const validProduct = parseOverlayYaml(validProductRaw);
  assert.equal(productValidator(validProduct), true, "valid-product-overlay.yaml must pass JSON Schema");
  const productRes = validateProductOverlay(validProduct);
  assert.equal(productRes.ok, true);

  // 2. Valid Technology Registry fixture
  const validTechRaw = fs.readFileSync(path.join(fixturesDir, "valid-technology-registry.overlay.yaml"), "utf8");
  const validTech = parseOverlayYaml(validTechRaw);
  assert.equal(techValidator(validTech), true, "valid-technology-registry.overlay.yaml must pass JSON Schema");
  const techRes = validateTechnologyRegistryOverlay(validTech);
  assert.equal(techRes.ok, true);

  // 3. Valid Component Registry fixture
  const validCompRaw = fs.readFileSync(path.join(fixturesDir, "valid-component-registry.overlay.yaml"), "utf8");
  const validComp = parseOverlayYaml(validCompRaw);
  assert.equal(compValidator(validComp), true, "valid-component-registry.overlay.yaml must pass JSON Schema");
  const compRes = validateComponentRegistryOverlay(validComp);
  assert.equal(compRes.ok, true);

  // 4. Root repository scaffolding files
  const rootProduct = parseOverlayYaml(fs.readFileSync(path.join(root, "product-overlay.yaml"), "utf8"));
  assert.equal(productValidator(rootProduct), true, "root product-overlay.yaml must pass schema");
  assert.equal(validateProductOverlay(rootProduct).ok, true);

  const rootTech = parseOverlayYaml(fs.readFileSync(path.join(root, "technology-registry.overlay.yaml"), "utf8"));
  assert.equal(techValidator(rootTech), true, "root technology-registry.overlay.yaml must pass schema");
  assert.equal(validateTechnologyRegistryOverlay(rootTech).ok, true);

  const rootComp = parseOverlayYaml(fs.readFileSync(path.join(root, "component-registry.overlay.yaml"), "utf8"));
  assert.equal(compValidator(rootComp), true, "root component-registry.overlay.yaml must pass schema");
  assert.equal(validateComponentRegistryOverlay(rootComp).ok, true);
});

void test("platform roles vocabulary and constraints", () => {
  const baseValidOverlay = {
    schemaVersion: "product-overlay/v1",
    contractId: PRODUCT_OVERLAY_CONTRACT_ID,
    profile: "test-profile",
    provenance: {
      templateRelease: {
        repository: "spencer-shadley/repo-template",
        semver: "1.0.0",
        releaseDigest: "a".repeat(64),
      },
    },
    platforms: {},
  };

  // Every allowed role is valid
  for (const role of PRODUCT_OVERLAY_ROLES) {
    const overlay = {
      ...baseValidOverlay,
      platforms: {
        testPlatform: {
          role,
          priority: 1,
          owner: "test-owner",
          acceptanceSuites: ["unit"],
          ...(role === "dormant" ? { revisitTrigger: "revisit quarterly" } : {}),
          ...(role === "not-targeted" ? { rationale: "not needed" } : {}),
        },
      },
    };
    const result = validateProductOverlay(overlay);
    assert.equal(result.ok, true, `role ${role} should be valid`);
  }

  // Unknown role fails with E_OVERLAY_ROLE
  const invalidRoleOverlay = {
    ...baseValidOverlay,
    platforms: {
      testPlatform: {
        role: "experimental",
        priority: 1,
        owner: "test-owner",
        acceptanceSuites: [],
      },
    },
  };
  const roleResult = validateProductOverlay(invalidRoleOverlay);
  assert.equal(roleResult.ok, false);
  assert.ok(roleResult.diagnostics.some((d) => d.code === "E_OVERLAY_ROLE"));

  // Dormant role without revisitTrigger fails with E_DORMANT_REVISIT_TRIGGER
  const invalidDormantOverlay = {
    ...baseValidOverlay,
    platforms: {
      testPlatform: {
        role: "dormant",
        priority: 5,
        owner: "test-owner",
        acceptanceSuites: [],
      },
    },
  };
  const dormantResult = validateProductOverlay(invalidDormantOverlay);
  assert.equal(dormantResult.ok, false);
  assert.ok(dormantResult.diagnostics.some((d) => d.code === "E_DORMANT_REVISIT_TRIGGER"));

  // Dormant role with empty string revisitTrigger fails with E_DORMANT_REVISIT_TRIGGER
  const emptyDormantOverlay = {
    ...baseValidOverlay,
    platforms: {
      testPlatform: {
        role: "dormant",
        priority: 5,
        owner: "test-owner",
        acceptanceSuites: [],
        revisitTrigger: "   ",
      },
    },
  };
  const emptyDormantResult = validateProductOverlay(emptyDormantOverlay);
  assert.equal(emptyDormantResult.ok, false);
  assert.ok(emptyDormantResult.diagnostics.some((d) => d.code === "E_DORMANT_REVISIT_TRIGGER"));

  // Not-targeted role without rationale fails with E_NOT_TARGETED_RATIONALE
  const invalidNotTargetedOverlay = {
    ...baseValidOverlay,
    platforms: {
      testPlatform: {
        role: "not-targeted",
        priority: 6,
        owner: "test-owner",
        acceptanceSuites: [],
      },
    },
  };
  const notTargetedResult = validateProductOverlay(invalidNotTargetedOverlay);
  assert.equal(notTargetedResult.ok, false);
  assert.ok(notTargetedResult.diagnostics.some((d) => d.code === "E_NOT_TARGETED_RATIONALE"));
});

void test("technology and component registry lifecycles", () => {
  const baseTechOverlay = {
    schemaVersion: "technology-registry-overlay/v1",
    contractId: TECHNOLOGY_REGISTRY_OVERLAY_CONTRACT_ID,
    provenance: {
      templateRelease: {
        repository: "spencer-shadley/repo-template",
        semver: "1.0.0",
        releaseDigest: "a".repeat(64),
      },
    },
    technologies: [],
  };

  for (const lifecycle of REGISTRY_LIFECYCLE_VALUES) {
    const overlay = {
      ...baseTechOverlay,
      technologies: [
        {
          logicalId: "tech-1",
          lifecycle,
          priority: 1,
          rationale: "valid reason",
          ...(lifecycle === "candidate"
            ? {
                evaluation: {
                  owner: "team-a",
                  reviewTrigger: "6 months",
                  targetEvidence: "benchmarks",
                  exitCriteria: "adoption target",
                },
              }
            : {}),
        },
      ],
    };
    const res = validateTechnologyRegistryOverlay(overlay);
    assert.equal(res.ok, true, `lifecycle ${lifecycle} should be valid`);
  }

  // Invalid lifecycle fails with E_REGISTRY_LIFECYCLE
  const invalidLifecycleOverlay = {
    ...baseTechOverlay,
    technologies: [
      {
        logicalId: "tech-1",
        lifecycle: "deprecated-unsupported",
        priority: 1,
        rationale: "invalid lifecycle",
      },
    ],
  };
  const badRes = validateTechnologyRegistryOverlay(invalidLifecycleOverlay);
  assert.equal(badRes.ok, false);
  assert.ok(badRes.diagnostics.some((d) => d.code === "E_REGISTRY_LIFECYCLE"));
});

void test("immutable provenance rejects mutable branch references", () => {
  assert.equal(isMutableBranchReference("master"), true);
  assert.equal(isMutableBranchReference("main"), true);
  assert.equal(isMutableBranchReference("HEAD"), true);
  assert.equal(isMutableBranchReference("https://github.com/org/repo/blob/master/README.md"), true);
  assert.equal(isMutableBranchReference("agent-orchestrator/master"), true);
  assert.equal(isMutableBranchReference("1.2.3"), false);
  assert.equal(isMutableBranchReference("v2.0.0"), false);
  assert.equal(isMutableBranchReference("https://github.com/org/repo/releases/tag/v1.0.0"), false);

  const baseOverlay = {
    schemaVersion: "product-overlay/v1",
    contractId: PRODUCT_OVERLAY_CONTRACT_ID,
    profile: "test-profile",
    provenance: {
      templateRelease: {
        repository: "spencer-shadley/repo-template",
        semver: "1.0.0",
        releaseDigest: "a".repeat(64),
      },
    },
    platforms: {
      desktop: {
        role: "primary",
        priority: 1,
        owner: "team",
        acceptanceSuites: ["unit"],
      },
    },
  };

  // SemVer with branch ref fails
  const mutableSemver = {
    ...baseOverlay,
    provenance: {
      ...baseOverlay.provenance,
      templateRelease: {
        ...baseOverlay.provenance.templateRelease,
        semver: "master",
      },
    },
  };
  const semverRes = validateProductOverlay(mutableSemver);
  assert.equal(semverRes.ok, false);
  assert.ok(semverRes.diagnostics.some((d) => d.code === "E_PROVENANCE_INCOMPATIBLE"));

  // bootstrappedFromGuideVersion with branch ref fails
  const mutableGuide = {
    ...baseOverlay,
    provenance: {
      ...baseOverlay.provenance,
      bootstrappedFromGuideVersion: "https://github.com/org/repo/blob/main/GUIDE.md",
    },
  };
  const guideRes = validateProductOverlay(mutableGuide);
  assert.equal(guideRes.ok, false);
  assert.ok(guideRes.diagnostics.some((d) => d.code === "E_PROVENANCE_INCOMPATIBLE"));
});

void test("safe deterministic YAML parser", () => {
  const yaml = `
schemaVersion: "product-overlay/v1"
contractId: "repo-template/product-overlay-v1"
profile: "cli-tool"
priority: 42
active: true
items:
  - "alpha"
  - "beta"
platforms:
  cli:
    role: "primary"
    owner: "team"
`;
  const parsed = parseOverlayYaml(yaml) as Record<string, unknown>;
  assert.equal(parsed["schemaVersion"], "product-overlay/v1");
  assert.equal(parsed["contractId"], "repo-template/product-overlay-v1");
  assert.equal(parsed["profile"], "cli-tool");
  assert.equal(parsed["priority"], 42);
  assert.equal(parsed["active"], true);
  assert.deepEqual(parsed["items"], ["alpha", "beta"]);
  assert.deepEqual(parsed["platforms"], {
    cli: {
      role: "primary",
      owner: "team",
    },
  });
});

void test("deterministic materialization with overlays", () => {
  const input = JSON.parse(
    fs.readFileSync(path.join(root, "contracts", "adoption-shell-v2", "fixtures", "product-overlay-input.json"), "utf8"),
  );
  const before = JSON.stringify(input);
  const validation = validateMaterializerInputV2(input);
  assert.equal(validation.ok, true);

  const first = materializeAdoptionShellV2(input);
  const second = materializeAdoptionShellV2(JSON.parse(before));
  assert.equal(JSON.stringify(input), before, "input must not be mutated");
  assert.equal(canonicalizeJson(first), canonicalizeJson(second));
  assert.ok(first.entries.some((e) => e.path === "product-overlay.yaml"));
  assert.ok(first.entries.some((e) => e.path === "technology-registry.overlay.yaml"));
  assert.ok(first.entries.some((e) => e.path === "component-registry.overlay.yaml"));
});
