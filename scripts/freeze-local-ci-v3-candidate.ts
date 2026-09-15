import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { constructReleasePayloadAt } from "../tools/release-payload.ts";
import {
  canonicalizeJson,
  createTemplateReleaseCandidateV1,
  sha256CanonicalJson,
  validateArtifactManifestV2,
  validateCapabilityBundleRegistryV2,
  validateLocalCiV3CandidateReceiptV1,
  validateReleasePayloadSetV2,
  type ArtifactManifest,
  type CapabilityBundleRegistry,
  type ReleasePayloadSet,
} from "../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// repo-template#340 repair (RT-340): the candidate is the last known-immutable
// master tip at the time this repair was authored. It is deliberately NOT the
// commit that carries this repair (a commit cannot declare its own hash), and
// it is deliberately NOT semver 3.1.0 (already used by a prior, unrelated
// release -- see repo-template#340 comment 5663732372). Rebinding publication
// (#341) and the two canaries (model-gateway#991, repo-factory#187) to this
// repaired identity is explicitly out of scope for this chunk.
export const FROZEN_CANDIDATE_COMMIT = "88591ee869bb109ef481171aa817d1ed204a970e";
export const FROZEN_CANDIDATE_TREE = "995ea497114b2eba0b86cc3adb3666306829e0fb";
export const FROZEN_SEMVER = "3.2.0";
export const RECEIPT_ID = "receipt-issue-340-rt340repair1";
const TREE_VERIFICATION_METHOD = "git rev-parse <commit>^{tree}";

// "corepack pnpm verify" (the complete repository gate) is deliberately NOT
// one of these ledger-backed checks: this script's own --self-test/--check
// runs as part of that same gate (see verify:self in package.json), so a
// ledger entry claiming "a pnpm verify run that included this exact check
// already passed" would be checking its own precondition -- an unmeasurable,
// circular claim, not real evidence. The five checks below are each
// standalone commands with no such self-reference, so they can be executed
// for real and authenticated here. The complete gate itself is additionally
// run out-of-band on the exact repair head as an operational step, and its
// result is reported alongside the PR/issue rather than embedded as a
// self-certifying field (see repo-template#340 report).
const REQUIRED_VERIFICATION_CHECKS = [
  {
    id: "proof-of-detection-self-test",
    command: "node scripts/proof-of-detection/run-meta-gate.ts --self-test",
  },
  {
    id: "local-ci-v3-contract-unit",
    command: "node --test packages/adoption-shell/test/local-ci-contract-v3.test.ts",
  },
  {
    id: "local-ci-outcome-v1-unit",
    command: "node --test packages/adoption-shell/test/local-ci-outcome-v1.test.ts",
  },
  {
    id: "release-payload-check",
    command: "node tools/release-payload.ts check",
  },
  {
    id: "artifact-build-verify",
    command: "node tools/artifact-build.ts verify",
  },
] as const;

export const VERIFICATION_EVIDENCE_PATH = "contracts/local-ci/v3/verification-evidence.json";

/**
 * The three manifest inputs that are NOT part of `CANONICAL_V3_PATHS` but whose
 * content still reaches `manifestDigests` and `candidateReleaseReceipt`.
 *
 * repo-template#340 (RT-340b): before this repair these were read with
 * `fs.readFileSync` from the current checkout, so the receipt named frozen
 * commit 88591ee / tree 995ea497 while recording the branch tip's payload-set
 * and artifact-manifest digests. They are now read from the frozen commit's
 * git tree like every other receipt input.
 */
export const FROZEN_MANIFEST_INPUT_PATHS = {
  releasePayloadSet: "release/release-payload-set.json",
  capabilityBundleRegistry: "contracts/adoption-shell-v2/capability-bundle-registry.json",
  artifactManifest: "artifacts/adoption-shell-v2/artifact-manifest.json",
} as const;

export const FROZEN_VERSION_PATHS = ["VERSION", "TEMPLATE_VERSION"] as const;

const FROZEN_BLOB_READ_METHOD = "git show <commit>:<path>";
const FROZEN_ENUMERATION_METHOD = "git ls-tree -rz <commit>";

/**
 * repo-template#340 (RT-340b): `VERSION`/`TEMPLATE_VERSION` inside the frozen
 * tree are 3.1.0 while the candidate is labelled 3.2.0, because v3.1.0 was
 * already released against a different tree. Publication (#341) must therefore
 * bump VERSION/TEMPLATE_VERSION in its own publication commit and tag that
 * commit; it must never mint v3.2.0 against the frozen tree, whose VERSION says
 * otherwise. Recorded in the receipt under `versionBinding` and tracked by the
 * governed issue below.
 */
export const VERSION_BINDING_ISSUE =
  "https://github.com/spencer-shadley/repo-template/issues/364";

export interface VerificationEvidenceEntry {
  readonly command: string;
  readonly exitCode: number;
  readonly result: "passed" | "failed" | "skipped" | "could-not-execute";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly outputSha256: string;
}

export interface VerificationEvidenceLedger {
  readonly schemaId: string;
  readonly schemaVersion: string;
  readonly boundCommit: string;
  readonly generatedAt: string;
  readonly checks: Record<string, VerificationEvidenceEntry>;
}

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
  readonly treeVerification: {
    readonly method: string;
    readonly resolvedTree: string;
    readonly matches: true;
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
  readonly frozenInputs: {
    readonly blobReadMethod: string;
    readonly treeEnumerationMethod: string;
    readonly enumerationTool: string;
    readonly releasePayloadSetReproducedFromFrozenTree: true;
    readonly blobDigests: Record<string, string>;
  };
  readonly versionBinding: {
    readonly frozenVersion: string;
    readonly frozenTemplateVersion: string;
    readonly candidateSemver: string;
    readonly relation: "candidate-ahead-of-frozen-tree";
    readonly publicationRule: string;
    readonly trackingIssue: string;
  };
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
    readonly evidenceBoundCommit: string;
    readonly evidencePath: string;
    readonly checks: Record<
      string,
      {
        readonly command: string;
        readonly result: string;
        readonly exitCode: number;
        readonly startedAt: string;
        readonly finishedAt: string;
      }
    >;
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

/**
 * Read the exact bytes git recorded for `relativePath` inside `commit`'s
 * tree object. This deliberately never touches the working tree: a later
 * edit to the working copy of `relativePath` cannot change the digest
 * computed here, because the bytes come from the immutable git object
 * database keyed by the frozen commit, not from `fs.readFileSync` of the
 * current checkout (the defect fixed by this repair; see repo-template#340
 * comment 5663075341, defect 1).
 */
export function readFrozenBlob(commit: string, relativePath: string): Buffer {
  try {
    return execFileSync("git", ["show", `${commit}:${relativePath}`], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `Failed to read frozen blob ${relativePath} at commit ${commit} from the git object database: ${String(error)}`,
      { cause: error },
    );
  }
}

export function sha256File(relativePath: string): string {
  return createHash("sha256").update(readFrozenBlob(FROZEN_CANDIDATE_COMMIT, relativePath)).digest("hex");
}

export function computeCanonicalDigests(): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const relativePath of CANONICAL_V3_PATHS) {
    digests[relativePath] = sha256File(relativePath);
  }
  return digests;
}

/**
 * Resolve the exact tree object a commit points at via git itself (not a
 * hard-coded assumption). Throws if `commit` cannot be resolved at all --
 * an unknown/garbage-collected/never-existed commit fails closed instead of
 * silently pairing stale identity with new digests (defect 1).
 */
export function resolveCommitTree(commit: string): string {
  try {
    return execFileSync("git", ["rev-parse", `${commit}^{tree}`], {
      cwd: root,
    })
      .toString("utf8")
      .trim();
  } catch (error) {
    throw new Error(
      `Failed to resolve tree for candidate commit ${commit}: ${String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Prove the declared candidate commit really resolves to the declared
 * candidate tree, and bind that resolution into the receipt. Fails closed on
 * any mismatch (defect: "prove the declared commit resolves to the declared
 * tree", repo-template#340 acceptance criteria).
 */
export function verifyCandidateTree(
  commit: string,
  expectedTree: string,
): PrePublicationReceipt["treeVerification"] {
  const resolvedTree = resolveCommitTree(commit);
  if (resolvedTree !== expectedTree) {
    throw new Error(
      `Candidate tree mismatch: commit ${commit} resolves to tree ${resolvedTree}, but ${expectedTree} was declared. Refusing to freeze a candidate whose commit/tree pairing does not resolve.`,
    );
  }
  return {
    method: TREE_VERIFICATION_METHOD,
    resolvedTree,
    matches: true,
  };
}

/**
 * Load the committed, out-of-band verification evidence ledger
 * (produced once by `scripts/record-local-ci-v3-verification-evidence.ts`,
 * run from a detached worktree checked out at the exact candidate commit --
 * see that script's header comment -- so the checks execute against the
 * candidate's own frozen bytes) and fail closed unless every required check
 * is present, bound to the exact candidate commit passed in `boundCommit`,
 * and recorded with exit code 0 / result "passed". A skipped, failed,
 * missing, or wrongly-bound check must never silently read as "passed"
 * (repo-template#340 acceptance criteria, defect 2).
 */
export function buildVerificationFromEvidence(
  evidence: VerificationEvidenceLedger,
  boundCommit: string,
): PrePublicationReceipt["verification"] {
  if (evidence.boundCommit !== boundCommit) {
    throw new Error(
      `Verification evidence is bound to commit ${evidence.boundCommit}, not the declared candidate ${boundCommit}. Refusing to consume unbound evidence.`,
    );
  }
  const checks: Record<
    string,
    { command: string; result: string; exitCode: number; startedAt: string; finishedAt: string }
  > = {};
  for (const required of REQUIRED_VERIFICATION_CHECKS) {
    const entry = evidence.checks[required.id];
    if (!entry) {
      throw new Error(
        `Verification evidence is missing required check "${required.id}". A missing check must never be treated as passed.`,
      );
    }
    if (entry.command !== required.command) {
      throw new Error(
        `Verification evidence for "${required.id}" records command ${JSON.stringify(entry.command)}, expected ${JSON.stringify(required.command)}.`,
      );
    }
    if (entry.result !== "passed" || entry.exitCode !== 0) {
      throw new Error(
        `Verification check "${required.id}" did not pass (result=${entry.result}, exitCode=${String(entry.exitCode)}). A skipped or failed check must prevent a "passed" receipt.`,
      );
    }
    checks[required.id] = {
      command: entry.command,
      result: entry.result,
      exitCode: entry.exitCode,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
    };
  }
  return {
    repositoryVerification: "green",
    evidenceBoundCommit: boundCommit,
    evidencePath: VERIFICATION_EVIDENCE_PATH,
    checks,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVerificationEvidenceLedger(value: unknown): value is VerificationEvidenceLedger {
  return (
    isPlainObject(value) &&
    typeof value["boundCommit"] === "string" &&
    typeof value["generatedAt"] === "string" &&
    isPlainObject(value["checks"])
  );
}

export function loadVerificationEvidence(): VerificationEvidenceLedger {
  const fullPath = path.join(root, ...VERIFICATION_EVIDENCE_PATH.split("/"));
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Verification evidence ledger missing at ${VERIFICATION_EVIDENCE_PATH}. Run scripts/record-local-ci-v3-verification-evidence.ts --write before freezing a candidate.`,
    );
  }
  const raw: unknown = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  if (!isVerificationEvidenceLedger(raw)) {
    throw new Error(`Malformed verification evidence ledger at ${VERIFICATION_EVIDENCE_PATH}`);
  }
  return raw;
}

function parseFrozenJson(relativePath: string): unknown {
  return JSON.parse(readFrozenBlob(FROZEN_CANDIDATE_COMMIT, relativePath).toString("utf8"));
}

/**
 * Read the release payload set from the frozen commit's tree.
 *
 * repo-template#340 (RT-340b): this used to be `fs.readFileSync` of the current
 * checkout, so an unrelated commit on top of the candidate silently moved
 * `manifestDigests.releasePayloadSet` while `candidate.commit`/`candidate.tree`
 * stayed frozen. Now the bytes come from the frozen commit only.
 */
export function loadFrozenPayloadSet(): ReleasePayloadSet {
  const result = validateReleasePayloadSetV2(
    parseFrozenJson(FROZEN_MANIFEST_INPUT_PATHS.releasePayloadSet),
  );
  if (!result.ok) throw new Error("Invalid payload set: " + JSON.stringify(result.diagnostics));
  return result.value;
}

/** Read the capability bundle registry from the frozen commit's tree (RT-340b). */
export function loadFrozenCapabilityRegistry(): CapabilityBundleRegistry {
  const result = validateCapabilityBundleRegistryV2(
    parseFrozenJson(FROZEN_MANIFEST_INPUT_PATHS.capabilityBundleRegistry),
  );
  if (!result.ok) throw new Error("Invalid capability registry: " + JSON.stringify(result.diagnostics));
  return result.value;
}

/** Read the artifact manifest from the frozen commit's tree (RT-340b). */
export function loadFrozenArtifactManifest(): ArtifactManifest {
  const result = validateArtifactManifestV2(
    parseFrozenJson(FROZEN_MANIFEST_INPUT_PATHS.artifactManifest),
  );
  if (!result.ok) throw new Error("Invalid artifact manifest: " + JSON.stringify(result.diagnostics));
  return result.value;
}

/**
 * Independently re-derive the release payload set by enumerating the frozen
 * commit's own git tree (`git ls-tree -rz <commit>`) and prove it reproduces the
 * payload set committed inside that same tree.
 *
 * This is the direct guard for the mutation the PR #363 reviewer executed: they
 * committed one unrelated `.gitignore` line and re-derived, and the payload
 * digest moved while the declared commit/tree did not. The enumeration is now
 * pinned to `FROZEN_CANDIDATE_COMMIT`, so a later commit cannot reach it; and if
 * the frozen tree's committed payload set ever stopped being reproducible from
 * the frozen tree itself, this fails closed instead of freezing a receipt whose
 * payload digest describes nothing checkable.
 */
export function verifyFrozenPayloadSetReproducible(payloadSet: ReleasePayloadSet): void {
  const reDerived = constructReleasePayloadAt(FROZEN_CANDIDATE_COMMIT).payload;
  const fields = ["releaseDigest", "payloadDigest", "payloadDigestAlgorithm", "entryCount"] as const;
  for (const field of fields) {
    if (reDerived[field] !== payloadSet[field]) {
      throw new Error(
        `Release payload set committed at ${FROZEN_CANDIDATE_COMMIT} is not reproducible from that commit's own tree: ${field} is ${String(payloadSet[field])} in the frozen file but ${String(reDerived[field])} when re-enumerated with "${FROZEN_ENUMERATION_METHOD}".`,
      );
    }
  }
}

/** Read a single-line version file from the frozen commit's tree. */
export function readFrozenVersion(relativePath: string): string {
  return readFrozenBlob(FROZEN_CANDIDATE_COMMIT, relativePath).toString("utf8").trim();
}

function parseSemver(value: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Expected a bare X.Y.Z semver, received ${JSON.stringify(value)}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isStrictlyAhead(candidate: string, frozen: string): boolean {
  const left = parseSemver(candidate);
  const right = parseSemver(frozen);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) > (right[index] ?? 0);
  }
  return false;
}

/**
 * Bind the frozen tree's own declared version into the receipt and fail closed
 * on any relation other than "the candidate label is strictly ahead of what the
 * frozen tree declares".
 *
 * The frozen tree says 3.1.0; the candidate is labelled 3.2.0 because v3.1.0 was
 * already released against a different tree. That is now a recorded discrepancy
 * rather than a silent one: publication (#341) must bump VERSION/TEMPLATE_VERSION
 * in its own commit and tag that commit, never mint v3.2.0 against this tree.
 * Tracked by repo-template#364. Equal-or-behind would mean the candidate reuses
 * or regresses an already-released identity, and fails here
 * (repo-template#340 deliverable 4).
 */
export function buildVersionBinding(
  candidateSemver: string = FROZEN_SEMVER,
): PrePublicationReceipt["versionBinding"] {
  const [versionPath, templateVersionPath] = FROZEN_VERSION_PATHS;
  const frozenVersion = readFrozenVersion(versionPath);
  const frozenTemplateVersion = readFrozenVersion(templateVersionPath);
  if (frozenVersion !== frozenTemplateVersion) {
    throw new Error(
      `Frozen tree declares ${versionPath}=${frozenVersion} but ${templateVersionPath}=${frozenTemplateVersion}. Refusing to freeze a candidate whose own tree disagrees with itself about its version.`,
    );
  }
  if (!isStrictlyAhead(candidateSemver, frozenVersion)) {
    throw new Error(
      `Candidate semver ${candidateSemver} is not strictly ahead of the frozen tree's declared version ${frozenVersion}. A candidate must never reuse or regress an already-released identity (repo-template#364).`,
    );
  }
  return {
    frozenVersion,
    frozenTemplateVersion,
    candidateSemver,
    relation: "candidate-ahead-of-frozen-tree",
    publicationRule: `The frozen tree ${FROZEN_CANDIDATE_TREE} declares VERSION/TEMPLATE_VERSION ${frozenVersion}; publication (repo-template#341) must bump both to ${candidateSemver} in its own publication commit and tag that commit. Minting v${candidateSemver} against commit ${FROZEN_CANDIDATE_COMMIT} is forbidden: the tagged bytes would contradict the tag. Tracked by ${VERSION_BINDING_ISSUE}.`,
    trackingIssue: VERSION_BINDING_ISSUE,
  };
}

/**
 * Record, in the receipt itself, how every non-canonical input was obtained and
 * the sha256 of the exact frozen blob consumed. A reader can re-run
 * `git show <commit>:<path>` against the declared commit and reproduce these
 * numbers, so no field of this receipt describes a tree other than the one it
 * names (repo-template#340 deliverable 1).
 */
export function buildFrozenInputs(): PrePublicationReceipt["frozenInputs"] {
  const blobDigests: Record<string, string> = {};
  for (const relativePath of [
    ...Object.values(FROZEN_MANIFEST_INPUT_PATHS),
    ...FROZEN_VERSION_PATHS,
  ]) {
    blobDigests[relativePath] = sha256File(relativePath);
  }
  return {
    blobReadMethod: FROZEN_BLOB_READ_METHOD,
    treeEnumerationMethod: FROZEN_ENUMERATION_METHOD,
    enumerationTool: "tools/release-payload.ts",
    releasePayloadSetReproducedFromFrozenTree: true,
    blobDigests,
  };
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
  const payloadSet = loadFrozenPayloadSet();
  const capabilityRegistry = loadFrozenCapabilityRegistry();
  const artifactManifest = loadFrozenArtifactManifest();
  verifyFrozenPayloadSetReproducible(payloadSet);

  const treeVerification = verifyCandidateTree(FROZEN_CANDIDATE_COMMIT, FROZEN_CANDIDATE_TREE);
  const evidence = loadVerificationEvidence();

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
    treeVerification,
    lineage: buildLineage(),
    candidateReleaseReceipt: candidateClosure.value.receipt,
    frozenInputs: buildFrozenInputs(),
    versionBinding: buildVersionBinding(),
    canonicalDigests: computeCanonicalDigests(),
    manifestDigests: buildManifestDigests(payloadSet, artifactManifest, capabilityRegistry),
    proofOfDetectionSemantics: buildProofOfDetectionSemantics(),
    verification: buildVerificationFromEvidence(evidence, FROZEN_CANDIDATE_COMMIT),
    canaryGuidance: buildCanaryGuidance(),
    digestAlgorithm: "sha256-rfc8785-v1",
  };

  const receiptDigest = sha256CanonicalJson(bodyWithoutDigest);
  const receipt = {
    ...bodyWithoutDigest,
    receiptDigest,
  };

  const consumerValidation = validateLocalCiV3CandidateReceiptV1(receipt);
  if (!consumerValidation.ok) {
    throw new Error(
      `Freshly built candidate receipt failed the consumer digest validator: ${JSON.stringify(consumerValidation.diagnostics)}`,
    );
  }

  return receipt;
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

  // Verify tampered receipt fails the consumer validator
  const tampered = { ...receipt, receiptId: "tampered" };
  const tamperedValidation = validateLocalCiV3CandidateReceiptV1(tampered);
  if (tamperedValidation.ok) {
    throw new Error("tampering was not detected by the consumer digest validator");
  }

  // Verify a working-tree edit to a canonical file cannot silently change the
  // frozen digest set (defect 1 regression guard).
  const firstCanonicalPath = CANONICAL_V3_PATHS[0];
  const fullPath = path.join(root, ...firstCanonicalPath.split("/"));
  const original = fs.readFileSync(fullPath);
  try {
    fs.writeFileSync(fullPath, Buffer.concat([original, Buffer.from("\n// mutated-for-self-test\n")]));
    const digestAfterMutation = sha256File(firstCanonicalPath);
    if (digestAfterMutation !== receipt.canonicalDigests[firstCanonicalPath]) {
      throw new Error(
        "sha256File must read from the frozen commit's git object, not the mutated working tree",
      );
    }
  } finally {
    fs.writeFileSync(fullPath, original);
  }

  // repo-template#340 (RT-340b): the same guard for the three manifest inputs
  // that were still read from the working tree after PR #363. Mutating any of
  // them must not move a single digest in the receipt, because none of them is
  // read from the checkout any more.
  selfTestManifestInputsAreFrozen(receipt);

  // The frozen payload set must remain reproducible by enumerating the frozen
  // commit's own tree.
  selfTestPayloadEnumerationIsPinned(receipt);
}

/**
 * Mutate each manifest input in the working tree and prove the receipt is
 * byte-identical afterwards. Before RT-340b this would have moved
 * `manifestDigests.releasePayloadSet`, `manifestDigests.artifactManifest`,
 * `manifestDigests.capabilityBundleRegistry`, `candidateReleaseReceipt` and
 * therefore `receiptDigest`, while `candidate.commit`/`candidate.tree` stayed
 * frozen -- the accepted identity-mismatched receipt the reviewer produced.
 */
function selfTestManifestInputsAreFrozen(receipt: PrePublicationReceipt): void {
  const expected = serializeReceipt(receipt);
  for (const relativePath of Object.values(FROZEN_MANIFEST_INPUT_PATHS)) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    const original = fs.readFileSync(fullPath);
    const mutated: unknown = JSON.parse(original.toString("utf8"));
    if (!isPlainObject(mutated)) {
      throw new Error(`Expected ${relativePath} to contain a JSON object`);
    }
    mutated["mutatedForSelfTest"] = FROZEN_CANDIDATE_COMMIT;
    try {
      fs.writeFileSync(fullPath, `${JSON.stringify(mutated, null, 2)}\n`, "utf8");
      if (serializeReceipt(buildPrePublicationReceipt()) !== expected) {
        throw new Error(
          `Mutating the working-tree copy of ${relativePath} changed the frozen receipt. Every receipt input must be read from ${FROZEN_CANDIDATE_COMMIT}, never from the checkout.`,
        );
      }
    } finally {
      fs.writeFileSync(fullPath, original);
    }
  }
}

/**
 * Prove the payload digest the receipt records is the one the frozen commit's
 * own tree enumerates to. `tools/release-payload.ts` used to enumerate
 * `git ls-tree -rz HEAD`, so any commit on top of the candidate rewrote the
 * frozen receipt's payload digest.
 *
 * This deliberately does NOT assert that `HEAD` enumerates to something
 * different. Non-selected paths (`self`-mode entries in `template-manifest.json`,
 * and the explicitly excluded documents) contribute nothing to the payload
 * digest, so a commit on top of the candidate that touches only those paths
 * legitimately enumerates to the same digest -- a "HEAD must differ" assertion
 * would fail a perfectly valid pinned receipt. The control that proves the
 * enumeration really follows its `ref` argument uses a purpose-built descendant
 * commit that changes a selected path, and lives in
 * `packages/adoption-shell/test/local-ci-v3-candidate.test.ts`
 * ("the release payload enumeration is pinned to the frozen commit, not HEAD"),
 * which runs in the same `pnpm verify` gate as this self-test.
 */
function selfTestPayloadEnumerationIsPinned(receipt: PrePublicationReceipt): void {
  const frozenDigest = constructReleasePayloadAt(FROZEN_CANDIDATE_COMMIT).payload.releaseDigest;
  if (receipt.manifestDigests.releasePayloadSet.manifestDigest !== frozenDigest) {
    throw new Error(
      `Receipt records releasePayloadSet digest ${receipt.manifestDigests.releasePayloadSet.manifestDigest}, but enumerating the frozen commit's tree yields ${frozenDigest}.`,
    );
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
