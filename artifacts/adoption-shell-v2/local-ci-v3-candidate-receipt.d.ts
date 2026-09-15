import { type Diagnostic, type ValidationResult } from "./contract.ts";
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
/**
 * Schema-validate and digest-recompute a LocalCiContractV3 canary candidate
 * receipt. Returns `ok: true` only if the shape is trustworthy AND the
 * declared `receiptDigest` is exactly the canonical digest of the receipt
 * body (every field except `receiptDigest` itself).
 */
export declare function validateLocalCiV3CandidateReceiptV1(value: unknown): ValidationResult<LocalCiV3CandidateReceiptLike>;
export declare function isValidLocalCiV3CandidateReceiptV1(value: unknown): boolean;
/**
 * Reads the exact bytes a commit recorded at `relativePath`. A consumer that has
 * the producer repository checked out supplies one of these (typically wrapping
 * `git show <commit>:<path>`); a consumer holding only the receipt does not.
 */
export type FrozenBlobReader = (commit: string, relativePath: string) => Uint8Array;
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
export declare function verifyLocalCiV3CandidateReceiptAgainstFrozenTree(value: unknown, readFrozenBlob: FrozenBlobReader): ValidationResult<LocalCiV3CandidateReceiptLike>;
export type { Diagnostic };
