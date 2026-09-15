import { createHash } from "node:crypto";

import { sha256CanonicalJson } from "./digest.ts";
import { type Diagnostic, type ValidationResult } from "./contract.ts";
import { Diagnostics, isRecord } from "./validation-helpers.ts";

const GIT_SHA1_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RECEIPT_ID_PATTERN = /^receipt-issue-340-[a-z0-9]+$/;

/**
 * Consumer-side digest validator for the LocalCiContractV3 canary candidate /
 * pre-publication acceptance receipt (repo-template#340).
 *
 * Model Gateway (#991) and Repo Factory (#187) call this before binding any
 * local reconciliation to a candidate identity. It performs two independent
 * checks, either of which alone would let a schema-valid tampered receipt
 * through:
 *
 *   1. Structural/shape validation of the fields a consumer must trust
 *      (candidate commit/tree shape, receiptId shape, digest shape, ...).
 *   2. Digest recomputation: strip `receiptDigest`, recompute the canonical
 *      digest over the remaining body with the declared algorithm
 *      (`sha256-rfc8785-v1`), and reject unless it exactly matches the
 *      declared `receiptDigest`.
 *
 * A schema-valid receipt whose `receiptDigest` was not recomputed after a
 * manual edit (accidental corruption, partial copy/paste, hand-tampering)
 * fails step 2 even though every field individually still matches its shape
 * pattern. This closes the gap in PR #360 where only per-field shape was
 * checked and the cross-repository digest itself was never verified.
 */
export interface LocalCiV3CandidateReceiptLike {
  readonly schemaId: string;
  readonly schemaVersion: string;
  readonly contractId: string;
  readonly receiptKind: string;
  readonly receiptId: string;
  readonly publicationState: string;
  readonly candidate: {
    readonly repository: string;
    readonly origin: string;
    readonly semver: string;
    readonly tag: string;
    readonly commit: string;
    readonly tree: string;
  };
  readonly digestAlgorithm: string;
  readonly receiptDigest: string;
}

function finish<T>(value: T | undefined, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: rows };
}

function validateCandidateShape(value: unknown, diagnostics: Diagnostics): void {
  if (!diagnostics.object(
    value,
    "/candidate",
    ["repository", "origin", "semver", "tag", "commit", "tree"],
    ["repository", "origin", "semver", "tag", "commit", "tree"],
  )) {
    return;
  }
  const candidate = value;
  diagnostics.string(candidate["repository"], "/candidate/repository", { min: 1 });
  diagnostics.string(candidate["origin"], "/candidate/origin", { min: 1 });
  diagnostics.string(candidate["semver"], "/candidate/semver", { min: 5, max: 80 });
  diagnostics.string(candidate["tag"], "/candidate/tag", { pattern: /^v/ });
  diagnostics.string(candidate["commit"], "/candidate/commit", { pattern: GIT_SHA1_PATTERN });
  diagnostics.string(candidate["tree"], "/candidate/tree", { pattern: GIT_SHA1_PATTERN });
}

function hasValidatedShape(
  value: unknown,
  diagnostics: Diagnostics,
): value is LocalCiV3CandidateReceiptLike {
  return diagnostics.rows.length === 0 && isRecord(value);
}

/**
 * Schema-validate and digest-recompute a LocalCiContractV3 canary candidate
 * receipt. Returns `ok: true` only if the shape is trustworthy AND the
 * declared `receiptDigest` is exactly the canonical digest of the receipt
 * body (every field except `receiptDigest` itself).
 */
export function validateLocalCiV3CandidateReceiptV1(
  value: unknown,
): ValidationResult<LocalCiV3CandidateReceiptLike> {
  const diagnostics = new Diagnostics();

  if (!isRecord(value)) {
    diagnostics.add("E_TYPE", "", "expected object");
    return finish<LocalCiV3CandidateReceiptLike>(undefined, diagnostics);
  }

  diagnostics.string(value["schemaId"], "/schemaId", {
    constant:
      "https://schemas.repo-template.dev/local-ci-v3/canary-candidate-receipt.schema.json",
  });
  diagnostics.string(value["schemaVersion"], "/schemaVersion", { constant: "3.0.0" });
  diagnostics.string(value["contractId"], "/contractId", {
    constant: "repo-template/local-ci-v3-canary-candidate",
  });
  diagnostics.string(value["receiptKind"], "/receiptKind", {
    constant: "repo-template/local-ci-v3-candidate-receipt/v1",
  });
  diagnostics.string(value["receiptId"], "/receiptId", { pattern: RECEIPT_ID_PATTERN });
  diagnostics.string(value["publicationState"], "/publicationState", { constant: "candidate" });
  diagnostics.string(value["digestAlgorithm"], "/digestAlgorithm", {
    constant: "sha256-rfc8785-v1",
  });

  const declaredDigest = value["receiptDigest"];
  if (!diagnostics.string(declaredDigest, "/receiptDigest") || !SHA256_PATTERN.test(declaredDigest)) {
    diagnostics.add("E_SHA256", "/receiptDigest", "must be lowercase SHA-256 hex");
  }

  validateCandidateShape(value["candidate"], diagnostics);

  if (diagnostics.rows.length > 0) {
    return finish<LocalCiV3CandidateReceiptLike>(undefined, diagnostics);
  }

  // Digest recomputation: this is the check PR #360 never performed. Strip
  // receiptDigest and recompute the canonical digest of everything else;
  // a schema-valid but hand-tampered receipt fails here even though every
  // individual field still matches its declared shape.
  const { receiptDigest, ...body } = value;
  const recomputed = sha256CanonicalJson(body);
  if (recomputed !== receiptDigest) {
    diagnostics.add(
      "E_DIGEST_MISMATCH",
      "/receiptDigest",
      `declared receiptDigest ${String(receiptDigest)} does not match recomputed canonical digest ${recomputed}`,
    );
  }

  return finish(
    hasValidatedShape(value, diagnostics) ? (value as LocalCiV3CandidateReceiptLike) : undefined,
    diagnostics,
  );
}

export function isValidLocalCiV3CandidateReceiptV1(value: unknown): boolean {
  return validateLocalCiV3CandidateReceiptV1(value).ok;
}

/**
 * Reads the exact bytes a commit recorded at `relativePath`. A consumer that has
 * the producer repository checked out supplies one of these (typically wrapping
 * `git show <commit>:<path>`); a consumer holding only the receipt does not.
 */
export type FrozenBlobReader = (commit: string, relativePath: string) => Uint8Array;

/**
 * The manifest fields whose values must agree with the frozen file they cite:
 * receipt pointer -> [frozen path, field inside that file, field inside the
 * receipt's manifestDigests entry].
 */
const MANIFEST_DIGEST_BINDINGS = [
  ["releasePayloadSet", "release/release-payload-set.json", "releaseDigest", "manifestDigest"],
  ["releasePayloadSet", "release/release-payload-set.json", "payloadDigest", "payloadDigest"],
  [
    "artifactManifest",
    "artifacts/adoption-shell-v2/artifact-manifest.json",
    "manifestDigest",
    "manifestDigest",
  ],
  [
    "artifactManifest",
    "artifacts/adoption-shell-v2/artifact-manifest.json",
    "artifactDigest",
    "artifactDigest",
  ],
  [
    "capabilityBundleRegistry",
    "contracts/adoption-shell-v2/capability-bundle-registry.json",
    "registryDigest",
    "registryDigest",
  ],
] as const;

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Record(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    diagnostics.add("E_TYPE", pointer, "expected object");
    return undefined;
  }
  const rows: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string" || !SHA256_PATTERN.test(entry)) {
      diagnostics.add("E_SHA256", `${pointer}/${key}`, "must be lowercase SHA-256 hex");
      continue;
    }
    rows[key] = entry;
  }
  return rows;
}

function verifyDeclaredBlobDigests(
  commit: string,
  pointer: string,
  rows: Record<string, string>,
  readFrozenBlob: FrozenBlobReader,
  diagnostics: Diagnostics,
): void {
  for (const [relativePath, expected] of Object.entries(rows)) {
    let actual: string;
    try {
      actual = sha256Bytes(readFrozenBlob(commit, relativePath));
    } catch (error) {
      diagnostics.add(
        "E_FROZEN_INPUT_UNREADABLE",
        `${pointer}/${relativePath}`,
        `could not read ${relativePath} at commit ${commit}: ${String(error)}`,
      );
      continue;
    }
    if (actual !== expected) {
      diagnostics.add(
        "E_FROZEN_INPUT_MISMATCH",
        `${pointer}/${relativePath}`,
        `receipt declares ${expected} for ${relativePath}, but commit ${commit} records ${actual}`,
      );
    }
  }
}

function frozenJson(
  commit: string,
  relativePath: string,
  readFrozenBlob: FrozenBlobReader,
): Record<string, unknown> | undefined {
  const bytes = readFrozenBlob(commit, relativePath);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return isRecord(parsed) ? parsed : undefined;
}

function verifyManifestDigestsDescribeFrozenTree(
  commit: string,
  manifestDigests: unknown,
  readFrozenBlob: FrozenBlobReader,
  diagnostics: Diagnostics,
): void {
  if (!isRecord(manifestDigests)) {
    diagnostics.add("E_TYPE", "/manifestDigests", "expected object");
    return;
  }
  const frozenCache = new Map<string, Record<string, unknown> | undefined>();
  for (const [group, relativePath, frozenField, receiptField] of MANIFEST_DIGEST_BINDINGS) {
    const declaredGroup = manifestDigests[group];
    if (!isRecord(declaredGroup)) {
      diagnostics.add("E_TYPE", `/manifestDigests/${group}`, "expected object");
      continue;
    }
    if (!frozenCache.has(relativePath)) {
      try {
        frozenCache.set(relativePath, frozenJson(commit, relativePath, readFrozenBlob));
      } catch (error) {
        frozenCache.set(relativePath, undefined);
        diagnostics.add(
          "E_FROZEN_INPUT_UNREADABLE",
          `/manifestDigests/${group}`,
          `could not read ${relativePath} at commit ${commit}: ${String(error)}`,
        );
      }
    }
    const frozen = frozenCache.get(relativePath);
    if (frozen === undefined) continue;
    const expected = frozen[frozenField];
    const declared = declaredGroup[receiptField];
    if (declared !== expected) {
      diagnostics.add(
        "E_FROZEN_INPUT_MISMATCH",
        `/manifestDigests/${group}/${receiptField}`,
        `receipt declares ${String(declared)}, but ${relativePath} at commit ${commit} declares ${frozenField} ${String(expected)}`,
      );
    }
  }
}

/**
 * Prove the receipt's declared digests really describe the tree the receipt
 * names, by re-reading every declared input from the declared commit.
 *
 * `validateLocalCiV3CandidateReceiptV1` alone cannot do this. It rejects a
 * *tampered* receipt (a `receiptDigest` that was not recomputed after an edit),
 * but it accepts a *mismatched* one -- a receipt whose digest was honestly
 * recomputed over a body describing a different tree than `candidate.commit`.
 * That is exactly the defect repo-template#340 was reopened for: the producer
 * paired frozen commit 88591ee with the branch tip's payload-set and
 * artifact-manifest digests, and every digest-only gate accepted it.
 *
 * Model Gateway (#991) and Repo Factory (#187) check out the candidate commit
 * anyway, so they can and must run this before binding. It checks three things
 * against the declared commit: every `canonicalDigests` entry, every
 * `frozenInputs.blobDigests` entry, and that each `manifestDigests` value equals
 * the corresponding field inside the frozen file it cites.
 */
export function verifyLocalCiV3CandidateReceiptAgainstFrozenTree(
  value: unknown,
  readFrozenBlob: FrozenBlobReader,
): ValidationResult<LocalCiV3CandidateReceiptLike> {
  const base = validateLocalCiV3CandidateReceiptV1(value);
  if (!base.ok) return base;

  const diagnostics = new Diagnostics();
  if (!isRecord(value)) {
    diagnostics.add("E_TYPE", "", "expected object");
    return finish<LocalCiV3CandidateReceiptLike>(undefined, diagnostics);
  }
  const receipt = value;
  const commit = base.value.candidate.commit;

  const canonicalDigests = sha256Record(receipt["canonicalDigests"], "/canonicalDigests", diagnostics);
  const frozenInputs = receipt["frozenInputs"];
  if (!isRecord(frozenInputs)) {
    diagnostics.add("E_TYPE", "/frozenInputs", "expected object");
  }
  const blobDigests = isRecord(frozenInputs)
    ? sha256Record(frozenInputs["blobDigests"], "/frozenInputs/blobDigests", diagnostics)
    : undefined;

  if (diagnostics.rows.length > 0 || canonicalDigests === undefined || blobDigests === undefined) {
    return finish<LocalCiV3CandidateReceiptLike>(undefined, diagnostics);
  }

  verifyDeclaredBlobDigests(commit, "/canonicalDigests", canonicalDigests, readFrozenBlob, diagnostics);
  verifyDeclaredBlobDigests(
    commit,
    "/frozenInputs/blobDigests",
    blobDigests,
    readFrozenBlob,
    diagnostics,
  );
  verifyManifestDigestsDescribeFrozenTree(
    commit,
    receipt["manifestDigests"],
    readFrozenBlob,
    diagnostics,
  );

  return finish(diagnostics.rows.length === 0 ? base.value : undefined, diagnostics);
}

export type { Diagnostic };
