import {
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type ValidationResult,
} from "./contract.ts";
import {
  DELIVERY_ANTI_GAMING_EXCLUSIONS,
  DELIVERY_COVERAGE_ERRORS,
  DELIVERY_COVERAGE_FIELDS,
  DELIVERY_EVIDENCE_KINDS,
  DELIVERY_SLI_IDS,
  DELIVERY_STAGES,
  type DeliveryDeclarationV1,
  type DeliveryEventV1,
} from "./delivery-measurement-contract.ts";
import {
  bool,
  exactArray,
  finish,
  number,
  oneOf,
  ref,
  schemaIdentity,
} from "./delivery-measurement-validation.ts";
import {
  assertSortedUnique,
  Diagnostics,
} from "./validation-helpers.ts";

function hasValidatedEvent(value: unknown, diagnostics: Diagnostics): value is DeliveryEventV1 { return diagnostics.rows.length === 0; }
function hasValidatedDeclaration(value: unknown, diagnostics: Diagnostics): value is DeliveryDeclarationV1 { return diagnostics.rows.length === 0; }
function finishEvent(value: unknown, diagnostics: Diagnostics): ValidationResult<DeliveryEventV1> { return hasValidatedEvent(value, diagnostics) ? finish(value, diagnostics) : { ok: false, diagnostics: diagnostics.sorted() }; }
function finishDeclaration(value: unknown, diagnostics: Diagnostics): ValidationResult<DeliveryDeclarationV1> { return hasValidatedDeclaration(value, diagnostics) ? finish(value, diagnostics) : { ok: false, diagnostics: diagnostics.sorted() }; }

const UTC_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function validateTokenUsage(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): string | null {
  const fields = [
    "attributionId",
    "stage",
    "provider",
    "model",
    "inputTokens",
    "outputTokens",
    "totalTokens",
  ];
  if (!diagnostics.object(value, pointer, fields, fields)) return null;
  const id = ref(value["attributionId"], `${pointer}/attributionId`, diagnostics)
    ? value["attributionId"]
    : null;
  oneOf(value["stage"], `${pointer}/stage`, DELIVERY_STAGES, diagnostics);
  ref(value["provider"], `${pointer}/provider`, diagnostics);
  ref(value["model"], `${pointer}/model`, diagnostics);
  const inputValue = value["inputTokens"];
  const outputValue = value["outputTokens"];
  const totalValue = value["totalTokens"];
  const input = number(inputValue, `${pointer}/inputTokens`, diagnostics, true);
  const output = number(outputValue, `${pointer}/outputTokens`, diagnostics, true);
  const total = number(totalValue, `${pointer}/totalTokens`, diagnostics, true);
  for (const field of ["inputTokens", "outputTokens", "totalTokens"] as const) {
    if (typeof value[field] === "number" && value[field] < 0) {
      diagnostics.add("E_RANGE", `${pointer}/${field}`, "token count must be non-negative");
    }
  }
  if (input && output && total && totalValue !== inputValue + outputValue) {
    diagnostics.add("E_TOKEN_TOTAL", `${pointer}/totalTokens`, "must equal inputTokens + outputTokens");
  }
  return id;
}

function validateQualifyingEvidence(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): number {
  const evidenceCount = diagnostics.array(
    value,
    `${pointer}/qualifyingEvidence`,
    0,
    16,
  )
    ? (value).length
    : 0;
  if (Array.isArray(value)) {
    for (const [index, row] of value.entries()) {
      const rowPointer = `${pointer}/qualifyingEvidence/${index}`;
      if (diagnostics.object(row, rowPointer, ["kind", "verificationRef"], ["kind", "verificationRef"])) {
        const rec = row;
        oneOf(rec["kind"], `${rowPointer}/kind`, DELIVERY_EVIDENCE_KINDS, diagnostics);
        ref(rec["verificationRef"], `${rowPointer}/verificationRef`, diagnostics);
      }
    }
  }
  return evidenceCount;
}

function validateActivityRefs(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (!diagnostics.array(value, `${pointer}/activityRefs`, 0, 128)) {
  	return;
  }

  const refs: string[] = [];
  for (const [index, row] of (value).entries()) {
    if (ref(row, `${pointer}/activityRefs/${index}`, diagnostics)) refs.push(row);
  }
  assertSortedUnique(refs, `${pointer}/activityRefs`, diagnostics);
}

interface OutcomeQualificationContext {
  readonly classPresent: boolean;
  readonly weight: boolean;
  readonly evidenceCount: number;
}

function validateOutcomeQualification(
  rec: Record<string, unknown>,
  ctx: OutcomeQualificationContext,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const meaningfulValue = rec["meaningful"];
  const statusValue = rec["status"];
  const weightValue = Number(rec["weight"]);
  const meaningfulClass = rec["meaningfulClass"];
  if (meaningfulValue) {
    if (
      statusValue !== "landed" ||
      !ctx.classPresent ||
      !ctx.weight ||
      weightValue <= 0 ||
      ctx.evidenceCount === 0
    ) {
      diagnostics.add(
        "E_MEANINGFUL_QUALIFICATION",
        pointer,
        "meaningful delivery requires landed status, class, positive weight, and qualifying evidence",
      );
    }
  } else if (
    meaningfulClass !== null ||
    weightValue !== 0 ||
    ctx.evidenceCount !== 0
  ) {
    diagnostics.add(
      "E_MEANINGFUL_QUALIFICATION",
      pointer,
      "non-meaningful outcome requires null class, zero weight, and no qualifying evidence",
    );
  }
}

function validateOutcome(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const fields = [
    "outcomeId", "status", "receiptRef", "meaningful",
    "meaningfulClass", "weight", "qualifyingEvidence", "activityRefs",
  ];
  if (!diagnostics.object(value, pointer, fields, fields)) return;
  const rec = value;
  ref(rec["outcomeId"], `${pointer}/outcomeId`, diagnostics);
  oneOf(rec["status"], `${pointer}/status`, ["landed", "non-delivery"], diagnostics);
  ref(rec["receiptRef"], `${pointer}/receiptRef`, diagnostics);
  const meaningfulValue = rec["meaningful"];
  const weightValue = Number(rec["weight"]);
  const meaningful = bool(meaningfulValue, `${pointer}/meaningful`, diagnostics);
  const weight = number(rec["weight"], `${pointer}/weight`, diagnostics);
  if (weight && (weightValue < 0 || weightValue > 1000)) {
    diagnostics.add("E_RANGE", `${pointer}/weight`, "weight must be between 0 and 1000");
  }
  const meaningfulClass = rec["meaningfulClass"];
  const classPresent =
    meaningfulClass === null
      ? false
      : ref(meaningfulClass, `${pointer}/meaningfulClass`, diagnostics);
  const evidenceCount = validateQualifyingEvidence(rec["qualifyingEvidence"], pointer, diagnostics);
  validateActivityRefs(rec["activityRefs"], pointer, diagnostics);
  if (meaningful) {
    validateOutcomeQualification(
      rec,
      { classPresent, weight, evidenceCount },
      pointer,
      diagnostics,
    );
  }
}

function validateSloDelta(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): string | null {
  const fields = ["sloRef", "measuredDelta", "verified", "verificationRef"];
  if (!diagnostics.object(value, pointer, fields, fields)) return null;
  const id = ref(value["sloRef"], `${pointer}/sloRef`, diagnostics)
    ? value["sloRef"]
    : null;
  number(value["measuredDelta"], `${pointer}/measuredDelta`, diagnostics);
  if (bool(value["verified"], `${pointer}/verified`, diagnostics)) {
    if (value["verified"]) {
      ref(value["verificationRef"], `${pointer}/verificationRef`, diagnostics);
    } else if (value["verificationRef"] !== null) {
      diagnostics.add("E_CONST", `${pointer}/verificationRef`, "unverified delta requires null");
    }
  }
  return id;
}

function validateHumanMessage(
  value: unknown,
  pointer: string,
  workId: unknown,
  diagnostics: Diagnostics,
): string | null {
  const fields = ["messageId", "kind", "primaryWorkId", "relatedRefs"];
  if (!diagnostics.object(value, pointer, fields, fields)) return null;
  const id = ref(value["messageId"], `${pointer}/messageId`, diagnostics)
    ? value["messageId"]
    : null;
  oneOf(value["kind"], `${pointer}/kind`, ["approve", "correct", "decide", "unblock"], diagnostics);
  if (
    ref(value["primaryWorkId"], `${pointer}/primaryWorkId`, diagnostics) &&
    value["primaryWorkId"] !== workId
  ) {
    diagnostics.add(
      "E_PRIMARY_ATTRIBUTION",
      `${pointer}/primaryWorkId`,
      "must equal the event workId",
    );
  }
  if (diagnostics.array(value["relatedRefs"], `${pointer}/relatedRefs`, 0, 128)) {
    const refs: string[] = [];
    for (const [index, row] of value["relatedRefs"].entries()) {
      if (ref(row, `${pointer}/relatedRefs/${index}`, diagnostics)) refs.push(row);
    }
    assertSortedUnique(refs, `${pointer}/relatedRefs`, diagnostics);
  }
  return id;
}

function validateEventCoverage(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (!diagnostics.object(value, pointer, ["complete", "errors"], ["complete", "errors"])) {
    return;
  }
  const rec = value;
  const complete = bool(rec["complete"], `${pointer}/complete`, diagnostics);
  if (diagnostics.array(rec["errors"], `${pointer}/errors`, 0, 32)) {
    const errors: string[] = [];
    for (const [index, row] of (rec["errors"]).entries()) {
      if (oneOf(row, `${pointer}/errors/${index}`, DELIVERY_COVERAGE_ERRORS, diagnostics)) {
        errors.push(row);
      }
    }
    assertSortedUnique(errors, `${pointer}/errors`, diagnostics);
    if (complete && rec["complete"] !== (errors.length === 0)) {
      diagnostics.add(
        "E_COVERAGE",
        pointer,
        "complete must be true exactly when coverage errors are empty",
      );
    }
  }
}

function validateTokenUsageArray(value: unknown, diagnostics: Diagnostics): void {
  if (!diagnostics.array(value, "/tokenUsage", 0, 128) || !Array.isArray(value)) return;
  const ids: string[] = [];
  for (const [index, row] of value.entries()) {
    const id = validateTokenUsage(row, `/tokenUsage/${index}`, diagnostics);
    if (id !== null) ids.push(id);
  }
  assertSortedUnique(ids, "/tokenUsage", diagnostics);
}

function validateSloDeltasArray(value: unknown, diagnostics: Diagnostics): void {
  if (!diagnostics.array(value, "/sloDeltas", 0, 128) || !Array.isArray(value)) return;
  const ids: string[] = [];
  for (const [index, row] of value.entries()) {
    const id = validateSloDelta(row, `/sloDeltas/${index}`, diagnostics);
    if (id !== null) ids.push(id);
  }
  assertSortedUnique(ids, "/sloDeltas", diagnostics);
}

function validateHumanMessagesArray(
  value: unknown,
  workId: unknown,
  diagnostics: Diagnostics,
): void {
  if (!diagnostics.array(value, "/humanMessages", 0, 128) || !Array.isArray(value)) return;
  const ids: string[] = [];
  for (const [index, row] of value.entries()) {
    const id = validateHumanMessage(
      row,
      `/humanMessages/${index}`,
      workId,
      diagnostics,
    );
    if (id !== null) ids.push(id);
  }
  assertSortedUnique(ids, "/humanMessages", diagnostics);
}

export function validateDeliveryEventV1(
  value: unknown,
): ValidationResult<DeliveryEventV1> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId", "schemaVersion", "schemaDigest", "contractId", "eventKind",
    "eventId", "workId", "repoRef", "planeRef", "fleetRef", "recordedAt",
    "tokenUsage", "outcome", "sloDeltas", "humanMessages", "coverage",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finishEvent(value, diagnostics);
  }
  schemaIdentity(value, SCHEMA_IDS.deliveryEvent, SCHEMA_DIGESTS.deliveryEvent, diagnostics);
  diagnostics.string(value["eventKind"], "/eventKind", {
    constant: "repo-template/delivery-event/v1",
  });
  for (const field of ["eventId", "workId", "repoRef", "planeRef", "fleetRef"] as const) {
    ref(value[field], `/${field}`, diagnostics);
  }
  if (
    diagnostics.string(value["recordedAt"], "/recordedAt", { max: 35 }) &&
    !UTC_INSTANT.test(value["recordedAt"])
  ) {
    diagnostics.add("E_FORMAT", "/recordedAt", "must be a UTC RFC 3339 instant");
  }
  validateTokenUsageArray(value["tokenUsage"], diagnostics);
  validateOutcome(value["outcome"], "/outcome", diagnostics);
  validateSloDeltasArray(value["sloDeltas"], diagnostics);
  validateHumanMessagesArray(value["humanMessages"], value["workId"], diagnostics);
  validateEventCoverage(value["coverage"], "/coverage", diagnostics);
  return finishEvent(value, diagnostics);
}

function validateClass(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): string | null {
  const fields = ["classId", "description", "evidenceKinds", "aggregationMode", "weight"];
  if (!diagnostics.object(value, pointer, fields, fields)) return null;
  const id = ref(value["classId"], `${pointer}/classId`, diagnostics)
    ? value["classId"]
    : null;
  diagnostics.string(value["description"], `${pointer}/description`, { min: 1, max: 500 });
  if (diagnostics.array(value["evidenceKinds"], `${pointer}/evidenceKinds`, 1, 4)) {
    const kinds: string[] = [];
    for (const [index, row] of value["evidenceKinds"].entries()) {
      if (oneOf(row, `${pointer}/evidenceKinds/${index}`, DELIVERY_EVIDENCE_KINDS, diagnostics)) {
        kinds.push(row);
      }
    }
    assertSortedUnique(kinds, `${pointer}/evidenceKinds`, diagnostics);
  }
  const mode = oneOf(
    value["aggregationMode"],
    `${pointer}/aggregationMode`,
    ["segmented", "weighted"],
    diagnostics,
  );
  if (mode && value["aggregationMode"] === "weighted") {
    if (
      !number(value["weight"], `${pointer}/weight`, diagnostics) ||
      value["weight"] <= 0 ||
      value["weight"] > 1000
    ) {
      diagnostics.add(
        "E_RANGE",
        `${pointer}/weight`,
        "weighted class requires a weight greater than 0 and at most 1000",
      );
    }
  } else if (mode && value["weight"] !== null) {
    diagnostics.add("E_CONST", `${pointer}/weight`, "segmented class requires null weight");
  }
  return id;
}

function validateDeclarationRepoBinding(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const fields = [
    "repoRef", "planeRef", "fleetRef", "registryGeneration",
    "registryDigest", "centralRollupRef",
  ];
  if (!diagnostics.object(value, pointer, fields, fields)) return;
  const rec = value;
  for (const field of ["repoRef", "planeRef", "fleetRef", "registryGeneration", "centralRollupRef"] as const) {
    ref(rec[field], `${pointer}/${field}`, diagnostics);
  }
  diagnostics.sha(rec["registryDigest"], `${pointer}/registryDigest`);
}

function validateDeclarationTokenAttribution(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const fields = ["stages", "requireComplete", "unattributedPolicy"];
  if (!diagnostics.object(value, pointer, fields, fields)) return;
  const rec = value;
  exactArray(rec["stages"], `${pointer}/stages`, DELIVERY_STAGES, diagnostics);
  if (rec["requireComplete"] !== true) {
    diagnostics.add("E_CONST", `${pointer}/requireComplete`, "must be true");
  }
  diagnostics.string(rec["unattributedPolicy"], `${pointer}/unattributedPolicy`, {
    constant: "visible-coverage-error-in-totals",
  });
}

function validateDeclarationSlis(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (!diagnostics.array(value, pointer, 6, 6)) return;
  const ids: string[] = [];
  for (const [index, row] of (value).entries()) {
    const rowPointer = `${pointer}/${index}`;
    const sliFields = [
      "id", "scopes", "targetRef", "budgetRef", "windowRef",
      "exceptionPolicyRef", "revisitTrigger", "centralRollupRef",
    ];
    if (!diagnostics.object(row, rowPointer, sliFields, sliFields)) continue;
    const rec = row;
    if (oneOf(rec["id"], `${rowPointer}/id`, DELIVERY_SLI_IDS, diagnostics)) ids.push(rec["id"]);
    exactArray(rec["scopes"], `${rowPointer}/scopes`, ["fleet", "plane", "repo"], diagnostics);
    for (const field of ["targetRef", "budgetRef", "windowRef", "exceptionPolicyRef", "centralRollupRef"] as const) {
      ref(rec[field], `${rowPointer}/${field}`, diagnostics);
    }
    diagnostics.string(rec["revisitTrigger"], `${rowPointer}/revisitTrigger`, { min: 1, max: 500 });
  }
  assertSortedUnique(ids, pointer, diagnostics);
  if (ids.some((row, index) => row !== DELIVERY_SLI_IDS[index])) {
    diagnostics.add("E_COVERAGE", pointer, "all six SLI identities are required exactly once");
  }
}

function validateDeclarationEventCapture(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const fields = ["appendOnly", "eventKind", "coverageErrorPolicy", "requiredCoverage"];
  if (!diagnostics.object(value, pointer, fields, fields)) return;
  const rec = value;
  if (rec["appendOnly"] !== true) {
    diagnostics.add("E_CONST", `${pointer}/appendOnly`, "must be true");
  }
  diagnostics.string(rec["eventKind"], `${pointer}/eventKind`, {
    constant: "repo-template/delivery-event/v1",
  });
  diagnostics.string(rec["coverageErrorPolicy"], `${pointer}/coverageErrorPolicy`, {
    constant: "visible-non-blocking",
  });
  exactArray(rec["requiredCoverage"], `${pointer}/requiredCoverage`, DELIVERY_COVERAGE_FIELDS, diagnostics);
}

export function validateDeliveryDeclarationV1(
  value: unknown,
): ValidationResult<DeliveryDeclarationV1> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId", "schemaVersion", "schemaDigest", "contractId", "declarationKind",
    "classificationGeneration", "repoBinding", "meaningfulClasses",
    "antiGamingExclusions", "tokenAttribution", "slis", "eventCapture",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finishDeclaration(value, diagnostics);
  }
  schemaIdentity(
    value,
    SCHEMA_IDS.deliveryDeclaration,
    SCHEMA_DIGESTS.deliveryDeclaration,
    diagnostics,
  );
  diagnostics.string(value["declarationKind"], "/declarationKind", {
    constant: "repo-template/delivery-declaration/v1",
  });
  ref(value["classificationGeneration"], "/classificationGeneration", diagnostics);
  validateDeclarationRepoBinding(value["repoBinding"], "/repoBinding", diagnostics);
  if (diagnostics.array(value["meaningfulClasses"], "/meaningfulClasses", 1, 128)) {
    const ids: string[] = [];
    for (const [index, row] of value["meaningfulClasses"].entries()) {
      const id = validateClass(row, `/meaningfulClasses/${index}`, diagnostics);
      if (id !== null) ids.push(id);
    }
    assertSortedUnique(ids, "/meaningfulClasses", diagnostics);
  }
  exactArray(
    value["antiGamingExclusions"],
    "/antiGamingExclusions",
    DELIVERY_ANTI_GAMING_EXCLUSIONS,
    diagnostics,
  );
  validateDeclarationTokenAttribution(value["tokenAttribution"], "/tokenAttribution", diagnostics);
  validateDeclarationSlis(value["slis"], "/slis", diagnostics);
  validateDeclarationEventCapture(value["eventCapture"], "/eventCapture", diagnostics);
  return finishDeclaration(value, diagnostics);
}
