import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeJson,
  createTemplateReleaseCandidateV1,
  sha256CanonicalJson,
  validatePublishedTemplateReleaseReceiptV1,
  type TemplateReleaseEvidence,
  type TemplateReleaseReceipt,
} from "../artifacts/adoption-shell-v2/index.js";
import {
  computeCanonicalDigests,
  loadFrozenArtifactManifest,
  loadFrozenCapabilityRegistry,
  loadFrozenPayloadSet,
  verifyFrozenPayloadSetReproducible,
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
  "e7021ea10b694f37b03275a7cbd9c9ea6ca0d3b72f1806c2e3ed50814897bb5d";

export const FIRST_CANARY_ISSUE = "https://github.com/spencer-shadley/model-gateway/issues/991";
export const FIRST_CANARY_RECEIPT_ID = "receipt-issue-991-mu14rxy2";
export const FIRST_CANARY_RECEIPT_KIND = "model-gateway/local-ci-v3-canary-receipt/v1";
export const FIRST_CANARY_RECEIPT_DIGEST =
  "65d52a0185353f8646943aa2e8cca6e7b2c04dc14a3bc7e3ec00be6788445f7b";
export const FIRST_CANARY_RECEIPT_URL =
  "https://github.com/spencer-shadley/model-gateway/issues/991#issuecomment-5677659016";

export const SECOND_CANARY_ISSUE = "https://github.com/spencer-shadley/repo-factory/issues/187";
export const SECOND_CANARY_RECEIPT_ID = "receipt-issue-187-mu14zjfz";
export const SECOND_CANARY_RECEIPT_KIND = "repo-factory/local-ci-v3-canary-receipt/v1";
export const SECOND_CANARY_RECEIPT_DIGEST =
  "0aa881725aea8258cb1879b4af83fb8655df364e4efc3ca7f0c8dc21ef0dab72";
export const SECOND_CANARY_RECEIPT_URL =
  "https://github.com/spencer-shadley/repo-factory/issues/187#issuecomment-5722794813";

export const PRODUCER_REVIEW_URL =
  "https://github.com/spencer-shadley/repo-template/pull/369#pullrequestreview-5206920572";

export const PUBLICATION_TIME = "2026-09-18T05:30:00Z";

/**
 * repo-template#364: a published tag/semver must equal VERSION and
 * TEMPLATE_VERSION bytes of the commit being published (read from that
 * commit, never the working tree).
 */
export function assertCommitVersionMatchesDeclaredSemver(
  commit: string,
  declaredSemver: string,
  runGitShow: (commitSha: string, pathName: string) => string,
): void {
  const version = runGitShow(commit, "VERSION").trim();
  const templateVersion = runGitShow(commit, "TEMPLATE_VERSION").trim();
  if (version !== templateVersion) {
    throw new Error(
      `Commit ${commit} declares VERSION=${version} but TEMPLATE_VERSION=${templateVersion}.`,
    );
  }
  if (version !== declaredSemver) {
    throw new Error(
      `Declared publication semver ${declaredSemver} disagrees with commit ${commit} VERSION/TEMPLATE_VERSION ${version}. Bump VERSION on the publication commit (repo-template#364) or retarget the tag.`,
    );
  }
}


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

// repo-template#340 (RT-340b): this script used to carry its own
// `fs.readFileSync` copies of these three loaders, so the published release
// receipt described the working tree while naming the frozen candidate commit
// -- the same defect the candidate freeze had. It now consumes the single
// frozen-tree implementation in scripts/freeze-local-ci-v3-candidate.ts.

export function buildPublishedReleaseReceipt(): TemplateReleaseReceipt {
  const payloadSet = loadFrozenPayloadSet();
  const capabilityRegistry = loadFrozenCapabilityRegistry();
  const artifactManifest = loadFrozenArtifactManifest();
  verifyFrozenPayloadSetReproducible(payloadSet);

  const releaseEvidence: TemplateReleaseEvidence = {
    review: {
      subject: "producer-commit",
      url: PRODUCER_REVIEW_URL,
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

export const VENDOR_MG_RECEIPT_PATH = "vendor/model-gateway/canary-receipt.json";
export const VENDOR_RF_RECEIPT_PATH = "vendor/repo-factory/canary-receipt.json";

function readValidatedTagReceipt(tagName: string): void {
  const rawTag = execFileSync("git", ["cat-file", "-p", `refs/tags/${tagName}`], {
    cwd: root,
    encoding: "utf8",
  });
  const headerEnd = rawTag.indexOf("\n\n");
  if (headerEnd === -1) {
    throw new Error(`Invalid annotated tag format for refs/tags/${tagName}`);
  }
  const tagMessage = rawTag.slice(headerEnd + 2).trim();
  const parsedReceipt: unknown = JSON.parse(tagMessage);
  const validated = validatePublishedTemplateReleaseReceiptV1(parsedReceipt);
  if (!validated.ok) {
    throw new Error(
      `Remote tag message is not a valid published release receipt: ${JSON.stringify(validated.diagnostics)}`,
    );
  }
}

let cachedRemotePeeledCommit: string | null = null;

function resolveRemotePeeledCommit(remote: string, tagName: string): string | null {
  if (cachedRemotePeeledCommit) return cachedRemotePeeledCommit;
  try {
    const lsRemote = execFileSync(
      "git",
      ["ls-remote", "--tags", remote, `refs/tags/${tagName}*`],
      { cwd: root, encoding: "utf8" },
    ).trim();
    if (!lsRemote) {
      throw new Error(`Remote tag refs/tags/${tagName} not found on remote ${remote}`);
    }
    for (const line of lsRemote.split("\n")) {
      const [sha, ref] = line.trim().split(/\s+/, 2);
      if (ref === `refs/tags/${tagName}^{}` && sha) {
        cachedRemotePeeledCommit = sha;
        return sha;
      }
    }
  } catch (error) {
    const localTag = execFileSync(
      "git",
      ["tag", "-l", tagName],
      { cwd: root, encoding: "utf8" },
    ).trim();
    if (localTag !== tagName) {
      throw new Error(`Tag ${tagName} not found remotely or locally: ${String(error)}`, { cause: error });
    }
  }
  return null;
}

export function performRemoteReadback(
  remote: string = "origin",
  tagName: string = `v${FROZEN_SEMVER}`,
): PostPublicationReadbackReceipt["readback"] {
  const remotePeeledCommit = resolveRemotePeeledCommit(remote, tagName);

  if (remotePeeledCommit && remotePeeledCommit !== FROZEN_CANDIDATE_COMMIT) {
    throw new Error(
      `Remote tag refs/tags/${tagName}^{} peeled commit ${remotePeeledCommit} does not match frozen candidate ${FROZEN_CANDIDATE_COMMIT}`,
    );
  }

  const resolvedCommit = execFileSync(
    "git",
    ["rev-parse", `refs/tags/${tagName}^{commit}`],
    { cwd: root, encoding: "utf8" },
  ).trim();

  if (resolvedCommit !== FROZEN_CANDIDATE_COMMIT) {
    throw new Error(
      `Tag ${tagName} peeled commit ${resolvedCommit} does not match frozen candidate ${FROZEN_CANDIDATE_COMMIT}`,
    );
  }

  const resolvedTree = execFileSync(
    "git",
    ["rev-parse", `refs/tags/${tagName}^{tree}`],
    { cwd: root, encoding: "utf8" },
  ).trim();

  if (resolvedTree !== FROZEN_CANDIDATE_TREE) {
    throw new Error(
      `Tag ${tagName} peeled tree ${resolvedTree} does not match frozen candidate ${FROZEN_CANDIDATE_TREE}`,
    );
  }

  readValidatedTagReceipt(tagName);

  return {
    releaseAuthority: "repo-template/release-receipt/v1",
    releaseId: `spencer-shadley/repo-template@${FROZEN_SEMVER}`,
    tagName: `v${FROZEN_SEMVER}`,
    resolvedCommit,
    resolvedTree,
    candidateCommitMatches: true,
    candidateTreeMatches: true,
    allCanonicalDigestsMatch: true,
    firstCanaryAgrees: true,
    secondCanaryAgrees: true,
    readbackTimestamp: PUBLICATION_TIME,
  };
}

export function validateCanaryReceipts(): void {
  const mgPath = path.join(root, ...VENDOR_MG_RECEIPT_PATH.split("/"));
  if (!fs.existsSync(mgPath)) {
    throw new Error(`Missing durable Model Gateway canary receipt at ${VENDOR_MG_RECEIPT_PATH}`);
  }
  const mgRaw = fs.readFileSync(mgPath, "utf8");
  if (!mgRaw.includes(FIRST_CANARY_RECEIPT_DIGEST)) {
    throw new Error("Model Gateway canary receipt does not contain expected digest");
  }
  const rfPath = path.join(root, ...VENDOR_RF_RECEIPT_PATH.split("/"));
  if (!fs.existsSync(rfPath)) {
    throw new Error(`Missing durable Repo Factory canary receipt at ${VENDOR_RF_RECEIPT_PATH}`);
  }
  const rfRaw = fs.readFileSync(rfPath, "utf8");
  if (!rfRaw.includes(SECOND_CANARY_RECEIPT_DIGEST)) {
    throw new Error("Repo Factory canary receipt does not contain expected digest");
  }
}

export function buildPostPublicationReadbackReceipt(): PostPublicationReadbackReceipt {
  const payloadSet = loadFrozenPayloadSet();
  const capabilityRegistry = loadFrozenCapabilityRegistry();
  const artifactManifest = loadFrozenArtifactManifest();
  verifyFrozenPayloadSetReproducible(payloadSet);
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

  const mgFullPath = path.join(root, ...VENDOR_MG_RECEIPT_PATH.split("/"));
  if (!fs.existsSync(mgFullPath)) {
    throw new Error(`Missing durable Model Gateway canary receipt at ${VENDOR_MG_RECEIPT_PATH}`);
  }
  const mgRaw = fs.readFileSync(mgFullPath, "utf8");
  const mg = JSON.parse(mgRaw) as {
    receiptId: string;
    receiptDigest: string;
    candidate: { commit: string; tree: string; candidateReceiptDigest?: string };
  };
  const { receiptDigest: mgClaimedDigest, ...mgBody } = mg;
  const mgCalculatedDigest = sha256CanonicalJson(mgBody);
  if (mgCalculatedDigest !== FIRST_CANARY_RECEIPT_DIGEST) {
    throw new Error(
      `Model Gateway canary receipt digest mismatch: calculated ${mgCalculatedDigest}, expected ${FIRST_CANARY_RECEIPT_DIGEST}`,
    );
  }
  if (mgClaimedDigest !== FIRST_CANARY_RECEIPT_DIGEST) {
    throw new Error(
      `Model Gateway canary receipt claimed digest mismatch: claimed ${mgClaimedDigest}, expected ${FIRST_CANARY_RECEIPT_DIGEST}`,
    );
  }
  if (mg.candidate.commit !== FROZEN_CANDIDATE_COMMIT) {
    throw new Error(
      `Model Gateway candidate commit mismatch: ${mg.candidate.commit} !== ${FROZEN_CANDIDATE_COMMIT}`,
    );
  }
  if (mg.candidate.tree !== FROZEN_CANDIDATE_TREE) {
    throw new Error(
      `Model Gateway candidate tree mismatch: ${mg.candidate.tree} !== ${FROZEN_CANDIDATE_TREE}`,
    );
  }
  if (
    mg.candidate.candidateReceiptDigest &&
    mg.candidate.candidateReceiptDigest !== PRODUCER_CANDIDATE_RECEIPT_DIGEST
  ) {
    throw new Error(
      `Model Gateway candidate receipt digest mismatch: ${mg.candidate.candidateReceiptDigest} !== ${PRODUCER_CANDIDATE_RECEIPT_DIGEST}`,
    );
  }

  const rfFullPath = path.join(root, ...VENDOR_RF_RECEIPT_PATH.split("/"));
  if (!fs.existsSync(rfFullPath)) {
    throw new Error(`Missing durable Repo Factory canary receipt at ${VENDOR_RF_RECEIPT_PATH}`);
  }
  const rfRaw = fs.readFileSync(rfFullPath, "utf8");
  const rf = JSON.parse(rfRaw) as {
    receiptId: string;
    receiptDigest: string;
    candidate: { commit: string; tree: string; candidateReceiptDigest?: string };
    producerVendoring?: { producerReceiptDigest?: string };
  };
  const { receiptDigest: rfClaimedDigest, ...rfBody } = rf;
  const rfCalculatedDigest = sha256CanonicalJson(rfBody);
  if (rfCalculatedDigest !== SECOND_CANARY_RECEIPT_DIGEST) {
    throw new Error(
      `Repo Factory canary receipt digest mismatch: calculated ${rfCalculatedDigest}, expected ${SECOND_CANARY_RECEIPT_DIGEST}`,
    );
  }
  if (rfClaimedDigest !== SECOND_CANARY_RECEIPT_DIGEST) {
    throw new Error(
      `Repo Factory canary receipt claimed digest mismatch: claimed ${rfClaimedDigest}, expected ${SECOND_CANARY_RECEIPT_DIGEST}`,
    );
  }
  if (rf.candidate.commit !== FROZEN_CANDIDATE_COMMIT) {
    throw new Error(
      `Repo Factory candidate commit mismatch: ${rf.candidate.commit} !== ${FROZEN_CANDIDATE_COMMIT}`,
    );
  }
  if (rf.candidate.tree !== FROZEN_CANDIDATE_TREE) {
    throw new Error(
      `Repo Factory candidate tree mismatch: ${rf.candidate.tree} !== ${FROZEN_CANDIDATE_TREE}`,
    );
  }
  const rfProducerDigest =
    rf.candidate.candidateReceiptDigest ?? rf.producerVendoring?.producerReceiptDigest;
  if (rfProducerDigest && rfProducerDigest !== PRODUCER_CANDIDATE_RECEIPT_DIGEST) {
    throw new Error(
      `Repo Factory candidate receipt digest mismatch: ${rfProducerDigest} !== ${PRODUCER_CANDIDATE_RECEIPT_DIGEST}`,
    );
  }

  const readback = performRemoteReadback();

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
    readback,
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
    // #364: frozen candidate commit still says 3.1.0; declaring 3.2.0 against it must fail closed.
    {
      const show = (commitSha: string, pathName: string) =>
        execFileSync("git", ["show", `${commitSha}:${pathName}`], { cwd: root, encoding: "utf8" });
      let refused = false;
      try {
        assertCommitVersionMatchesDeclaredSemver(FROZEN_CANDIDATE_COMMIT, FROZEN_SEMVER, show);
      } catch (error) {
        refused = /disagrees with commit/.test(String(error));
      }
      if (!refused) {
        throw new Error("expected assertCommitVersionMatchesDeclaredSemver to refuse frozen 3.1.0 tree under 3.2.0 label");
      }
    }
    console.log("Local CI V3 publication and readback self-test: PASS");
  } else {
    throw new Error("usage: node scripts/publish-local-ci-v3-release.ts <--write|--check|--self-test>");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
