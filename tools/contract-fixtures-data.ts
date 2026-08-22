import {
  CONTRACT_VERSION,
  DELIVERY_ANTI_GAMING_EXCLUSIONS,
  DELIVERY_COVERAGE_FIELDS,
  DELIVERY_MEASUREMENT_CONTRACT_ID,
  DELIVERY_SLI_IDS,
  DELIVERY_STAGES,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type DeliveryDeclarationV1,
  type DeliveryEventV1,
} from "../packages/adoption-shell/src/index.ts";
import {
  bundle,
  fileEntry,
  input,
  reference,
  registry,
  release,
  textEntry,
} from "./generate-contract-fixtures.ts";

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const baseEntry = textEntry(
  "README.md",
  "# Generic shell\n\nTarget-specific setup happens after materialization.\n",
  "generic-base-text",
  null,
);

export const deliveryEventFixture: DeliveryEventV1 = {
  schemaId: SCHEMA_IDS.deliveryEvent,
  schemaVersion: CONTRACT_VERSION,
  schemaDigest: SCHEMA_DIGESTS.deliveryEvent,
  contractId: DELIVERY_MEASUREMENT_CONTRACT_ID,
  eventKind: "repo-template/delivery-event/v1",
  eventId: "event:fixture:delivery-001",
  workId: "work:fixture:001",
  repoRef: "repo:spencer-shadley/repo-template",
  planeRef: "plane:engineering",
  fleetRef: "fleet:spencer-shadley",
  recordedAt: "2026-07-24T18:00:00Z",
  tokenUsage: [
    {
      attributionId: "usage:fixture:implementation",
      stage: "implementation",
      provider: "provider:fixture",
      model: "model:fixture",
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  ],
  outcome: {
    outcomeId: "outcome:fixture:001",
    status: "landed",
    receiptRef: "receipt:fixture:landing",
    meaningful: true,
    meaningfulClass: "portable-standard-capability",
    weight: 1,
    qualifyingEvidence: [
      {
        kind: "capability",
        verificationRef: "verification:fixture:gate",
      },
    ],
    activityRefs: [
      "commit:fixture:source",
      "receipt:fixture:landing",
    ],
  },
  sloDeltas: [
    {
      sloRef: "slo:fixture:portable-standard",
      measuredDelta: 1,
      verified: true,
      verificationRef: "verification:fixture:slo",
    },
  ],
  humanMessages: [
    {
      messageId: "message:fixture:001",
      kind: "decide",
      primaryWorkId: "work:fixture:001",
      relatedRefs: [],
    },
  ],
  coverage: {
    complete: true,
    errors: [],
  },
};

export const deliveryDeclarationFixture: DeliveryDeclarationV1 = {
  schemaId: SCHEMA_IDS.deliveryDeclaration,
  schemaVersion: CONTRACT_VERSION,
  schemaDigest: SCHEMA_DIGESTS.deliveryDeclaration,
  contractId: DELIVERY_MEASUREMENT_CONTRACT_ID,
  declarationKind: "repo-template/delivery-declaration/v1",
  classificationGeneration: "classification:fixture:g0001",
  repoBinding: {
    repoRef: "repo:spencer-shadley/repo-template",
    planeRef: "plane:engineering",
    fleetRef: "fleet:spencer-shadley",
    registryGeneration: "registry:fixture:g0001",
    registryDigest: "0".repeat(64),
    centralRollupRef: "observatory:fixture:delivery-rollup",
  },
  meaningfulClasses: [
    {
      classId: "portable-standard-capability",
      description: "A verified portable repository capability available to downstream consumers.",
      evidenceKinds: ["capability"],
      aggregationMode: "segmented",
      weight: null,
    },
  ],
  antiGamingExclusions: DELIVERY_ANTI_GAMING_EXCLUSIONS,
  tokenAttribution: {
    stages: DELIVERY_STAGES,
    requireComplete: true,
    unattributedPolicy: "visible-coverage-error-in-totals",
  },
  slis: DELIVERY_SLI_IDS.map((id) => ({
    id,
    scopes: ["fleet", "plane", "repo"] as const,
    targetRef: `registry:fixture:target/${id}`,
    budgetRef: `registry:fixture:budget/${id}`,
    windowRef: `registry:fixture:window/${id}`,
    exceptionPolicyRef: `registry:fixture:exception/${id}`,
    revisitTrigger: `Revisit ${id} when attribution coverage or outcome classes change.`,
    centralRollupRef: `observatory:fixture:rollup/${id}`,
  })),
  eventCapture: {
    appendOnly: true,
    eventKind: "repo-template/delivery-event/v1",
    coverageErrorPolicy: "visible-non-blocking",
    requiredCoverage: DELIVERY_COVERAGE_FIELDS,
  },
};

export const alpha = bundle({
  id: "example/alpha",
  version: "1.0.0",
  dependencies: [],
  artifacts: ["features/alpha.txt"],
  fixtures: [],
  goldens: [],
  modes: [],
});
export const beta = bundle({
  id: "example/beta",
  version: "1.0.0",
  dependencies: [reference(alpha)],
  artifacts: ["features/beta.txt"],
  fixtures: [],
  goldens: [],
  modes: [],
});
export const multiInput = input(
  release([
    baseEntry,
    textEntry("features/alpha.txt", "alpha\n", "capability-config", alpha.id),
    textEntry("features/beta.txt", "beta\n", "capability-config", beta.id),
  ]),
  registry([alpha, beta]),
  [reference(beta)],
);

export const qualityLintArtifacts = [
  "docs/QUALITY-LINT.md",
  "eslint.config.ts",
  "local-ci.json",
  "scripts/verify-quality-lint-required.ts",
];
export const qualityLintBundle = bundle({
  id: "repo-template/quality-lint",
  version: "1.1.0",
  dependencies: [],
  artifacts: qualityLintArtifacts,
  fixtures: [],
  goldens: [],
  modes: [
    {
      id: "config",
      entrypoint: "eslint.config.ts",
      requiredPaths: qualityLintArtifacts,
    },
    {
      id: "presence",
      entrypoint: "scripts/verify-quality-lint-required.ts",
      requiredPaths: [
        "eslint.config.ts",
        "scripts/verify-quality-lint-required.ts",
      ],
    },
  ],
});
export const lintId = "repo-template/user-surface-lint";
export const lintArtifacts = [
  ".user-surface-lint.json",
  ".user-surface-lint.schema.json",
  "scripts/lint-user-surface-leaks.ts",
];
export const lintFixtures = [
  "tests/fixtures/user-surface-lint/allowlisted/config.json",
  "tests/fixtures/user-surface-lint/allowlisted/src/messages.js",
  "tests/fixtures/user-surface-lint/bad/config.json",
  "tests/fixtures/user-surface-lint/bad/src/messages.js",
  "tests/fixtures/user-surface-lint/declared-none/config.json",
  "tests/fixtures/user-surface-lint/empty/config.json",
  "tests/fixtures/user-surface-lint/error-codes/config.json",
  "tests/fixtures/user-surface-lint/error-codes/src/messages.js",
  "tests/fixtures/user-surface-lint/good/config.json",
  "tests/fixtures/user-surface-lint/good/src/messages.js",
  "tests/fixtures/user-surface-lint/regex-leak/config.json",
  "tests/fixtures/user-surface-lint/regex-leak/src/messages.js",
  "tests/fixtures/user-surface-lint/regex-safe/config.json",
  "tests/fixtures/user-surface-lint/regex-safe/src/messages.js",
  "tests/fixtures/user-surface-lint/source-leak/config.json",
  "tests/fixtures/user-surface-lint/source-leak/src/messages.js",
];
export const lintBundle = bundle({
  id: lintId,
  version: "2.6.0",
  dependencies: [],
  artifacts: lintArtifacts,
  fixtures: lintFixtures,
  goldens: [],
  modes: [
    {
      id: "config",
      entrypoint: "scripts/lint-user-surface-leaks.ts",
      requiredPaths: lintArtifacts,
    },
    {
      id: "self-test",
      entrypoint: "scripts/lint-user-surface-leaks.ts",
      requiredPaths: ["scripts/lint-user-surface-leaks.ts", ...lintFixtures],
    },
  ],
});
export const lintRegistry = registry([lintBundle]);
export const localCiId = "repo-template/local-ci-contract-v2";
export const localCiArtifacts = [
  "artifacts/adoption-shell-v2/local-ci-contract-v2.d.ts",
  "artifacts/adoption-shell-v2/local-ci-contract-v2.js",
  "contracts/local-ci/v2/local-ci-contract-v2.schema.json",
];
export const localCiFixtures = [
  "contracts/local-ci/v2/fixtures/invalid-duplicate-command-id.json",
  "contracts/local-ci/v2/fixtures/invalid-extra-effect.json",
  "contracts/local-ci/v2/fixtures/invalid-incomplete-env.json",
  "contracts/local-ci/v2/fixtures/invalid-malformed.json",
  "contracts/local-ci/v2/fixtures/invalid-missing-field.json",
  "contracts/local-ci/v2/fixtures/invalid-no-authoritative-gate.json",
  "contracts/local-ci/v2/fixtures/invalid-unsupported-version.json",
  "contracts/local-ci/v2/fixtures/legacy-invalid-v1.json",
  "contracts/local-ci/v2/fixtures/legacy-model-gateway-v1.json",
  "contracts/local-ci/v2/fixtures/legacy-repo-factory-v1.json",
  "contracts/local-ci/v2/fixtures/valid-local-ci-v2.json",
];
export const localCiBundle = bundle({
  id: localCiId,
  version: "2.0.0",
  dependencies: [],
  artifacts: localCiArtifacts,
  fixtures: localCiFixtures,
  goldens: [],
  modes: [{ id: "validate", entrypoint: "artifacts/adoption-shell-v2/local-ci-contract-v2.js", requiredPaths: [...localCiArtifacts, ...localCiFixtures].sort(compare) }],
});
export const localCiV3Id = "repo-template/local-ci-contract-v3";
export const localCiV3Artifacts = [
  "artifacts/adoption-shell-v2/local-ci-contract-v3.d.ts",
  "artifacts/adoption-shell-v2/local-ci-contract-v3.js",
  "artifacts/adoption-shell-v2/local-ci-outcome-v1.d.ts",
  "artifacts/adoption-shell-v2/local-ci-outcome-v1.js",
  "contracts/local-ci/v3/local-ci-contract-v3.schema.json",
  "contracts/local-ci/v3/local-ci-outcome-v1.schema.json",
];
export const localCiV3Fixtures = [
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
];
export const localCiV3Bundle = bundle({
  id: localCiV3Id,
  version: "3.0.0",
  dependencies: [reference(localCiBundle)],
  artifacts: localCiV3Artifacts,
  fixtures: localCiV3Fixtures,
  goldens: [],
  modes: [{ id: "validate", entrypoint: "artifacts/adoption-shell-v2/local-ci-contract-v3.js", requiredPaths: [...localCiV3Artifacts, ...localCiV3Fixtures].sort(compare) }],
});
export const proofOfDetectionId = "repo-template/proof-of-detection";
export const proofOfDetectionArtifacts = [
  ".runtime-artifact-registry.json",
  ".runtime-artifact-registry.schema.json",
  "scripts/check-runtime-artifact-registry.ts",
  "scripts/proof-of-detection/reference-detectors/fixtures/dark-hex.css",
  "scripts/proof-of-detection/reference-detectors/fixtures/dark-rgb.css",
  "scripts/proof-of-detection/reference-detectors/fixtures/light.css",
  "scripts/proof-of-detection/reference-detectors/theme-dual-mode-lint.ts",
  "scripts/proof-of-detection/run-meta-gate.ts",
];
export const proofOfDetectionBundle = bundle({
  id: proofOfDetectionId,
  version: "1.0.0",
  dependencies: [reference(localCiV3Bundle)],
  artifacts: proofOfDetectionArtifacts,
  fixtures: [],
  goldens: [],
  modes: [
    {
      id: "self-test",
      entrypoint: "scripts/proof-of-detection/run-meta-gate.ts",
      requiredPaths: proofOfDetectionArtifacts,
    },
  ],
});
export const portableCapabilityRegistry = registry([
  lintBundle,
  localCiBundle,
  localCiV3Bundle,
  proofOfDetectionBundle,
  qualityLintBundle,
]);
export const lintInput = input(
  release([
    baseEntry,
    ...lintArtifacts.map((portablePath) =>
      fileEntry(
        portablePath,
        portablePath.startsWith("scripts/")
          ? "capability-executable"
          : "capability-config",
        lintId,
      ),
    ),
    ...lintFixtures.map((portablePath) =>
      fileEntry(portablePath, "capability-fixture", lintId),
    ),
  ]),
  lintRegistry,
  [reference(lintBundle)],
);
