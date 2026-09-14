import type { ValidationResult } from "./contract.ts";
import { Diagnostics, isRecord } from "./validation-helpers.ts";
import {
  PRODUCT_PLATFORM_ROLES,
  REGISTRY_LIFECYCLE_STATES,
  isImmutableProvenance,
  type ComponentRegistryOverlay,
  type GrandfatheredDivergence,
  type ProductOverlay,
  type ProductOverlayProvenance,
  type ProductPlatformDefinition,
  type ProductPlatformRole,
  type RegistryEntryOverlay,
  type RegistryLifecycleState,
  type TechnologyRegistryOverlay,
} from "./product-overlay-contract.ts";
import { parseYamlOrJson } from "./product-overlay-yaml.ts";

function finish<T>(value: T | undefined, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 && value !== undefined ? { ok: true, value } : { ok: false, diagnostics: rows };
}

const ALLOWED_PRODUCT_OVERLAY_FIELDS = new Set([
  "$schema", "schemaId", "schemaVersion", "contractId",
  "bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion",
  "templateRelease", "templateDigest", "templateCommit",
  "provenance", "platforms", "grandfatheredDivergences",
]);

const ALLOWED_PROVENANCE_FIELDS = new Set([
  "contractId", "templateRelease", "templateDigest", "templateCommit",
  "bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion",
]);

const ALLOWED_PLATFORM_FIELDS = new Set([
  "role", "priority", "rationale", "revisitTrigger", "owner", "acceptanceSuites",
]);

const ALLOWED_REGISTRY_OVERLAY_FIELDS = new Set([
  "$schema", "schemaId", "schemaVersion", "contractId", "registryKind",
  "bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion",
  "templateRelease", "templateDigest", "templateCommit",
  "provenance", "technologies", "components",
]);

const ALLOWED_REGISTRY_ENTRY_FIELDS = new Set([
  "id", "state", "category", "contexts", "rationale",
  "revisitTrigger", "versionPolicy", "selectedVersion",
]);

function isPlatformRole(value: string): value is ProductPlatformRole {
  return (PRODUCT_PLATFORM_ROLES as readonly string[]).includes(value);
}

function isRegistryLifecycleState(value: string): value is RegistryLifecycleState {
  return (REGISTRY_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function checkUnknownProperties(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      diagnostics.add("E_UNKNOWN_PROPERTY", pointer === "" ? `/${key}` : `${pointer}/${key}`, "unknown property");
    }
  }
}

function checkProvenanceField(value: unknown, pointer: string, diagnostics: Diagnostics): boolean {
  if (value === undefined) return false;
  if (typeof value !== "string") {
    diagnostics.add("E_TYPE", pointer, "expected string");
    return false;
  }
  if (value.trim() === "" || !isImmutableProvenance(value)) {
    diagnostics.add(
      "E_MUTABLE_PROVENANCE",
      pointer,
      "provenance must be bound to immutable release evidence; mutable branch references and URLs are forbidden",
    );
    return false;
  }
  return true;
}

function checkHexProvenanceField(
  value: unknown,
  pointer: string,
  fieldName: string,
  length: number,
  diagnostics: Diagnostics,
): boolean {
  if (value === undefined) return false;
  if (typeof value !== "string") {
    diagnostics.add("E_TYPE", pointer, `${fieldName} must be a string`);
    return false;
  }
  const hexPattern = length === 64 ? /^[0-9a-f]{64}$/ : /^[0-9a-f]{40}$/;
  if (!hexPattern.test(value) || !isImmutableProvenance(value)) {
    diagnostics.add("E_MUTABLE_PROVENANCE", pointer, `${fieldName} must be a ${String(length)}-character lowercase hex string`);
    return false;
  }
  return true;
}

function checkProvenanceBlock(provenance: unknown, diagnostics: Diagnostics): boolean {
  if (provenance === undefined) return false;
  if (!isRecord(provenance)) {
    diagnostics.add("E_TYPE", "/provenance", "provenance must be an object");
    return false;
  }
  checkUnknownProperties(provenance, ALLOWED_PROVENANCE_FIELDS, "/provenance", diagnostics);
  let found = false;
  if (provenance["contractId"] !== undefined && typeof provenance["contractId"] !== "string") {
    diagnostics.add("E_TYPE", "/provenance/contractId", "contractId must be a string");
  }
  for (const field of ["bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion", "templateRelease"] as const) {
    if (checkProvenanceField(provenance[field], `/provenance/${field}`, diagnostics)) found = true;
  }
  if (checkHexProvenanceField(provenance["templateDigest"], "/provenance/templateDigest", "templateDigest", 64, diagnostics)) found = true;
  if (checkHexProvenanceField(provenance["templateCommit"], "/provenance/templateCommit", "templateCommit", 40, diagnostics)) found = true;
  return found;
}

function checkProvenanceEnvelope(obj: Record<string, unknown>, overlayKindName: string, diagnostics: Diagnostics): boolean {
  let hasEvidence = false;
  for (const field of ["bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion", "templateRelease"] as const) {
    if (checkProvenanceField(obj[field], `/${field}`, diagnostics)) hasEvidence = true;
  }
  if (checkHexProvenanceField(obj["templateDigest"], "/templateDigest", "templateDigest", 64, diagnostics)) hasEvidence = true;
  if (checkHexProvenanceField(obj["templateCommit"], "/templateCommit", "templateCommit", 40, diagnostics)) hasEvidence = true;
  if (checkProvenanceBlock(obj["provenance"], diagnostics)) hasEvidence = true;
  if (!hasEvidence) {
    diagnostics.add("E_REQUIRED_PROVENANCE", "", `${overlayKindName} overlay requires immutable release provenance (version, commit, or digest)`);
  }
  return hasEvidence;
}

function checkPlatformRole(
  role: unknown,
  def: Record<string, unknown>,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (role === undefined) {
    diagnostics.add("E_REQUIRED_ROLE", `${pointer}/role`, "role is required");
    return;
  }
  if (typeof role !== "string" || !isPlatformRole(role)) {
    diagnostics.add(
      "E_INVALID_ROLE",
      `${pointer}/role`,
      `invalid platform role: ${typeof role === "string" ? role : JSON.stringify(role)}; must be one of: ${PRODUCT_PLATFORM_ROLES.join(", ")}`,
    );
    return;
  }
  if (role === "dormant" && (typeof def["revisitTrigger"] !== "string" || def["revisitTrigger"].trim() === "")) {
    diagnostics.add("E_MISSING_DORMANT_REVISIT_TRIGGER", `${pointer}/revisitTrigger`, "dormant platform requires a non-empty revisitTrigger");
  }
  if (role === "not-targeted" && (typeof def["rationale"] !== "string" || def["rationale"].trim() === "")) {
    diagnostics.add("E_MISSING_NOT_TARGETED_RATIONALE", `${pointer}/rationale`, "not-targeted platform requires a non-empty rationale");
  }
}

function checkPlatformAcceptanceSuites(
  suites: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (suites === undefined) return;
  if (!Array.isArray(suites)) {
    diagnostics.add("E_TYPE", `${pointer}/acceptanceSuites`, "acceptanceSuites must be an array");
    return;
  }
  for (const [idx, suite] of suites.entries()) {
    if (typeof suite !== "string") {
      diagnostics.add("E_TYPE", `${pointer}/acceptanceSuites/${String(idx)}`, "acceptanceSuite item must be a string");
    }
  }
}

function checkPlatformMetadata(
  def: Record<string, unknown>,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const priority = def["priority"];
  if (priority !== undefined && (typeof priority !== "number" || priority < 0 || !Number.isInteger(priority))) {
    diagnostics.add("E_INVALID_PRIORITY", `${pointer}/priority`, "priority must be a non-negative integer");
  }
  for (const field of ["rationale", "revisitTrigger", "owner"] as const) {
    if (def[field] !== undefined && typeof def[field] !== "string") {
      diagnostics.add("E_TYPE", `${pointer}/${field}`, `${field} must be a string`);
    }
  }
  checkPlatformAcceptanceSuites(def["acceptanceSuites"], pointer, diagnostics);
}

function checkPlatformEntry(name: string, def: unknown, diagnostics: Diagnostics): void {
  const pointer = `/platforms/${name}`;
  if (!isRecord(def)) {
    diagnostics.add("E_TYPE", pointer, "platform definition must be an object");
    return;
  }
  checkUnknownProperties(def, ALLOWED_PLATFORM_FIELDS, pointer, diagnostics);
  checkPlatformRole(def["role"], def, pointer, diagnostics);
  checkPlatformMetadata(def, pointer, diagnostics);
}

function checkPlatformsBlock(platforms: unknown, diagnostics: Diagnostics): void {
  if (platforms === undefined) {
    diagnostics.add("E_REQUIRED_PLATFORMS", "/platforms", "platforms definition is required");
    return;
  }
  if (!isRecord(platforms)) {
    diagnostics.add("E_TYPE", "/platforms", "platforms must be an object");
    return;
  }
  const keys = Object.keys(platforms);
  if (keys.length === 0) {
    diagnostics.add("E_EMPTY_PLATFORMS", "/platforms", "at least one platform must be declared");
    return;
  }
  for (const name of keys) checkPlatformEntry(name, platforms[name], diagnostics);
}

function buildProvenance(prov: Record<string, unknown>): ProductOverlayProvenance {
  return Object.freeze({
    templateRelease: typeof prov["templateRelease"] === "string" ? prov["templateRelease"] : "legacy",
    ...(typeof prov["contractId"] === "string" ? { contractId: prov["contractId"] } : {}),
    ...(typeof prov["templateDigest"] === "string" ? { templateDigest: prov["templateDigest"] } : {}),
    ...(typeof prov["templateCommit"] === "string" ? { templateCommit: prov["templateCommit"] } : {}),
    ...(typeof prov["bootstrappedFromGuideVersion"] === "string" ? { bootstrappedFromGuideVersion: prov["bootstrappedFromGuideVersion"] } : {}),
    ...(typeof prov["lastAuditedAgainstGuideVersion"] === "string" ? { lastAuditedAgainstGuideVersion: prov["lastAuditedAgainstGuideVersion"] } : {}),
  });
}

function buildSinglePlatform(rawDef: unknown): ProductPlatformDefinition | undefined {
  if (!isRecord(rawDef) || typeof rawDef["role"] !== "string" || !isPlatformRole(rawDef["role"])) {
    return undefined;
  }
  let suites: readonly string[] | undefined;
  if (Array.isArray(rawDef["acceptanceSuites"])) {
    const validSuites: string[] = [];
    for (const s of rawDef["acceptanceSuites"]) {
      if (typeof s !== "string") return undefined;
      validSuites.push(s);
    }
    suites = Object.freeze(validSuites);
  }
  return {
    role: rawDef["role"],
    ...(typeof rawDef["priority"] === "number" ? { priority: rawDef["priority"] } : {}),
    ...(typeof rawDef["rationale"] === "string" ? { rationale: rawDef["rationale"] } : {}),
    ...(typeof rawDef["revisitTrigger"] === "string" ? { revisitTrigger: rawDef["revisitTrigger"] } : {}),
    ...(typeof rawDef["owner"] === "string" ? { owner: rawDef["owner"] } : {}),
    ...(suites !== undefined ? { acceptanceSuites: suites } : {}),
  };
}

function buildPlatforms(rawPlatforms: unknown): Record<string, ProductPlatformDefinition> {
  const platforms: Record<string, ProductPlatformDefinition> = {};
  if (!isRecord(rawPlatforms)) return platforms;
  for (const [name, rawDef] of Object.entries(rawPlatforms)) {
    const platform = buildSinglePlatform(rawDef);
    if (platform !== undefined) platforms[name] = platform;
  }
  return platforms;
}

function buildGrandfatheredDivergences(raw: unknown): readonly GrandfatheredDivergence[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: GrandfatheredDivergence[] = [];
  for (const item of raw) {
    if (isRecord(item) && typeof item["component"] === "string" && typeof item["current"] === "string" && typeof item["guideDefault"] === "string" && typeof item["rationale"] === "string") {
      result.push({
        component: item["component"], current: item["current"], guideDefault: item["guideDefault"], rationale: item["rationale"],
        ...(typeof item["guideSection"] === "string" ? { guideSection: item["guideSection"] } : {}),
        ...(typeof item["revisitTrigger"] === "string" ? { revisitTrigger: item["revisitTrigger"] } : {}),
      });
    }
  }
  return Object.freeze(result);
}

function buildProductOverlay(obj: Record<string, unknown>): ProductOverlay {
  const divergences = buildGrandfatheredDivergences(obj["grandfatheredDivergences"]);
  return Object.freeze({
    ...(typeof obj["$schema"] === "string" ? { $schema: obj["$schema"] } : {}),
    ...(typeof obj["schemaId"] === "string" ? { schemaId: obj["schemaId"] } : {}),
    ...(typeof obj["schemaVersion"] === "string" ? { schemaVersion: obj["schemaVersion"] } : {}),
    ...(typeof obj["contractId"] === "string" ? { contractId: obj["contractId"] } : {}),
    ...(typeof obj["bootstrappedFromGuideVersion"] === "string" ? { bootstrappedFromGuideVersion: obj["bootstrappedFromGuideVersion"] } : {}),
    ...(typeof obj["lastAuditedAgainstGuideVersion"] === "string" ? { lastAuditedAgainstGuideVersion: obj["lastAuditedAgainstGuideVersion"] } : {}),
    ...(typeof obj["templateRelease"] === "string" ? { templateRelease: obj["templateRelease"] } : {}),
    ...(typeof obj["templateDigest"] === "string" ? { templateDigest: obj["templateDigest"] } : {}),
    ...(typeof obj["templateCommit"] === "string" ? { templateCommit: obj["templateCommit"] } : {}),
    ...(isRecord(obj["provenance"]) ? { provenance: buildProvenance(obj["provenance"]) } : {}),
    platforms: Object.freeze(buildPlatforms(obj["platforms"])),
    ...(divergences !== undefined ? { grandfatheredDivergences: divergences } : {}),
  });
}

function parseOverlayInput(value: unknown, diagnostics: Diagnostics): Record<string, unknown> | undefined {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = parseYamlOrJson(value);
    } catch (err) {
      diagnostics.add("E_PARSE_ERROR", "", `failed to parse YAML/JSON: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }
  if (!isRecord(parsed)) {
    diagnostics.add("E_TYPE", "", "expected object");
    return undefined;
  }
  return parsed;
}

export function validateProductOverlay(value: unknown): ValidationResult<ProductOverlay> {
  const diagnostics = new Diagnostics();
  const obj = parseOverlayInput(value, diagnostics);
  if (obj === undefined) return finish<ProductOverlay>(undefined, diagnostics);

  checkUnknownProperties(obj, ALLOWED_PRODUCT_OVERLAY_FIELDS, "", diagnostics);
  checkProvenanceEnvelope(obj, "product", diagnostics);
  checkPlatformsBlock(obj["platforms"], diagnostics);

  if (obj["grandfatheredDivergences"] !== undefined && !Array.isArray(obj["grandfatheredDivergences"])) {
    diagnostics.add("E_TYPE", "/grandfatheredDivergences", "grandfatheredDivergences must be an array");
  }

  return finish<ProductOverlay>(diagnostics.rows.length === 0 ? buildProductOverlay(obj) : undefined, diagnostics);
}

function checkRegistryEntryContexts(
  contexts: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (contexts === undefined) return;
  if (!Array.isArray(contexts)) {
    diagnostics.add("E_TYPE", `${pointer}/contexts`, "contexts must be an array");
    return;
  }
  for (const [idx, ctx] of contexts.entries()) {
    if (typeof ctx !== "string") {
      diagnostics.add("E_TYPE", `${pointer}/contexts/${String(idx)}`, "context item must be a string");
    }
  }
}

function checkRegistryEntry(entriesKey: string, id: string, def: unknown, diagnostics: Diagnostics): void {
  const pointer = `/${entriesKey}/${id}`;
  if (!isRecord(def)) {
    diagnostics.add("E_TYPE", pointer, "entry must be an object");
    return;
  }
  checkUnknownProperties(def, ALLOWED_REGISTRY_ENTRY_FIELDS, pointer, diagnostics);
  const state = def["state"];
  if (state === undefined) {
    diagnostics.add("E_REQUIRED", `${pointer}/state`, "state is required");
  } else if (typeof state !== "string" || !isRegistryLifecycleState(state)) {
    diagnostics.add("E_INVALID_LIFECYCLE_STATE", `${pointer}/state`, `invalid lifecycle state: ${typeof state === "string" ? state : JSON.stringify(state)}; must be one of: ${REGISTRY_LIFECYCLE_STATES.join(", ")}`);
  }

  for (const strField of ["id", "category", "rationale", "revisitTrigger", "versionPolicy", "selectedVersion"] as const) {
    if (def[strField] !== undefined && typeof def[strField] !== "string") {
      diagnostics.add("E_TYPE", `${pointer}/${strField}`, `${strField} must be a string`);
    }
  }

  checkRegistryEntryContexts(def["contexts"], pointer, diagnostics);
}

function checkRegistryEntries(entriesVal: unknown, entriesKey: string, diagnostics: Diagnostics): void {
  if (entriesVal === undefined) {
    diagnostics.add("E_REQUIRED", `/${entriesKey}`, `${entriesKey} is required`);
    return;
  }
  if (!isRecord(entriesVal)) {
    diagnostics.add("E_TYPE", `/${entriesKey}`, `${entriesKey} must be an object`);
    return;
  }
  for (const [id, def] of Object.entries(entriesVal)) checkRegistryEntry(entriesKey, id, def, diagnostics);
}

function buildSingleRegistryEntry(rawDef: unknown): RegistryEntryOverlay | undefined {
  if (!isRecord(rawDef) || typeof rawDef["state"] !== "string" || !isRegistryLifecycleState(rawDef["state"])) {
    return undefined;
  }
  let contexts: readonly string[] | undefined;
  if (Array.isArray(rawDef["contexts"])) {
    const validContexts: string[] = [];
    for (const item of rawDef["contexts"]) {
      if (typeof item !== "string") return undefined;
      validContexts.push(item);
    }
    contexts = Object.freeze(validContexts);
  }
  return {
    state: rawDef["state"],
    ...(typeof rawDef["id"] === "string" ? { id: rawDef["id"] } : {}),
    ...(typeof rawDef["category"] === "string" ? { category: rawDef["category"] } : {}),
    ...(contexts !== undefined ? { contexts } : {}),
    ...(typeof rawDef["rationale"] === "string" ? { rationale: rawDef["rationale"] } : {}),
    ...(typeof rawDef["revisitTrigger"] === "string" ? { revisitTrigger: rawDef["revisitTrigger"] } : {}),
    ...(typeof rawDef["versionPolicy"] === "string" ? { versionPolicy: rawDef["versionPolicy"] } : {}),
    ...(typeof rawDef["selectedVersion"] === "string" ? { selectedVersion: rawDef["selectedVersion"] } : {}),
  };
}

function buildRegistryEntries(rawEntries: unknown): Record<string, RegistryEntryOverlay> {
  const result: Record<string, RegistryEntryOverlay> = {};
  if (!isRecord(rawEntries)) return result;
  for (const [id, rawDef] of Object.entries(rawEntries)) {
    const entry = buildSingleRegistryEntry(rawDef);
    if (entry !== undefined) result[id] = entry;
  }
  return result;
}

function checkRegistryOverlayEnvelope(
  obj: Record<string, unknown>,
  expectedKind: "technology" | "component",
  entriesKey: "technologies" | "components",
  diagnostics: Diagnostics,
): void {
  checkUnknownProperties(obj, ALLOWED_REGISTRY_OVERLAY_FIELDS, "", diagnostics);
  const kind = obj["registryKind"];
  if (kind !== expectedKind && kind !== `${expectedKind}-overlay`) {
    diagnostics.add("E_INVALID_KIND", "/registryKind", `registryKind must be '${expectedKind}' or '${expectedKind}-overlay'`);
  }
  checkProvenanceEnvelope(obj, `${expectedKind} registry`, diagnostics);
  checkRegistryEntries(obj[entriesKey], entriesKey, diagnostics);
}

function buildBaseRegistryOverlay(
  obj: Record<string, unknown>,
): {
  readonly $schema?: string;
  readonly schemaId?: string;
  readonly schemaVersion?: string;
  readonly contractId?: string;
  readonly bootstrappedFromGuideVersion?: string;
  readonly lastAuditedAgainstGuideVersion?: string;
  readonly templateRelease?: string;
  readonly templateDigest?: string;
  readonly templateCommit?: string;
  readonly provenance?: ProductOverlayProvenance;
} {
  return {
    ...(typeof obj["$schema"] === "string" ? { $schema: obj["$schema"] } : {}),
    ...(typeof obj["schemaId"] === "string" ? { schemaId: obj["schemaId"] } : {}),
    ...(typeof obj["schemaVersion"] === "string" ? { schemaVersion: obj["schemaVersion"] } : {}),
    ...(typeof obj["contractId"] === "string" ? { contractId: obj["contractId"] } : {}),
    ...(typeof obj["bootstrappedFromGuideVersion"] === "string" ? { bootstrappedFromGuideVersion: obj["bootstrappedFromGuideVersion"] } : {}),
    ...(typeof obj["lastAuditedAgainstGuideVersion"] === "string" ? { lastAuditedAgainstGuideVersion: obj["lastAuditedAgainstGuideVersion"] } : {}),
    ...(typeof obj["templateRelease"] === "string" ? { templateRelease: obj["templateRelease"] } : {}),
    ...(typeof obj["templateDigest"] === "string" ? { templateDigest: obj["templateDigest"] } : {}),
    ...(typeof obj["templateCommit"] === "string" ? { templateCommit: obj["templateCommit"] } : {}),
    ...(isRecord(obj["provenance"]) ? { provenance: buildProvenance(obj["provenance"]) } : {}),
  };
}

export function validateTechnologyRegistryOverlay(value: unknown): ValidationResult<TechnologyRegistryOverlay> {
  const diagnostics = new Diagnostics();
  const obj = parseOverlayInput(value, diagnostics);
  if (obj === undefined) return finish<TechnologyRegistryOverlay>(undefined, diagnostics);

  checkRegistryOverlayEnvelope(obj, "technology", "technologies", diagnostics);
  const built: TechnologyRegistryOverlay = Object.freeze({
    ...buildBaseRegistryOverlay(obj),
    registryKind: "technology",
    technologies: Object.freeze(buildRegistryEntries(obj["technologies"])),
  });
  return finish<TechnologyRegistryOverlay>(diagnostics.rows.length === 0 ? built : undefined, diagnostics);
}

export function validateComponentRegistryOverlay(value: unknown): ValidationResult<ComponentRegistryOverlay> {
  const diagnostics = new Diagnostics();
  const obj = parseOverlayInput(value, diagnostics);
  if (obj === undefined) return finish<ComponentRegistryOverlay>(undefined, diagnostics);

  checkRegistryOverlayEnvelope(obj, "component", "components", diagnostics);
  const built: ComponentRegistryOverlay = Object.freeze({
    ...buildBaseRegistryOverlay(obj),
    registryKind: "component",
    components: Object.freeze(buildRegistryEntries(obj["components"])),
  });
  return finish<ComponentRegistryOverlay>(diagnostics.rows.length === 0 ? built : undefined, diagnostics);
}
