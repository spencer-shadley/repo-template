/**
 * Governed Fleet Law Offline Consumer for repo-template (repo-template#381 / Code #4141 TEMPLATE-CONSUME).
 *
 * Consumes the exact Code #5439 fleet-law projection artifact.
 * Missing, corrupt, unsupported, or digest-mismatched policy bytes fail closed
 * before any consumer GitHub metadata effects.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FLEET_LAW_SCHEMA = "FleetLawProjectionV1";
export const FLEET_LAW_REVISION = 1;

export interface FleetLawLabelDefinition {
  name: string;
  description: string;
  color: string;
}

export interface FleetLawEvidence {
  schema: string;
  revision: number;
  sourceCommit: string;
  contentDigest: string;
  governedIntakeRevision: number;
}

export interface FleetLawProjectionV1 {
  schema: "FleetLawProjectionV1";
  revision: number;
  sourceCommit: string;
  contentDigest: string;
  sourceFile: string;
  governedIntakeRevision: number;
  currentTriageLabel: string;
  bannedLabels: string[];
  initialLabels: {
    exact: string[];
    prohibitedFilerPatterns: string[];
  };
  intake: {
    workTypes: string[];
    initialPriorityGuesses: string[];
    priorityReason: {
      required: boolean;
      singleLine: boolean;
      nonEmpty: boolean;
    };
    history: {
      preserveIssueBody: boolean;
      preserveEvidenceComments: boolean;
    };
  };
  priority: {
    levels: number[];
    rubricLabel: string;
    tbdLabel: string;
    p0CandidateLabel: string;
    waitSloBreachedLabel: string;
    repoPrefix: string;
    fleetPrefix: string;
    triage: {
      cadenceAuthority: string;
      confirmationTargetMinutes: Record<string, number>;
      missedTarget: string;
      never: string[];
    };
    confirmedTriplet: {
      requiredExactLabels: string[];
      repositoryPriorityPatterns: string[];
      fleetPriorityPatterns: string[];
      requiredCountPerPriorityDimension: number;
    };
    waitSloHours: Record<string, number>;
    repoColors: Record<string, string>;
    fleetColors: Record<string, string>;
    p0: Record<string, unknown>;
  };
  status: {
    labels: string[];
    filingDefault: string;
    progressStagesOrdered: string[];
  };
  effort: {
    labels: string[];
    exactlyOneWhenTriaged: boolean;
    missingMeansNotCheap: boolean;
  };
  tier: {
    labels: string[];
    exactlyOneWhenTriaged: boolean;
  };
  terminalDispositions: {
    labels: string[];
    vocabulary: string[];
    mutuallyExclusive: boolean;
  };
  p1TagOnlyBackfill: Record<string, unknown>;
  labels: FleetLawLabelDefinition[];
}

export class FleetLawError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FleetLawError";
  }
}

export class FleetLawMissingError extends FleetLawError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FleetLawMissingError";
  }
}

export class FleetLawCorruptError extends FleetLawError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FleetLawCorruptError";
  }
}

export class FleetLawDigestMismatchError extends FleetLawError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FleetLawDigestMismatchError";
  }
}

export class FleetLawUnsupportedError extends FleetLawError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FleetLawUnsupportedError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Compute reproducible SHA-256 digest of normalized projection contents
 * excluding contentDigest and volatile sourceCommit.
 */
export function computeFleetLawDigest(projection: Record<string, unknown>): string {
  const contentCopy: Record<string, unknown> = {};
  const excludedKeys = new Set(["contentDigest", "sourceCommit"]);
  const keys = Object.keys(projection).filter((k) => !excludedKeys.has(k)).sort();
  for (const key of keys) {
    contentCopy[key] = projection[key];
  }
  const canonicalString = JSON.stringify(contentCopy);
  const hash = createHash("sha256").update(canonicalString, "utf8").digest("hex");
  return `sha256:${hash}`;
}

export function verifyFleetLawProjection(projection: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(projection)) {
    errors.push("projection must be a non-null object");
    return errors;
  }
  if (projection["schema"] !== FLEET_LAW_SCHEMA) {
    errors.push(`schema must be ${FLEET_LAW_SCHEMA}, got ${String(projection["schema"])}`);
  }
  if (typeof projection["revision"] !== "number" || projection["revision"] < 1) {
    errors.push(`revision must be an integer >= 1, got ${String(projection["revision"])}`);
  }
  if (typeof projection["sourceCommit"] !== "string" || !/^[0-9a-f]{40}$/i.test(projection["sourceCommit"])) {
    errors.push(`sourceCommit must be a 40-hex git SHA, got ${String(projection["sourceCommit"])}`);
  }
  if (typeof projection["contentDigest"] !== "string" || !/^sha256:[0-9a-f]{64}$/.test(projection["contentDigest"])) {
    errors.push(`contentDigest must be a valid sha256:<64hex> string, got ${String(projection["contentDigest"])}`);
  } else {
    const expectedDigest = computeFleetLawDigest(projection);
    if (projection["contentDigest"] !== expectedDigest) {
      errors.push(`contentDigest mismatch: expected ${expectedDigest}, got ${projection["contentDigest"]}`);
    }
  }

  if (typeof projection["governedIntakeRevision"] !== "number" || projection["governedIntakeRevision"] < 3) {
    errors.push(`governedIntakeRevision must be >= 3, got ${String(projection["governedIntakeRevision"])}`);
  }
  if (projection["currentTriageLabel"] !== `triaged:v${String(projection["governedIntakeRevision"])}`) {
    errors.push(`currentTriageLabel must match triaged:v${String(projection["governedIntakeRevision"])}`);
  }

  // Banned labels check
  const banned = projection["bannedLabels"];
  if (
    !Array.isArray(banned) ||
    !banned.includes("priority:provisional") ||
    !banned.includes("work:triaged")
  ) {
    errors.push("bannedLabels must include priority:provisional and work:triaged");
  }

  // Priority check
  const priority = isRecord(projection["priority"]) ? (projection["priority"] as Record<string, unknown>) : null;
  if (!priority) {
    errors.push("priority must be an object");
  } else {
    const triage = isRecord(priority["triage"]) ? (priority["triage"] as Record<string, unknown>) : null;
    if (!triage || triage["cadenceAuthority"] !== "external") {
      errors.push("priority.triage.cadenceAuthority must be external");
    }

    const triplet = isRecord(priority["confirmedTriplet"]) ? (priority["confirmedTriplet"] as Record<string, unknown>) : null;
    if (
      !triplet ||
      triplet["requiredCountPerPriorityDimension"] !== 1 ||
      !sameJson(triplet["requiredExactLabels"], ["priority:rubric-v1"])
    ) {
      errors.push("priority.confirmedTriplet must require priority:rubric-v1 and exactly 1 count per dimension");
    }
  }

  // Labels check
  const labels = projection["labels"];
  if (!Array.isArray(labels) || labels.length < 30) {
    errors.push("labels must be an array of at least 30 governed definitions");
  } else {
    for (const label of labels as Array<Record<string, unknown>>) {
      if (typeof label["name"] !== "string" || !label["name"].trim()) {
        errors.push("each label must have a non-empty name");
      }
      if (typeof label["description"] !== "string" || !label["description"].trim()) {
        errors.push(`label ${String(label["name"])} must have a non-empty description`);
      }
      if (typeof label["color"] !== "string" || !/^[0-9a-fA-F]{6}$/.test(label["color"])) {
        errors.push(`label ${String(label["name"])} must have a valid 6-hex color`);
      }
    }
  }

  return errors;
}

const here = path.dirname(fileURLToPath(import.meta.url));

export function resolveFleetLawProjectionPath(customPath?: string): string {
  if (customPath) {
    const resolved = path.resolve(customPath);
    if (existsSync(resolved)) return resolved;
    throw new FleetLawMissingError(`Fleet law projection file missing at explicit path: ${resolved}`);
  }

  const candidatePaths = [
    path.resolve(here, "fleet-law-projection.v1.json"),
    path.resolve(process.cwd(), "scripts/generated/fleet-law-projection.v1.json"),
  ];

  for (const p of candidatePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  throw new FleetLawMissingError(
    `Fleet law projection missing. Checked candidate paths:\n${candidatePaths.map((p) => `  - ${p}`).join("\n")}`,
  );
}

export function loadFleetLawProjection(customPath?: string): FleetLawProjectionV1 {
  const filePath = resolveFleetLawProjectionPath(customPath);
  let rawText: string;
  try {
    rawText = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new FleetLawMissingError(`Failed to read fleet law projection at ${filePath}`, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new FleetLawCorruptError(`Corrupt JSON in fleet law projection at ${filePath}`, { cause: error });
  }

  const errors = verifyFleetLawProjection(parsed);
  if (errors.length > 0) {
    const record = parsed as Record<string, unknown> | null;
    if (record?.["schema"] !== FLEET_LAW_SCHEMA || typeof record?.["revision"] !== "number" || record["revision"] < 1) {
      throw new FleetLawUnsupportedError(
        `Unsupported fleet law projection schema/revision at ${filePath}:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
      );
    }
    const digestError = errors.find((e) => e.includes("contentDigest"));
    if (digestError) {
      throw new FleetLawDigestMismatchError(
        `Fleet law projection content digest mismatch at ${filePath}:\n  - ${digestError}`,
      );
    }
    throw new FleetLawCorruptError(
      `Invalid fleet law projection at ${filePath} (${String(errors.length)} errors):\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  return parsed as FleetLawProjectionV1;
}

export const FLEET_LAW_PROJECTION: FleetLawProjectionV1 = loadFleetLawProjection();

export const FLEET_LAW_EVIDENCE: FleetLawEvidence = Object.freeze({
  schema: FLEET_LAW_PROJECTION.schema,
  revision: FLEET_LAW_PROJECTION.revision,
  sourceCommit: FLEET_LAW_PROJECTION.sourceCommit,
  contentDigest: FLEET_LAW_PROJECTION.contentDigest,
  governedIntakeRevision: FLEET_LAW_PROJECTION.governedIntakeRevision,
});

export const FLEET_LAW_BANNED_LABELS: readonly string[] = Object.freeze([
  ...FLEET_LAW_PROJECTION.bannedLabels,
]);

export const FLEET_LAW_LABELS: Readonly<Record<string, FleetLawLabelDefinition>> = Object.freeze(
  Object.fromEntries(
    FLEET_LAW_PROJECTION.labels.map((def) => [def.name.toLowerCase(), Object.freeze({ ...def })]),
  ),
);

export function isFleetLawLabel(label: string): boolean {
  return Object.hasOwn(FLEET_LAW_LABELS, label.toLowerCase().trim());
}

export function getFleetLawLabelDefinition(label: string): FleetLawLabelDefinition | undefined {
  return FLEET_LAW_LABELS[label.toLowerCase().trim()];
}

export function assertFleetLawValid(projection: FleetLawProjectionV1 = FLEET_LAW_PROJECTION): void {
  const errors = verifyFleetLawProjection(projection);
  if (errors.length > 0) {
    throw new FleetLawCorruptError(
      `Fleet law projection is invalid (${String(errors.length)} errors):\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}
