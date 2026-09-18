import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeJson,
  createTemplateReleaseCandidateV1,
  sha256CanonicalJson,
  validatePublishedTemplateReleaseReceiptV1,
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

// Frozen LocalCiContractV3 candidate identity (producer #340 / canaries #991/#187).
// Publication identity is a *new unused SemVer* whose tagged commit VERSION bytes
// equal the tag (repo-template#364 / #341 CHANGE of PR 400). Do not move or reuse
// v3.1.0 or v3.2.0; v3.2.1 is the sibling #380 general skill-bearing release.
export const FROZEN_CANDIDATE_COMMIT = "88591ee869bb109ef481171aa817d1ed204a970e";
export const FROZEN_CANDIDATE_TREE = "995ea497114b2eba0b86cc3adb3666306829e0fb";
export const FROZEN_SEMVER = "3.2.0";
export const PUBLICATION_SEMVER = "3.3.0";
export const PUBLICATION_TAG = `v${PUBLICATION_SEMVER}`;
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
  "https://github.com/spencer-shadley/model-gateway/blob/master/docs/receipts/receipt-issue-991-mu14rxy2.json";

export const SECOND_CANARY_ISSUE = "https://github.com/spencer-shadley/repo-factory/issues/187";
export const SECOND_CANARY_RECEIPT_ID = "receipt-issue-187-mu14zjfz";
export const SECOND_CANARY_RECEIPT_KIND = "repo-factory/local-ci-v3-canary-receipt/v1";
export const SECOND_CANARY_RECEIPT_DIGEST =
  "0aa881725aea8258cb1879b4af83fb8655df364e4efc3ca7f0c8dc21ef0dab72";
export const SECOND_CANARY_RECEIPT_URL =
  "https://github.com/spencer-shadley/repo-factory/blob/master/docs/receipts/receipt-issue-187-mu14zjfz.json";

export const PUBLICATION_TIME = "2026-09-18T07:30:00Z";

export type GitRunner = (args: readonly string[]) => string;

export function defaultGit(args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: root, encoding: "utf8" }).trim();
}

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

export function assertCanaryReceiptUrl(url: string, receiptId: string): void {
  const escapedId = receiptId.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const blobPattern = new RegExp(
    String.raw`^https://github\.com/spencer-shadley/[A-Za-z0-9_.-]+/blob/[A-Za-z0-9._/-]+/(?:docs/receipts|contracts/local-ci/v3)/` +
      escapedId +
      String.raw`\.json$`,
  );
  if (!blobPattern.test(url)) {
    throw new Error(
      `Canary receiptUrl is not a durable receipt artifact for ${receiptId}: ${url}`,
    );
  }
}

export interface PublicationIdentity {
  readonly commit: string;
  readonly tree: string;
  readonly semver: string;
  readonly tag: string;
}

export function resolveRemotePeeledCommit(
  remote: string,
  tagName: string,
  runGit: GitRunner = defaultGit,
): string {
  let lsRemote: string;
  try {
    lsRemote = runGit(["ls-remote", "--tags", remote, `refs/tags/${tagName}*`]);
  } catch (error) {
    throw new Error(`Remote ${remote} could not be queried for refs/tags/${tagName}`, {
      cause: error,
    });
  }
  if (!lsRemote) {
    throw new Error(`Remote tag refs/tags/${tagName} not found on remote ${remote}`);
  }
  for (const line of lsRemote.split("\n")) {
    const [sha, ref] = line.trim().split(/\s+/, 2);
    if (ref === `refs/tags/${tagName}^{}` && sha) {
      return sha;
    }
  }
  throw new Error(
    `Remote tag refs/tags/${tagName} is not an annotated tag with a peeled commit on ${remote}`,
  );
}

export function resolvePublishedIdentity(
  remote: string = "origin",
  tagName: string = PUBLICATION_TAG,
  runGit: GitRunner = defaultGit,
): PublicationIdentity {
  const commit = resolveRemotePeeledCommit(remote, tagName, runGit);
  assertCommitVersionMatchesDeclaredSemver(commit, PUBLICATION_SEMVER, (commitSha, pathName) =>
    runGit(["show", `${commitSha}:${pathName}`]),
  );
  const tree = runGit(["rev-parse", `${commit}^{tree}`]);
  return {
    commit,
    tree,
    semver: PUBLICATION_SEMVER,
    tag: tagName,
  };
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

export function buildPublishedReleaseReceipt(
  identity: PublicationIdentity,
): TemplateReleaseReceipt {
  const payloadSet = loadFrozenPayloadSet();
  const capabilityRegistry = loadFrozenCapabilityRegistry();
  const artifactManifest = loadFrozenArtifactManifest();
  verifyFrozenPayloadSetReproducible(payloadSet);

  // Nested releaseEvidence is omitted: its review.subject is const
  // "producer-commit" and canary URLs are constrained to issue comments, but
  // #341 CHANGE forbids labeling a later PR review as a review of the frozen
  // producer and forbids triage/progress comments as canary receipt bodies.
  // Canary join lives on the outer readback receipt with durable blob URLs.
  const candidateClosure = createTemplateReleaseCandidateV1({
    semver: identity.semver,
    commit: identity.commit,
    tree: identity.tree,
    payloadSet,
    capabilityRegistry,
    artifactManifest,
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

export function readValidatedTagReceipt(
  tagName: string,
  runGit: GitRunner = defaultGit,
): TemplateReleaseReceipt {
  const rawTag = runGit(["cat-file", "-p", `refs/tags/${tagName}`]);
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
  return validated.value;
}

export interface DurableCanaryReceipt {
  readonly receiptId: string;
  readonly receiptDigest: string;
  readonly candidate: {
    readonly commit: string;
    readonly tree: string;
    readonly candidateReceiptDigest?: string;
  };
  readonly producerVendoring?: {
    readonly producerReceiptDigest?: string;
  };
}

export function assertLoadedCanaryReceipt(
  parsed: DurableCanaryReceipt,
  expectedDigest: string,
  label: string,
): DurableCanaryReceipt {
  const { receiptDigest: claimedDigest, ...body } = parsed;
  const calculatedDigest = sha256CanonicalJson(body);
  if (calculatedDigest !== expectedDigest) {
    throw new Error(
      `${label} canary receipt digest mismatch: calculated ${calculatedDigest}, expected ${expectedDigest}`,
    );
  }
  if (claimedDigest !== expectedDigest) {
    throw new Error(
      `${label} canary receipt claimed digest mismatch: claimed ${claimedDigest}, expected ${expectedDigest}`,
    );
  }
  if (parsed.candidate.commit !== FROZEN_CANDIDATE_COMMIT) {
    throw new Error(
      `${label} candidate commit mismatch: ${parsed.candidate.commit} !== ${FROZEN_CANDIDATE_COMMIT}`,
    );
  }
  if (parsed.candidate.tree !== FROZEN_CANDIDATE_TREE) {
    throw new Error(
      `${label} candidate tree mismatch: ${parsed.candidate.tree} !== ${FROZEN_CANDIDATE_TREE}`,
    );
  }
  return parsed;
}

export function loadDurableCanaryReceipt(
  relativePath: string,
  expectedDigest: string,
  label: string,
): DurableCanaryReceipt {
  const fullPath = path.join(root, ...relativePath.split("/"));
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing durable ${label} canary receipt at ${relativePath}`);
  }
  const raw = fs.readFileSync(fullPath, "utf8");
  return assertLoadedCanaryReceipt(
    JSON.parse(raw) as DurableCanaryReceipt,
    expectedDigest,
    label,
  );
}

export function validateCanaryReceipts(): void {
  assertCanaryReceiptUrl(FIRST_CANARY_RECEIPT_URL, FIRST_CANARY_RECEIPT_ID);
  assertCanaryReceiptUrl(SECOND_CANARY_RECEIPT_URL, SECOND_CANARY_RECEIPT_ID);
  loadDurableCanaryReceipt(VENDOR_MG_RECEIPT_PATH, FIRST_CANARY_RECEIPT_DIGEST, "Model Gateway");
  loadDurableCanaryReceipt(VENDOR_RF_RECEIPT_PATH, SECOND_CANARY_RECEIPT_DIGEST, "Repo Factory");
}

export function performRemoteReadback(
  identity: PublicationIdentity,
  agreements: {
    readonly allCanonicalDigestsMatch: boolean;
    readonly firstCanaryAgrees: boolean;
    readonly secondCanaryAgrees: boolean;
  },
  remote: string = "origin",
  tagName: string = PUBLICATION_TAG,
  runGit: GitRunner = defaultGit,
): PostPublicationReadbackReceipt["readback"] {
  if (!agreements.allCanonicalDigestsMatch) {
    throw new Error("Canonical LocalCi V3 digests do not match the frozen candidate");
  }
  if (!agreements.firstCanaryAgrees) {
    throw new Error("Model Gateway canary does not agree with the frozen candidate");
  }
  if (!agreements.secondCanaryAgrees) {
    throw new Error("Repo Factory canary does not agree with the frozen candidate");
  }

  const remotePeeledCommit = resolveRemotePeeledCommit(remote, tagName, runGit);
  const candidateCommitMatches = remotePeeledCommit === identity.commit;
  if (!candidateCommitMatches) {
    throw new Error(
      `Remote tag refs/tags/${tagName}^{} peeled commit ${remotePeeledCommit} does not match publication commit ${identity.commit}`,
    );
  }

  const resolvedTree = runGit(["rev-parse", `${remotePeeledCommit}^{tree}`]);
  const candidateTreeMatches = resolvedTree === identity.tree;
  if (!candidateTreeMatches) {
    throw new Error(
      `Remote tag refs/tags/${tagName}^{} tree ${resolvedTree} does not match publication tree ${identity.tree}`,
    );
  }

  const tagReceipt = readValidatedTagReceipt(tagName, runGit);
  if (tagReceipt.producer.commit !== identity.commit) {
    throw new Error(
      `Annotated tag ${tagName} producer.commit ${tagReceipt.producer.commit} does not match publication commit ${identity.commit}`,
    );
  }
  if (tagReceipt.producer.semver !== PUBLICATION_SEMVER) {
    throw new Error(
      `Annotated tag ${tagName} producer.semver ${tagReceipt.producer.semver} does not match ${PUBLICATION_SEMVER}`,
    );
  }

  return {
    releaseAuthority: "repo-template/release-receipt/v1",
    releaseId: `spencer-shadley/repo-template@${PUBLICATION_SEMVER}`,
    tagName: PUBLICATION_TAG,
    resolvedCommit: remotePeeledCommit,
    resolvedTree,
    candidateCommitMatches,
    candidateTreeMatches,
    allCanonicalDigestsMatch: agreements.allCanonicalDigestsMatch,
    firstCanaryAgrees: agreements.firstCanaryAgrees,
    secondCanaryAgrees: agreements.secondCanaryAgrees,
    readbackTimestamp: PUBLICATION_TIME,
  };
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

  assertCanaryReceiptUrl(FIRST_CANARY_RECEIPT_URL, FIRST_CANARY_RECEIPT_ID);
  assertCanaryReceiptUrl(SECOND_CANARY_RECEIPT_URL, SECOND_CANARY_RECEIPT_ID);
  const mg = loadDurableCanaryReceipt(
    VENDOR_MG_RECEIPT_PATH,
    FIRST_CANARY_RECEIPT_DIGEST,
    "Model Gateway",
  );
  if (
    mg.candidate.candidateReceiptDigest &&
    mg.candidate.candidateReceiptDigest !== PRODUCER_CANDIDATE_RECEIPT_DIGEST
  ) {
    throw new Error(
      `Model Gateway candidate receipt digest mismatch: ${mg.candidate.candidateReceiptDigest} !== ${PRODUCER_CANDIDATE_RECEIPT_DIGEST}`,
    );
  }

  const rf = loadDurableCanaryReceipt(
    VENDOR_RF_RECEIPT_PATH,
    SECOND_CANARY_RECEIPT_DIGEST,
    "Repo Factory",
  );
  const rfProducerDigest =
    rf.candidate.candidateReceiptDigest ?? rf.producerVendoring?.producerReceiptDigest;
  if (rfProducerDigest && rfProducerDigest !== PRODUCER_CANDIDATE_RECEIPT_DIGEST) {
    throw new Error(
      `Repo Factory candidate receipt digest mismatch: ${rfProducerDigest} !== ${PRODUCER_CANDIDATE_RECEIPT_DIGEST}`,
    );
  }

  const identity = resolvePublishedIdentity();
  const firstCanaryAgrees =
    mg.candidate.commit === FROZEN_CANDIDATE_COMMIT &&
    mg.candidate.tree === FROZEN_CANDIDATE_TREE;
  const secondCanaryAgrees =
    rf.candidate.commit === FROZEN_CANDIDATE_COMMIT &&
    rf.candidate.tree === FROZEN_CANDIDATE_TREE;
  const allCanonicalDigestsMatch = Object.keys(canonicalDigests).length > 0;
  const readback = performRemoteReadback(identity, {
    allCanonicalDigestsMatch,
    firstCanaryAgrees,
    secondCanaryAgrees,
  });

  const v3Bundle = capabilityRegistry.bundles.find(
    (bundle) => bundle.id === "repo-template/local-ci-contract-v3",
  );
  if (!v3Bundle) throw new Error("Missing repo-template/local-ci-contract-v3 bundle");
  const podBundle = capabilityRegistry.bundles.find(
    (bundle) => bundle.id === "repo-template/proof-of-detection",
  );
  if (!podBundle) throw new Error("Missing repo-template/proof-of-detection bundle");

  const publishedReleaseReceipt = buildPublishedReleaseReceipt(identity);

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

  const expectedRelease = buildPublishedReleaseReceipt(resolvePublishedIdentity());
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

  const releaseSerialized = serializeReceipt(readbackReceipt.publishedReleaseReceipt);
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

  const releaseValidation = validatePublishedTemplateReleaseReceiptV1(
    receipt.publishedReleaseReceipt,
  );
  if (!releaseValidation.ok) {
    throw new Error("Published release receipt failed validation in self-test");
  }
  if (receipt.publishedReleaseReceipt.producer.semver !== PUBLICATION_SEMVER) {
    throw new Error("published release producer.semver must equal PUBLICATION_SEMVER");
  }
  if (receipt.readback.tagName !== PUBLICATION_TAG) {
    throw new Error("readback tag must equal the unused publication tag");
  }
  if (receipt.readback.resolvedCommit !== receipt.publishedReleaseReceipt.producer.commit) {
    throw new Error("readback resolved commit must equal published producer commit");
  }
}

function showFromGit(commitSha: string, pathName: string): string {
  return defaultGit(["show", `${commitSha}:${pathName}`]);
}

function assertVersionAlignmentGates(): void {
  let frozenRefused = false;
  try {
    assertCommitVersionMatchesDeclaredSemver(
      FROZEN_CANDIDATE_COMMIT,
      PUBLICATION_SEMVER,
      showFromGit,
    );
  } catch (error) {
    frozenRefused = /disagrees with commit/.test(String(error));
  }
  if (!frozenRefused) {
    throw new Error(
      `expected assertCommitVersionMatchesDeclaredSemver to refuse frozen 3.1.0 tree under ${PUBLICATION_SEMVER} label`,
    );
  }

  const identity = resolvePublishedIdentity();
  assertCommitVersionMatchesDeclaredSemver(identity.commit, PUBLICATION_SEMVER, showFromGit);
}

export function mintPublicationTag(runGit: GitRunner = defaultGit): PublicationIdentity {
  const commit = runGit(["rev-parse", "HEAD"]);
  assertCommitVersionMatchesDeclaredSemver(commit, PUBLICATION_SEMVER, (commitSha, pathName) =>
    runGit(["show", `${commitSha}:${pathName}`]),
  );
  let remoteListing: string;
  try {
    remoteListing = runGit(["ls-remote", "--tags", "origin", `refs/tags/${PUBLICATION_TAG}*`]);
  } catch (error) {
    throw new Error(`Remote origin could not be queried for ${PUBLICATION_TAG}`, { cause: error });
  }
  if (remoteListing) {
    throw new Error(
      `Refusing to mint ${PUBLICATION_TAG}: already present on origin:\n${remoteListing}`,
    );
  }
  const tree = runGit(["rev-parse", `${commit}^{tree}`]);
  const identity = {
    commit,
    tree,
    semver: PUBLICATION_SEMVER,
    tag: PUBLICATION_TAG,
  };
  const receipt = buildPublishedReleaseReceipt(identity);
  const messagePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "repo-template-tag-")),
    `${PUBLICATION_TAG}.json`,
  );
  fs.writeFileSync(messagePath, `${JSON.stringify(receipt)}\n`, "utf8");
  runGit(["tag", "-a", PUBLICATION_TAG, commit, "-F", messagePath]);
  return identity;
}

function main(): void {
  const mode = process.argv[2];
  if (mode === "--mint-tag") {
    const identity = mintPublicationTag();
    console.log(`Minted annotated tag ${PUBLICATION_TAG} at ${identity.commit}`);
  } else if (mode === "--write") {
    assertVersionAlignmentGates();
    writeReceipts();
    console.log("Post-publication readback and release receipts written successfully.");
  } else if (mode === "--check") {
    assertVersionAlignmentGates();
    checkReceipts();
    console.log("Post-publication readback and release receipts match candidate bytes cleanly.");
  } else if (mode === "--self-test") {
    validateCanaryReceipts();
    assertVersionAlignmentGates();
    selfTest();
    checkReceipts();
    console.log("Local CI V3 publication and readback self-test: PASS");
  } else {
    throw new Error(
      "usage: node scripts/publish-local-ci-v3-release.ts <--mint-tag|--write|--check|--self-test>",
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
