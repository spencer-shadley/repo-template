import {
  type TemplateReleaseEvidence,
  type ValidationResult,
} from "./contract.ts";
import {
  Diagnostics,
  escapePointer,
  isRecord,
} from "./validation-helpers.ts";

const EVIDENCE_NAME_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const REVIEW_URL_PATTERN =
  /^https:\/\/github\.com\/spencer-shadley\/repo-template\/pull\/[1-9][0-9]*#pullrequestreview-[1-9][0-9]*$/;
const RECEIPT_URL_PATTERN =
  /^https:\/\/github\.com\/spencer-shadley\/[A-Za-z0-9_.-]+\/(?:issues|pull)\/[1-9][0-9]*#(?:issuecomment|pullrequestreview)-[1-9][0-9]*$/;

function finish<T>(value: T | undefined, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: rows };
}

function hasValidatedShape(value: unknown, diagnostics: Diagnostics): value is TemplateReleaseEvidence {
  return diagnostics.rows.length === 0;
}

function validateNamedRecord(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
  visit: (name: string, entry: unknown, pointer: string) => void,
): void {
  if (!isRecord(value)) {
    diagnostics.add("E_TYPE", pointer, "expected object");
    return;
  }
  const names = Object.keys(value);
  if (names.length < 1 || names.length > 32) {
    diagnostics.add("E_COUNT", pointer, "object must contain between 1 and 32 entries");
  }
  for (const name of names) {
    const entryPointer = `${pointer}/${escapePointer(name)}`;
    if (!EVIDENCE_NAME_PATTERN.test(name)) {
      diagnostics.add("E_FORMAT", entryPointer, "invalid evidence identity");
    }
    visit(name, value[name], entryPointer);
  }
}

function validateEvidenceReview(review: unknown, diagnostics: Diagnostics): void {
  if (!diagnostics.object(
      review,
      "/review",
      ["subject", "url", "result"],
      ["subject", "url", "result"],
    )) {
  	return;
  }

  const revRec = review;
  diagnostics.string(revRec["subject"], "/review/subject", {
    constant: "producer-commit",
  });
  diagnostics.string(revRec["url"], "/review/url", {
    min: 1,
    max: 512,
    pattern: REVIEW_URL_PATTERN,
  });
  diagnostics.string(revRec["result"], "/review/result", { constant: "approved" });
}

function validateEvidenceRollback(rollback: unknown, diagnostics: Diagnostics): void {
  if (!diagnostics.object(
      rollback,
      "/rollback",
      ["disposition", "supersession"],
      ["disposition", "supersession"],
    )) {
  	return;
  }

  const rbRec = rollback;
  diagnostics.string(rbRec["disposition"], "/rollback/disposition", {
    constant: "immutable-correct-forward",
  });
  diagnostics.string(rbRec["supersession"], "/rollback/supersession", {
    constant: "new-semver-only",
  });
}

export function validateTemplateReleaseEvidenceV1(
  value: unknown,
): ValidationResult<TemplateReleaseEvidence> {
  const diagnostics = new Diagnostics();
  const fields = [
    "review", "canaryReceipts", "checks", "publicationReadback", "rollback",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish<TemplateReleaseEvidence>(undefined, diagnostics);
  }

  validateEvidenceReview(value["review"], diagnostics);

  validateNamedRecord(
    value["canaryReceipts"],
    "/canaryReceipts",
    diagnostics,
    (_name, entry, pointer) => {
      if (!diagnostics.object(
        entry,
        pointer,
        ["url", "receiptSha256"],
        ["url", "receiptSha256"],
      )) return;
      const entryRec = entry;
      diagnostics.string(entryRec["url"], `${pointer}/url`, {
        min: 1,
        max: 512,
        pattern: RECEIPT_URL_PATTERN,
      });
      diagnostics.sha(entryRec["receiptSha256"], `${pointer}/receiptSha256`);
    },
  );

  validateNamedRecord(
    value["checks"],
    "/checks",
    diagnostics,
    (_name, entry, pointer) => {
      if (!diagnostics.object(entry, pointer, ["command", "result"], ["command", "result"])) {
        return;
      }
      const entryRec = entry;
      diagnostics.string(entryRec["command"], `${pointer}/command`, { min: 1, max: 2048 });
      diagnostics.string(entryRec["result"], `${pointer}/result`, { constant: "passed" });
    },
  );

  const readback = value["publicationReadback"];
  if (diagnostics.object(readback, "/publicationReadback", ["kind"], ["kind"])) {
    const rbRec = readback;
    diagnostics.string(rbRec["kind"], "/publicationReadback/kind", {
      constant: "producer-tag-ref/v1",
    });
  }

  validateEvidenceRollback(value["rollback"], diagnostics);

  return finish(
    hasValidatedShape(value, diagnostics) ? value : undefined,
    diagnostics,
  );
}
