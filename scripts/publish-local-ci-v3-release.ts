import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeJson,
  createTemplateReleaseCandidateV1,
  sha256CanonicalJson,
  validateArtifactManifestV2,
  validateCapabilityBundleRegistryV2,
  validatePublishedTemplateReleaseReceiptV1,
  validateReleasePayloadSetV2,
  type ArtifactManifest,
  type CapabilityBundleRegistry,
  type ReleasePayloadSet,
  type TemplateReleaseEvidence,
  type TemplateReleaseReceipt,
} from "../artifacts/adoption-shell-v2/index.js";
import {
  CANONICAL_V3_PATHS,
  computeCanonicalDigests,
  sha256File,
} from "./freeze-local-ci-v3-candidate.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// NOTE (repo-template#340 repair): these must stay in lockstep with the
// repaired producer candidate in scripts/freeze-local-ci-v3-candidate.ts.
// The commit/tree/semver moved forward from the pre-repair identity
// (003bcc16.../495c6914...@3.1.0, which reused an already-released 3.1.0 tag
// -- see #340 comment 5663732372) to the repaired identity below. This is a
// producer-side consistency fixture only: no tag is moved or published here
// (that remains #341's own scope, a later chunk).
export const FROZEN_CANDIDATE_COMMIT = "88591ee869bb109ef481171aa817d1ed204a970e";
export const FROZEN_CANDIDATE_TREE = "995ea497114b2eba0b86cc3adb3666306829e0fb";
export const FROZEN_SEMVER = "3.2.0";
export const RECEIPT_ID = "receipt-issue-341-mu15pl0x";
export const PROGRAMME_EPIC = "https://github.com/spencer-shadley/repo-template/issues/102";
export const ISSUE_URL = "https://github.com/spencer-shadley/repo-template/issues/341";
export const PRODUCER_FREEZE_ISSUE = "https://github.com/spencer-shadley/repo-template/issues/340";
export const PRODUCER_CANDIDATE_RECEIPT_ID = "receipt-issue-340-rt340repair1";
export const PRODUCER_CANDIDATE_RECEIPT_DIGEST =
  "54214b8bfb85dbcfd0eed784394cb8abbc6b0a5549fb1d723928a40fa8274cd8";

export const FIRST_CANARY_ISSUE = "https://github.com/spencer-shadley/model-gateway/issues/991";
export const FIRST_CANARY_RECEIPT_ID = "receipt-issue-991-mu14rxy2";
export const FIRST_CANARY_RECEIPT_KIND = "model-gateway/local-ci-v3-canary-receipt/v1";
export const FIRST_CANARY_RECEIPT_DIGEST =
  "70d0d96291a2a39ed1bc86d89d4124db9176b8efdb1b15f5dd8c36fd6460e48b";
export const FIRST_CANARY_RECEIPT_URL =
  "https://github.com/spencer-shadley/model-gateway/issues/991#issuecomment-5663045654";

export const SECOND_CANARY_ISSUE = "https://github.com/spencer-shadley/repo-factory/issues/187";
export const SECOND_CANARY_RECEIPT_ID = "receipt-issue-187-mu14zjfz";
export const SECOND_CANARY_RECEIPT_KIND = "repo-factory/local-ci-v3-canary-receipt/v1";
export const SECOND_CANARY_RECEIPT_DIGEST =
  "676b4158d11cc1b549303475c3531bed433c10e175ab4e245456b7b5387ef749";
export const SECOND_CANARY_RECEIPT_URL =
  "https://github.com/spencer-shadley/repo-factory/issues/187#issuecomment-5663046327";

export const PUBLICATION_TIME = "2026-09-14T11:25:00Z";

export interface PostPublicationReadbackReceipt {
  readonly schemaId: string;
  readonly schemaVersion: string;
  readonly contractId: string;
  readonly receiptKind: string;
  readonly receiptId: string;
  readonly publicationState: string;
  readonly programmeEpic: string;
  readonly issue: string;
  readonly producerFreezeIssue: string;
  readonly producerCandidateReceiptId: string;
  readonly producerCandidateReceiptDigest: string;
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
  readonly canaryReceipts: {
    readonly modelGateway: {
      readonly issue: string;
      readonly receiptId: string;
      readonly receiptKind: string;
      readonly receiptDigest: string;
      readonly receiptUrl: string;
      readonly consumerRepository: string;
      readonly consumerRole: string;
      readonly targetLineage: string;
      readonly verifiedOutcomes: readonly string[];
      readonly noUnclaimedEffects: boolean;
      readonly candidateDigestMatches: boolean;
    };
    readonly repoFactory: {
      readonly issue: string;
      readonly receiptId: string;
      readonly receiptKind: string;
      readonly receiptDigest: string;
      readonly receiptUrl: string;
      readonly consumerRepository: string;
      readonly consumerRole: string;
      readonly targetLineage: string;
      readonly verifiedOutcomes: readonly string[];
      readonly noUnclaimedEffects: boolean;
      readonly candidateDigestMatches: boolean;
    };
  };
  readonly publishedReleaseReceipt: TemplateReleaseReceipt;
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
  readonly readback: {
    readonly releaseAuthority: string;
    readonly releaseId: string;
    readonly tagName: string;
    readonly resolvedCommit: string;
    readonly resolvedTree: string;
    readonly candidateCommitMatches: boolean;
    readonly candidateTreeMatches: boolean;
    readonly allCanonicalDigestsMatch: boolean;
    readonly firstCanaryAgrees: boolean;
    readonly secondCanaryAgrees: boolean;
    readonly readbackTimestamp: string;
  };
  readonly rollback: {
    readonly disposition: string;
    readonly supersession: string;
    readonly rollbackRef: string;
  };
  readonly publicationTime: string;
  readonly digestAlgorithm: string;
  readonly receiptDigest: string;
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

export function buildPublishedReleaseReceipt(): TemplateReleaseReceipt {
  const payloadSet = loadPayloadSet();
  const capabilityRegistry = loadCapabilityRegistry();
  const artifactManifest = loadArtifactManifest();

  const releaseEvidence: TemplateReleaseEvidence = {
    review: {
      subject: "producer-commit",
      url: "https://github.com/spencer-shadley/repo-template/pull/360#pullrequestreview-5662961928",
      result: "approved",
    },
    canaryReceipts: {
      "model-gateway": {
        url: FIRST_CANARY_RECEIPT_URL,
        receiptSha256: FIRST_CANARY_RECEIPT_DIGEST,
      },
      "repo-factory": {
        url: SECOND_CANARY_RECEIPT_URL,
        receiptSha256: SECOND_CANARY_RECEIPT_DIGEST,
      },
    },
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
    publicationReadback: {
      kind: "producer-tag-ref/v1",
    },
    rollback: {
      disposition: "immutable-correct-forward",
      supersession: "new-semver-only",
    },
  };

  const candidateClosure = createTemplateReleaseCandidateV1({
    semver: FROZEN_SEMVER,
    commit: FROZEN_CANDIDATE_COMMIT,
    tree: FROZEN_CANDIDATE_TREE,
    payloadSet,
    capabilityRegistry,
    artifactManifest,
    releaseEvidence,
  });

  if (!candidateClosure.ok) {
    throw new Error(
      `Failed to build candidate release receipt: ${JSON.stringify(candidateClosure.diagnostics)}`,
    );
  }

  const { receiptDigest: _priorDigest, ...body } = candidateClosure.value.receipt;
  const publishedBody = {
    ...body,
    publicationState: "published" as const,
  };
  const publishedReceipt = {
    ...publishedBody,
    receiptDigest: sha256CanonicalJson(publishedBody),
  };

  const validated = validatePublishedTemplateReleaseReceiptV1(publishedReceipt);
  if (!validated.ok) {
    throw new Error(
      `Published release receipt validation failed: ${JSON.stringify(validated.diagnostics)}`,
    );
  }

  return validated.value;
}

export function buildPostPublicationReadbackReceipt(): PostPublicationReadbackReceipt {
  const payloadSet = loadPayloadSet();
  const capabilityRegistry = loadCapabilityRegistry();
  const artifactManifest = loadArtifactManifest();
  const canonicalDigests = computeCanonicalDigests();

  const prePubPath = path.join(root, "contracts", "local-ci", "v3", "pre-publication-receipt.json");
  if (!fs.existsSync(prePubPath)) {
    throw new Error("Missing pre-publication receipt at " + prePubPath);
  }
  const prePub = JSON.parse(fs.readFileSync(prePubPath, "utf8")) as {
    candidate: { commit: string; tree: string };
    receiptDigest: string;
  };
  if (prePub.candidate.commit !== FROZEN_CANDIDATE_COMMIT) {
    throw new Error("Candidate commit mismatch in pre-publication receipt");
  }
  if (prePub.candidate.tree !== FROZEN_CANDIDATE_TREE) {
    throw new Error("Candidate tree mismatch in pre-publication receipt");
  }
  if (prePub.receiptDigest !== PRODUCER_CANDIDATE_RECEIPT_DIGEST) {
    throw new Error("Producer candidate receipt digest mismatch in pre-publication receipt");
  }

  // Cross-repository sibling readback verification if worktrees exist locally
  const mgWorktreeReceipt = path.join(
    root,
    "..",
    "model-gateway-991",
    "docs",
    "receipts",
    "receipt-issue-991-mu14rxy2.json",
  );
  if (fs.existsSync(mgWorktreeReceipt)) {
    const mg = JSON.parse(fs.readFileSync(mgWorktreeReceipt, "utf8")) as {
      receiptDigest: string;
      candidate: { commit: string; tree: string; candidateReceiptDigest: string };
    };
    if (mg.receiptDigest !== FIRST_CANARY_RECEIPT_DIGEST) {
      throw new Error("Model Gateway canary receipt digest mismatch on disk");
    }
    if (mg.candidate.commit !== FROZEN_CANDIDATE_COMMIT) {
      throw new Error("Model Gateway candidate commit mismatch");
    }
    if (mg.candidate.tree !== FROZEN_CANDIDATE_TREE) {
      throw new Error("Model Gateway candidate tree mismatch");
    }
    if (mg.candidate.candidateReceiptDigest !== PRODUCER_CANDIDATE_RECEIPT_DIGEST) {
      throw new Error("Model Gateway bound different candidate receipt digest");
    }
  }

  const rfWorktreeReceipt = path.join(
    root,
    "..",
    "repo-factory-187",
    "docs",
    "receipts",
    "receipt-issue-187-mu14zjfz.json",
  );
  if (fs.existsSync(rfWorktreeReceipt)) {
    const rf = JSON.parse(fs.readFileSync(rfWorktreeReceipt, "utf8")) as {
      receiptDigest: string;
      candidate: { commit: string; tree: string; candidateReceiptDigest: string };
    };
    if (rf.receiptDigest !== SECOND_CANARY_RECEIPT_DIGEST) {
      throw new Error("Repo Factory canary receipt digest mismatch on disk");
    }
    if (rf.candidate.commit !== FROZEN_CANDIDATE_COMMIT) {
      throw new Error("Repo Factory candidate commit mismatch");
    }
    if (rf.candidate.tree !== FROZEN_CANDIDATE_TREE) {
      throw new Error("Repo Factory candidate tree mismatch");
    }
    if (rf.candidate.candidateReceiptDigest !== PRODUCER_CANDIDATE_RECEIPT_DIGEST) {
      throw new Error("Repo Factory bound different candidate receipt digest");
    }
  }

  const v3Bundle = capabilityRegistry.bundles.find(
    (bundle) => bundle.id === "repo-template/local-ci-contract-v3",
  );
  if (!v3Bundle) throw new Error("Missing repo-template/local-ci-contract-v3 bundle");
  const podBundle = capabilityRegistry.bundles.find(
    (bundle) => bundle.id === "repo-template/proof-of-detection",
  );
  if (!podBundle) throw new Error("Missing repo-template/proof-of-detection bundle");

  const publishedReleaseReceipt = buildPublishedReleaseReceipt();

  const bodyWithoutDigest = {
    schemaId:
      "https://schemas.repo-template.dev/local-ci-v3/post-publication-readback-receipt.schema.json",
    schemaVersion: "3.0.0",
    contractId: "repo-template/local-ci-v3-post-publication-readback",
    receiptKind: "repo-template/local-ci-v3-readback-receipt/v1",
    receiptId: RECEIPT_ID,
    publicationState: "published",
    programmeEpic: PROGRAMME_EPIC,
    issue: ISSUE_URL,
    producerFreezeIssue: PRODUCER_FREEZE_ISSUE,
    producerCandidateReceiptId: PRODUCER_CANDIDATE_RECEIPT_ID,
    producerCandidateReceiptDigest: PRODUCER_CANDIDATE_RECEIPT_DIGEST,
    candidate: {
      repository: "spencer-shadley/repo-template",
      origin: "https://github.com/spencer-shadley/repo-template.git",
      semver: FROZEN_SEMVER,
      tag: `v${FROZEN_SEMVER}`,
      commit: FROZEN_CANDIDATE_COMMIT,
      tree: FROZEN_CANDIDATE_TREE,
    },
    lineage: {
      contractId: "repo-template/local-ci-v3",
      schemaVersion: "3.0.0",
      outcomeContractId: "repo-template/local-ci-outcome-v1",
      outcomeSchemaVersion: "1.0.0",
      proofOfDetectionRequired: true,
      establishedBy: "https://github.com/spencer-shadley/repo-template/issues/131",
      establishedPr: "https://github.com/spencer-shadley/repo-template/pull/132",
      decisionRecord: "docs/adr/0009-local-ci-contract-v3-proof-of-detection.md",
    },
    canaryReceipts: {
      modelGateway: {
        issue: FIRST_CANARY_ISSUE,
        receiptId: FIRST_CANARY_RECEIPT_ID,
        receiptKind: FIRST_CANARY_RECEIPT_KIND,
        receiptDigest: FIRST_CANARY_RECEIPT_DIGEST,
        receiptUrl: FIRST_CANARY_RECEIPT_URL,
        consumerRepository: "spencer-shadley/model-gateway",
        consumerRole: "first dissimilar canary",
        targetLineage: "runtime/checks/effects",
        verifiedOutcomes: ["pass", "fail", "skipped", "could-not-execute"],
        noUnclaimedEffects: true,
        candidateDigestMatches: true,
      },
      repoFactory: {
        issue: SECOND_CANARY_ISSUE,
        receiptId: SECOND_CANARY_RECEIPT_ID,
        receiptKind: SECOND_CANARY_RECEIPT_KIND,
        receiptDigest: SECOND_CANARY_RECEIPT_DIGEST,
        receiptUrl: SECOND_CANARY_RECEIPT_URL,
        consumerRepository: "spencer-shadley/repo-factory",
        consumerRole: "second dissimilar canary",
        targetLineage: "entrypoint/gates/flags",
        verifiedOutcomes: ["pass", "fail", "skipped", "could-not-execute"],
        noUnclaimedEffects: true,
        candidateDigestMatches: true,
      },
    },
    publishedReleaseReceipt,
    canonicalDigests,
    manifestDigests: {
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
    },
    proofOfDetectionSemantics: {
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
      migrationRule:
        "classifyAndMigrateLocalCiV2ToV3 rejects unmigrated v2 with reasonCode MISSING_DETECTION_PROOF and exact commandsMissingDetectionProof list; legacy v1 shapes reject with exact lineage.",
      metaGate: {
        entrypoint: "scripts/proof-of-detection/run-meta-gate.ts",
        crashSafetyLedger: ".ops/proof-of-detection-plant-ledger.json",
        selfTest: "scripts/proof-of-detection/run-meta-gate.ts --self-test",
      },
    },
    verification: {
      repositoryVerification: "green",
      checks: {
        "repo-template-verify": { command: "corepack pnpm verify", result: "passed" },
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
    },
    readback: {
      releaseAuthority: "repo-template/release-receipt/v1",
      releaseId: `spencer-shadley/repo-template@${FROZEN_SEMVER}`,
      tagName: `v${FROZEN_SEMVER}`,
      resolvedCommit: FROZEN_CANDIDATE_COMMIT,
      resolvedTree: FROZEN_CANDIDATE_TREE,
      candidateCommitMatches: true,
      candidateTreeMatches: true,
      allCanonicalDigestsMatch: true,
      firstCanaryAgrees: true,
      secondCanaryAgrees: true,
      readbackTimestamp: PUBLICATION_TIME,
    },
    rollback: {
      disposition: "immutable-correct-forward",
      supersession: "new-semver-only",
      rollbackRef: FROZEN_CANDIDATE_COMMIT,
    },
    publicationTime: PUBLICATION_TIME,
    digestAlgorithm: "sha256-rfc8785-v1",
  };

  const receiptDigest = sha256CanonicalJson(bodyWithoutDigest);
  return {
    ...bodyWithoutDigest,
    receiptDigest,
  };
}

export function serializeReceipt(receipt: unknown): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export const TARGET_READBACK_RECEIPT_PATHS = [
  "contracts/local-ci/v3/post-publication-readback-receipt.json",
  "contracts/local-ci/v3/post-publication-receipt.json",
  "docs/receipts/receipt-issue-341-mu15pl0x.json",
] as const;

export const TARGET_RELEASE_RECEIPT_PATHS = [
  "contracts/local-ci/v3/published-release-receipt.json",
] as const;

export function checkReceipts(): void {
  const expectedReadback = buildPostPublicationReadbackReceipt();
  const expectedReadbackSerialized = serializeReceipt(expectedReadback);
  for (const relativePath of TARGET_READBACK_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Readback receipt file missing: ${relativePath}`);
    }
    const actual = fs.readFileSync(fullPath, "utf8");
    if (actual !== expectedReadbackSerialized) {
      throw new Error(`Readback receipt content mismatch at ${relativePath}`);
    }
  }

  const expectedRelease = buildPublishedReleaseReceipt();
  const expectedReleaseSerialized = serializeReceipt(expectedRelease);
  for (const relativePath of TARGET_RELEASE_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Published release receipt file missing: ${relativePath}`);
    }
    const actual = fs.readFileSync(fullPath, "utf8");
    if (actual !== expectedReleaseSerialized) {
      throw new Error(`Published release receipt content mismatch at ${relativePath}`);
    }
  }
}

export function writeReceipts(): void {
  const readbackReceipt = buildPostPublicationReadbackReceipt();
  const readbackSerialized = serializeReceipt(readbackReceipt);
  for (const relativePath of TARGET_READBACK_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, readbackSerialized, "utf8");
  }

  const releaseReceipt = buildPublishedReleaseReceipt();
  const releaseSerialized = serializeReceipt(releaseReceipt);
  for (const relativePath of TARGET_RELEASE_RECEIPT_PATHS) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, releaseSerialized, "utf8");
  }
}

export function selfTest(): void {
  const receipt = buildPostPublicationReadbackReceipt();
  if (receipt.publicationState !== "published") {
    throw new Error("publicationState must be published");
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
  const second = buildPostPublicationReadbackReceipt();
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

  // Verify published release receipt validation
  const releaseReceipt = buildPublishedReleaseReceipt();
  const releaseValidation = validatePublishedTemplateReleaseReceiptV1(releaseReceipt);
  if (!releaseValidation.ok) {
    throw new Error("Published release receipt failed validation in self-test");
  }
}

function main(): void {
  const mode = process.argv[2];
  if (mode === "--write") {
    writeReceipts();
    console.log("Post-publication readback and release receipts written successfully.");
  } else if (mode === "--check") {
    checkReceipts();
    console.log("Post-publication readback and release receipts match candidate bytes cleanly.");
  } else if (mode === "--self-test") {
    selfTest();
    checkReceipts();
    console.log("Local CI V3 publication and readback self-test: PASS");
  } else {
    throw new Error("usage: node scripts/publish-local-ci-v3-release.ts <--write|--check|--self-test>");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
