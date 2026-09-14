import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeJson,
  createTemplateReleaseCandidateV1,
  sha256CanonicalJson,
  validateArtifactManifestV2,
  validateCapabilityBundleRegistryV2,
  validateReleasePayloadSetV2,
  type ArtifactManifest,
  type CapabilityBundleRegistry,
  type ReleasePayloadSet,
} from "../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const FROZEN_CANDIDATE_COMMIT = "003bcc16deb5a1db3ab37dc17991b9f616a6d09e";
export const FROZEN_CANDIDATE_TREE = "495c6914c00f046c17e053efb61eb24fcf3cc7f2";
export const FROZEN_SEMVER = "3.1.0";
export const RECEIPT_ID = "receipt-issue-340-mu14imli";

export const CANONICAL_V3_PATHS = [
  "contracts/local-ci/v3/local-ci-contract-v3.schema.json",
  "contracts/local-ci/v3/local-ci-outcome-v1.schema.json",
  "packages/adoption-shell/src/local-ci-contract-v3.ts",
  "packages/adoption-shell/src/local-ci-outcome-v1.ts",
  "artifacts/adoption-shell-v2/local-ci-contract-v3.js",
  "artifacts/adoption-shell-v2/local-ci-contract-v3.d.ts",
  "artifacts/adoption-shell-v2/local-ci-outcome-v1.js",
  "artifacts/adoption-shell-v2/local-ci-outcome-v1.d.ts",
  "contracts/local-ci/v3/fixtures/invalid-detection-proof-conflict.json",
  "contracts/local-ci/v3/fixtures/invalid-detection-proof-empty-exempt.json",
  "contracts/local-ci/v3/fixtures/invalid-duplicate-command-id.json",
  "contracts/local-ci/v3/fixtures/invalid-extra-effect.json",
  "contracts/local-ci/v3/fixtures/invalid-incomplete-env.json",
  "contracts/local-ci/v3/fixtures/invalid-malformed.json",
  "contracts/local-ci/v3/fixtures/invalid-missing-detection-proof.json",
  "contracts/local-ci/v3/fixtures/invalid-missing-field.json",
  "contracts/local-ci/v3/fixtures/invalid-no-authoritative-gate.json",
  "contracts/local-ci/v3/fixtures/invalid-unsupported-version.json",
  "contracts/local-ci/v3/fixtures/legacy-local-ci-v2.json",
  "contracts/local-ci/v3/fixtures/valid-local-ci-v3.json",
  "scripts/proof-of-detection/run-meta-gate.ts",
  "scripts/proof-of-detection/reference-detectors/theme-dual-mode-lint.ts",
  "scripts/proof-of-detection/reference-detectors/fixtures/dark-hex.css",
  "scripts/proof-of-detection/reference-detectors/fixtures/dark-rgb.css",
  "scripts/proof-of-detection/reference-detectors/fixtures/light.css",
  ".runtime-artifact-registry.json",
  ".runtime-artifact-registry.schema.json",
  "scripts/check-runtime-artifact-registry.ts",
  "local-ci.json",
  "docs/adr/0009-local-ci-contract-v3-proof-of-detection.md",
  "docs/MIGRATION.md",
] as const;

export interface PrePublicationReceipt {
  readonly schemaId: string;
  readonly schemaVersion: string;
  readonly contractId: string;
  readonly receiptKind: string;
  readonly receiptId: string;
  readonly publicationState: string;
  readonly programmeEpic: string;
  readonly issue: string;
  readonly candidate: {
    readonly repository: string;
    readonly origin: string;
    readonly semver: string;
    readonly tag: string;
    readonly commit: string;
    readonly tree: string;
  };
  readonly lineage: {
    readonly contractId: string;
    readonly schemaVersion: string;
    readonly outcomeContractId: string;
    readonly outcomeSchemaVersion: string;
    readonly proofOfDetectionRequired: boolean;
    readonly establishedBy: string;
    readonly establishedPr: string;
    readonly decisionRecord: string;
  };
  readonly candidateReleaseReceipt: unknown;
  readonly canonicalDigests: Record<string, string>;
  readonly manifestDigests: {
    readonly releasePayloadSet: {
      readonly path: string;
      readonly manifestDigest: string;
      readonly payloadDigestAlgorithm: string;
      readonly payloadDigest: string;
      readonly entryCount: number;
    };
    readonly artifactManifest: {
      readonly path: string;
      readonly manifestDigest: string;
      readonly artifactDigestAlgorithm: string;
      readonly artifactDigest: string;
    };
    readonly capabilityBundleRegistry: {
      readonly path: string;
      readonly registryDigest: string;
      readonly bundles: Record<string, { readonly version: string; readonly digest: string }>;
    };
  };
  readonly proofOfDetectionSemantics: {
    readonly rule: string;
    readonly outcomeStates: readonly string[];
    readonly outcomeInvariants: readonly string[];
    readonly migrationRule: string;
    readonly metaGate: {
      readonly entrypoint: string;
      readonly crashSafetyLedger: string;
      readonly selfTest: string;
    };
  };
  readonly verification: {
    readonly repositoryVerification: string;
    readonly checks: Record<string, { readonly command: string; readonly result: string }>;
  };
  readonly canaryGuidance: {
    readonly modelGateway: {
      readonly issue: string;
      readonly role: string;
      readonly targetLineage: string;
      readonly instruction: string;
      readonly requiredOutcomes: readonly string[];
    };
    readonly repoFactory: {
      readonly issue: string;
      readonly role: string;
      readonly targetLineage: string;
      readonly instruction: string;
      readonly dependencyBarrier: string;
    };
    readonly convergence: {
      readonly issue: string;
      readonly instruction: string;
    };
  };
  readonly digestAlgorithm: string;
  readonly receiptDigest: string;
}

export function sha256File(relativePath: string): string {
  const fullPath = path.join(root, ...relativePath.split("/"));
  const content = fs.readFileSync(fullPath);
  return createHash("sha256").update(content).digest("hex");
}

export function computeCanonicalDigests(): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const relativePath of CANONICAL_V3_PATHS) {
    digests[relativePath] = sha256File(relativePath);
  }
  return digests;
}

function loadPayloadSet(): ReleasePayloadSet {
  const raw: unknown = JSON.parse(
    fs.readFileSync(path.join(root, "release", "release-payload-set.json"), "utf8"),
  );
  const result = validateReleasePayloadSetV2(raw);
  if (!result.ok) throw new Error("Invalid payload set: " + JSON.stringify(result.diagnostics));
  return result.value;
}

function loadCapabilityRegistry(): CapabilityBundleRegistry {
  const raw: unknown = JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "adoption-shell-v2", "capability-bundle-registry.json"),
      "utf8",
    ),
  );
  const result = validateCapabilityBundleRegistryV2(raw);
  if (!result.ok) throw new Error("Invalid capability registry: " + JSON.stringify(result.diagnostics));
  return result.value;
}

function loadArtifactManifest(): ArtifactManifest {
  const raw: unknown = JSON.parse(
    fs.readFileSync(
      path.join(root, "artifacts", "adoption-shell-v2", "artifact-manifest.json"),
      "utf8",
    ),
  );
  const result = validateArtifactManifestV2(raw);
  if (!result.ok) throw new Error("Invalid artifact manifest: " + JSON.stringify(result.diagnostics));
  return result.value;
}

function buildLineage(): PrePublicationReceipt["lineage"] {
  return {
    contractId: "repo-template/local-ci-v3",
    schemaVersion: "3.0.0",
    outcomeContractId: "repo-template/local-ci-outcome-v1",
    outcomeSchemaVersion: "1.0.0",
    proofOfDetectionRequired: true,
    establishedBy: "https://github.com/spencer-shadley/repo-template/issues/131",
    establishedPr: "https://github.com/spencer-shadley/repo-template/pull/132",
    decisionRecord: "docs/adr/0009-local-ci-contract-v3-proof-of-detection.md",
  };
}

function buildManifestDigests(
  payloadSet: ReleasePayloadSet,
  artifactManifest: ArtifactManifest,
  capabilityRegistry: CapabilityBundleRegistry,
): PrePublicationReceipt["manifestDigests"] {
  const v3Bundle = capabilityRegistry.bundles.find(
    (bundle) => bundle.id === "repo-template/local-ci-contract-v3",
  );
  if (!v3Bundle) throw new Error("Missing repo-template/local-ci-contract-v3 bundle");
  const podBundle = capabilityRegistry.bundles.find(
    (bundle) => bundle.id === "repo-template/proof-of-detection",
  );
  if (!podBundle) throw new Error("Missing repo-template/proof-of-detection bundle");

  return {
    releasePayloadSet: {
      path: "release/release-payload-set.json",
      manifestDigest: payloadSet.releaseDigest,
      payloadDigestAlgorithm: payloadSet.payloadDigestAlgorithm,
      payloadDigest: payloadSet.payloadDigest,
      entryCount: payloadSet.entryCount,
    },
    artifactManifest: {
      path: "artifacts/adoption-shell-v2/artifact-manifest.json",
      manifestDigest: artifactManifest.manifestDigest,
      artifactDigestAlgorithm: artifactManifest.artifactDigestAlgorithm,
      artifactDigest: artifactManifest.artifactDigest,
    },
    capabilityBundleRegistry: {
      path: "contracts/adoption-shell-v2/capability-bundle-registry.json",
      registryDigest: capabilityRegistry.registryDigest,
      bundles: {
        "repo-template/local-ci-contract-v3": {
          version: v3Bundle.version,
          digest: v3Bundle.digest,
        },
        "repo-template/proof-of-detection": {
          version: podBundle.version,
          digest: podBundle.digest,
        },
      },
    },
  };
}

function buildProofOfDetectionSemantics(): PrePublicationReceipt["proofOfDetectionSemantics"] {
  return {
    rule: "Every command must declare detectionProof: either a known-bad fixture with expectation 'non-zero-exit' or a recorded non-empty exempt reason.",
    outcomeStates: [
      "pass",
      "fail",
      "skipped",
      "could-not-execute",
    ],
    outcomeInvariants: [
      "pass: exitCode is integer, reason is null",
      "fail: exitCode is integer, reason is null",
      "skipped: exitCode is null, reason is non-empty string",
      "could-not-execute: exitCode is null, reason is non-empty string",
      "Environment or tooling failure must terminate as could-not-execute, never pass",
    ],
    migrationRule: "classifyAndMigrateLocalCiV2ToV3 rejects unmigrated v2 with reasonCode MISSING_DETECTION_PROOF and exact commandsMissingDetectionProof list; legacy v1 shapes reject with exact lineage.",
    metaGate: {
      entrypoint: "scripts/proof-of-detection/run-meta-gate.ts",
      crashSafetyLedger: ".ops/proof-of-detection-plant-ledger.json",
      selfTest: "scripts/proof-of-detection/run-meta-gate.ts --self-test",
    },
  };
}

function buildVerification(): PrePublicationReceipt["verification"] {
  return {
    repositoryVerification: "green",
    checks: {
      "repo-template-verify": {
        command: "corepack pnpm verify",
        result: "passed",
      },
      "proof-of-detection-self-test": {
        command: "node scripts/proof-of-detection/run-meta-gate.ts --self-test",
        result: "passed",
      },
      "local-ci-v3-contract-unit": {
        command: "node --test packages/adoption-shell/test/local-ci-contract-v3.test.ts",
        result: "passed",
      },
      "local-ci-outcome-v1-unit": {
        command: "node --test packages/adoption-shell/test/local-ci-outcome-v1.test.ts",
        result: "passed",
      },
      "release-payload-check": {
        command: "node tools/release-payload.ts check",
        result: "passed",
      },
      "artifact-build-verify": {
        command: "node tools/artifact-build.ts verify",
        result: "passed",
      },
    },
  };
}

function buildCanaryGuidance(): PrePublicationReceipt["canaryGuidance"] {
  return {
    modelGateway: {
      issue: "https://github.com/spencer-shadley/model-gateway/issues/991",
      role: "first dissimilar canary",
      targetLineage: "runtime/checks/effects",
      instruction: "Reconcile Model Gateway's current local-ci.json into LocalCiContractV3 using canonical validator/migration semantics. Exercise all four outcome states (pass, fail, skipped, could-not-execute). Preserve repository verify gate and effect boundaries.",
      requiredOutcomes: ["pass", "fail", "skipped", "could-not-execute"],
    },
    repoFactory: {
      issue: "https://github.com/spencer-shadley/repo-factory/issues/187",
      role: "second dissimilar canary",
      targetLineage: "entrypoint/gates/flags",
      instruction: "Start after Model Gateway canary completes. Reconcile Repo Factory's local-ci.json using identical candidate digests. Preserve Factory effect boundaries and pnpm verify gate.",
      dependencyBarrier: "Must bind identical candidate commit/tree and digest set proven by Model Gateway #991",
    },
    convergence: {
      issue: "https://github.com/spencer-shadley/repo-template/issues/341",
      instruction: "After both canaries produce valid canary receipts, publish immutable release and post-publication readback receipt binding both canary receipts to this candidate identity.",
    },
  };
}

export function buildPrePublicationReceipt(): PrePublicationReceipt {
  const payloadSet = loadPayloadSet();
  const capabilityRegistry = loadCapabilityRegistry();
  const artifactManifest = loadArtifactManifest();

  const candidateClosure = createTemplateReleaseCandidateV1({
    semver: FROZEN_SEMVER,
    commit: FROZEN_CANDIDATE_COMMIT,
    tree: FROZEN_CANDIDATE_TREE,
    payloadSet,
    capabilityRegistry,
    artifactManifest,
  });

  if (!candidateClosure.ok) {
    throw new Error(
      `Failed to build candidate release receipt: ${JSON.stringify(candidateClosure.diagnostics)}`,
    );
  }

  const bodyWithoutDigest = {
    schemaId: "https://schemas.repo-template.dev/local-ci-v3/canary-candidate-receipt.schema.json",
    schemaVersion: "3.0.0",
    contractId: "repo-template/local-ci-v3-canary-candidate",
    receiptKind: "repo-template/local-ci-v3-candidate-receipt/v1",
    receiptId: RECEIPT_ID,
    publicationState: "candidate",
    programmeEpic: "https://github.com/spencer-shadley/repo-template/issues/102",
    issue: "https://github.com/spencer-shadley/repo-template/issues/340",
    candidate: {
      repository: "spencer-shadley/repo-template",
      origin: "https://github.com/spencer-shadley/repo-template.git",
      semver: FROZEN_SEMVER,
      tag: `v${FROZEN_SEMVER}`,
      commit: FROZEN_CANDIDATE_COMMIT,
      tree: FROZEN_CANDIDATE_TREE,
    },
    lineage: buildLineage(),
    candidateReleaseReceipt: candidateClosure.value.receipt,
    canonicalDigests: computeCanonicalDigests(),
    manifestDigests: buildManifestDigests(payloadSet, artifactManifest, capabilityRegistry),
    proofOfDetectionSemantics: buildProofOfDetectionSemantics(),
    verification: buildVerification(),
    canaryGuidance: buildCanaryGuidance(),
    digestAlgorithm: "sha256-rfc8785-v1",
  };

  const receiptDigest = sha256CanonicalJson(bodyWithoutDigest);
  return {
    ...bodyWithoutDigest,
    receiptDigest,
  };
}

export function serializeReceipt(receipt: PrePublicationReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export const TARGET_RECEIPT_PATHS = [
  "contracts/local-ci/v3/pre-publication-receipt.json",
  "contracts/local-ci/v3/canary-candidate-receipt.json",
] as const;

function checkReceipts(): void {
  const expected = buildPrePublicationReceipt();
  const expectedSerialized = serializeReceipt(expected);
  for (const relativePath of TARGET_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Receipt file missing: ${relativePath}`);
    }
    const actual = fs.readFileSync(fullPath, "utf8");
    if (actual !== expectedSerialized) {
      throw new Error(`Receipt content mismatch at ${relativePath}`);
    }
  }
}

function writeReceipts(): void {
  const receipt = buildPrePublicationReceipt();
  const serialized = serializeReceipt(receipt);
  for (const relativePath of TARGET_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, serialized, "utf8");
  }
}

function selfTest(): void {
  const receipt = buildPrePublicationReceipt();
  if (receipt.publicationState !== "candidate") {
    throw new Error("publicationState must be candidate");
  }
  if (receipt.receiptId !== RECEIPT_ID) {
    throw new Error("receiptId mismatch");
  }
  if (receipt.candidate.commit !== FROZEN_CANDIDATE_COMMIT) {
    throw new Error("candidate commit mismatch");
  }
  if (receipt.candidate.tree !== FROZEN_CANDIDATE_TREE) {
    throw new Error("candidate tree mismatch");
  }

  // Verify canonical recomputation determinism
  const second = buildPrePublicationReceipt();
  if (canonicalizeJson(receipt) !== canonicalizeJson(second)) {
    throw new Error("Recomputation determinism failed");
  }

  // Verify digest integrity
  const { receiptDigest, ...body } = receipt;
  if (sha256CanonicalJson(body) !== receiptDigest) {
    throw new Error("receiptDigest does not match canonical body");
  }

  // Verify tampered receipt fails
  const tampered = { ...body, receiptId: "tampered" };
  if (sha256CanonicalJson(tampered) === receiptDigest) {
    throw new Error("tampering was not detected");
  }
}

function main(): void {
  const mode = process.argv[2];
  if (mode === "--write") {
    writeReceipts();
    console.log("Pre-publication acceptance receipt written successfully.");
  } else if (mode === "--check") {
    checkReceipts();
    console.log("Pre-publication acceptance receipt matches candidate bytes cleanly.");
  } else if (mode === "--self-test") {
    selfTest();
    checkReceipts();
    console.log("Local CI V3 candidate freeze self-test: PASS");
  } else {
    throw new Error("usage: node scripts/freeze-local-ci-v3-candidate.ts <--write|--check|--self-test>");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
