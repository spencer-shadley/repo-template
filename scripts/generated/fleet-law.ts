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
export const FLEET_LAW_REVISION = 2;

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
  governedIntakeProducer: {
    schema: string;
    revision: number;
    payloadDigest: string;
    producer: { repository: string; defaultBranch: string; releaseCommit: string; producerCommit: string; sourcePath: string; sourceBlobSha: string; releaseManifestPath: string; releaseManifestBlobSha: string };
  };
  publication: { ready: boolean; reason: string; requiredProducerNamespace: string };
  assessmentAuthority: { producerRevision: number; producerCommit: string; payloadDigest: string; priorityRequiredExactLabels: string[]; preparationCodeSourceCommit: string | null };
  dimensions: Record<string, Record<string, unknown>>;
  lifecycle: Record<string, unknown>;
  bannedLabelPatterns: string[];
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

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function verifyAuthority(projection: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const publication = record(projection["publication"]);
  const pin = record(projection["governedIntakeProducer"]);
  const producer = record(pin["producer"]);
  const assessment = record(projection["assessmentAuthority"]);
  if (typeof publication["ready"] !== "boolean" || publication["requiredProducerNamespace"] !== "metadata:triage-v") errors.push("publication must declare readiness and metadata namespace");
  if (pin["schema"] !== "GovernedIntakeCurrentReleasePinV1" || pin["revision"] !== projection["governedIntakeRevision"] || producer["repository"] !== "spencer-shadley/.github" || typeof pin["payloadDigest"] !== "string" || !/^sha256:[0-9a-f]{64}$/.test(pin["payloadDigest"])) errors.push("invalid producer pin");
  if (assessment["producerRevision"] !== pin["revision"] || assessment["producerCommit"] !== producer["producerCommit"] || assessment["payloadDigest"] !== pin["payloadDigest"] || !Array.isArray(assessment["priorityRequiredExactLabels"])) errors.push("assessment authority must match producer");
  if (publication["ready"] === true && !sameJson(assessment["priorityRequiredExactLabels"], [])) errors.push("activated taxonomy cannot retain preparation requirements");
  return errors;
}

function verifyDimensions(projection: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const dimensions = record(projection["dimensions"]);
  for (const name of ["delivers", "type", "source", "effort", "priority:repo", "priority:fleet", "blocked", "environment", "progress", "decomp", "resolution", "metadata"]) {
    errors.push(...verifyDimensionRule(name, record(dimensions[name])));
  }
  const status = record(projection["status"]);
  const progress = record(dimensions["progress"]);
  if (!sameJson(status["labels"], progress["labels"])) errors.push("status must match progress dimension");
  return errors;
}

function verifyDimensionRule(name: string, rule: Record<string, unknown>): string[] {
  const errors: string[] = [];
    if (!Array.isArray(rule["labels"])) errors.push(`missing dimension ${name}`);
    if (["delivers", "type", "source", "blocked", "environment"].includes(name) && rule["maximum"] !== null) errors.push(`${name} must permit multiple values`);
    if (["type", "source", "effort", "priority:repo", "priority:fleet"].includes(name) && rule["minimumAfterTriage"] !== 1) errors.push(`${name} minimum after triage`);
    if (["effort", "priority:repo", "priority:fleet"].includes(name) && rule["maximum"] !== 1) errors.push(`${name} must be exactly one`);
    if (name === "progress" && (rule["minimum"] !== 1 || rule["maximum"] !== 1)) errors.push("progress must be exactly one");
    if (name === "resolution" && (rule["minimumWhileOpen"] !== 0 || rule["maximumWhileOpen"] !== 0 || rule["minimumWhenResolved"] !== 1 || rule["maximum"] !== 1)) errors.push("resolution cardinality");
  return errors;
}

function verifyLifecycle(projection: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const lifecycle = record(projection["lifecycle"]);
  const obsolete = record(lifecycle["obsolete"]);
  if (obsolete["immediateBeforeImplementation"] !== true || obsolete["preserveLastActualProgress"] !== true || obsolete["descriptiveTypesAuthorizeClosure"] !== false || !sameJson(obsolete["requires"], ["causing_issue", "exact_accepted_decision_or_comment", "cause_backlink_listing_obsolete_issues"])) errors.push("obsolete requires causal immediate closure and preserved progress");
  if (lifecycle["nonDeliveryPreservesProgress"] !== true || lifecycle["deliveredRequires"] !== "verified_acceptance") errors.push("closure must preserve actual progress");
  const reopen = record(lifecycle["reopen"]);
  if (reopen["clearResolution"] !== true || reopen["clearInvalidStamp"] !== true || reopen["freshCurrentProducerAssessment"] !== true) errors.push("reopen requires fresh assessment");
  return errors;
}

function verifyDefinitionSet(projection: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const dimensions = record(projection["dimensions"]);
  const patterns = projection["bannedLabelPatterns"];
  if (!Array.isArray(patterns) || patterns.some((v) => typeof v !== "string")) errors.push("bannedLabelPatterns must be strings");
  const retiredPatterns: RegExp[] = [];
  if (Array.isArray(patterns)) for (const pattern of patterns) { try { retiredPatterns.push(new RegExp(String(pattern), "i")); } catch { errors.push("invalid banned label pattern"); } }
  const definitions = projection["labels"];
  if (Array.isArray(definitions)) {
    const names = new Set<string>();
    for (const item of definitions) {
      if (!isRecord(item)) { errors.push("label must be an object"); continue; }
      const name = String(item["name"]).toLowerCase();
      if (names.has(name)) errors.push(`duplicate label ${name}`);
      names.add(name);
      if (retiredPatterns.some((pattern) => pattern.test(name)) || (Array.isArray(projection["bannedLabels"]) && projection["bannedLabels"].includes(name))) errors.push(`retired label ${name}`);
    }
    errors.push(...verifyDimensionDefinitions(dimensions, names));
  }
  return errors;
}

function verifyDimensionDefinitions(dimensions: Record<string, unknown>, names: Set<string>): string[] {
  const errors: string[] = [];
    for (const rule of Object.values(dimensions)) {
      if (!isRecord(rule) || !Array.isArray(rule["labels"])) continue;
      const missing = rule["labels"].filter((name) => !names.has(String(name)));
      errors.push(...missing.map((name) => `missing dimension label ${String(name)}`));
    }

  return errors;
}

function verifyPriority(projection: Record<string, unknown>): string[] {
  const errors: string[] = [];
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
      !sameJson(triplet["requiredExactLabels"], isRecord(projection["assessmentAuthority"]) ? projection["assessmentAuthority"]["priorityRequiredExactLabels"] : undefined)
    ) {
      errors.push("priority.confirmedTriplet must require priority:rubric-v1 and exactly 1 count per dimension");
    }
  }

  return errors;
}

function verifyLabelFields(projection: Record<string, unknown>): string[] {
  const errors: string[] = [];
  // Labels check
  const labels = projection["labels"];
  if (!Array.isArray(labels) || labels.length < 30) {
    errors.push("labels must be an array of at least 30 governed definitions");
  } else {
    for (const item of labels) {
      if (!isRecord(item)) continue;
      errors.push(...verifyLabel(item));
    }
  }
  return errors;
}

function verifyLabel(label: Record<string, unknown>): string[] {
  const errors: string[] = [];
      if (typeof label["name"] !== "string" || !label["name"].trim()) {
        errors.push("each label must have a non-empty name");
      }
      if (typeof label["description"] !== "string" || !label["description"].trim()) {
        errors.push(`label ${String(label["name"])} must have a non-empty description`);
      }
      if (typeof label["color"] !== "string" || !/^[0-9a-fA-F]{6}$/.test(label["color"])) {
        errors.push(`label ${String(label["name"])} must have a valid 6-hex color`);
      }
  return errors;
}

function verifyDigest(projection: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof projection["contentDigest"] !== "string" || !/^sha256:[0-9a-f]{64}$/.test(projection["contentDigest"])) {
    errors.push(`contentDigest must be a valid sha256:<64hex> string, got ${String(projection["contentDigest"])}`);
  } else {
    const expectedDigest = computeFleetLawDigest(projection);
    if (projection["contentDigest"] !== expectedDigest) {
      errors.push(`contentDigest mismatch: expected ${expectedDigest}, got ${projection["contentDigest"]}`);
    }
  }
  return errors;
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
  if (typeof projection["revision"] !== "number" || projection["revision"] !== FLEET_LAW_REVISION) {
    errors.push(`revision must be supported revision 2, got ${String(projection["revision"])}`);
  }
  if (typeof projection["sourceCommit"] !== "string" || !/^[0-9a-f]{40}$/i.test(projection["sourceCommit"])) {
    errors.push(`sourceCommit must be a 40-hex git SHA, got ${String(projection["sourceCommit"])}`);
  }
  errors.push(...verifyDigest(projection));

  if (typeof projection["governedIntakeRevision"] !== "number" || projection["governedIntakeRevision"] < 3) {
    errors.push(`governedIntakeRevision must be >= 3, got ${String(projection["governedIntakeRevision"])}`);
  }
  if (projection["currentTriageLabel"] !== `${isRecord(projection["publication"]) && projection["publication"]["ready"] === true ? "metadata:triage-v" : "triaged:v"}${String(projection["governedIntakeRevision"])}`) {
    errors.push(`currentTriageLabel must match triaged:v${String(projection["governedIntakeRevision"])}`);
  }

  errors.push(...verifyAuthority(projection), ...verifyDimensions(projection), ...verifyLifecycle(projection), ...verifyDefinitionSet(projection));

  // Banned labels check
  const banned = projection["bannedLabels"];
  if (
    !Array.isArray(banned) ||
    !banned.includes("priority:provisional") ||
    !banned.includes("work:triaged")
  ) {
    errors.push("bannedLabels must include priority:provisional and work:triaged");
  }

  errors.push(...verifyPriority(projection), ...verifyLabelFields(projection));

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
