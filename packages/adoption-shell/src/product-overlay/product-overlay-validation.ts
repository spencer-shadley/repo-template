import type { ValidationResult } from "../contract.ts";
import { Diagnostics, isRecord } from "../validation-helpers.ts";
import {
  COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID,
  PRODUCT_OVERLAY_CONTRACT_ID,
  PRODUCT_OVERLAY_SCHEMA_ID,
  PRODUCT_OVERLAY_SCHEMA_VERSION,
  PRODUCT_PLATFORM_ROLES,
  REGISTRY_LIFECYCLE_STATES,
  TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID,
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
  "$schema", "schemaId", "schemaVersion", "contractId", "bootstrappedFromGuideVersion",
  "lastAuditedAgainstGuideVersion", "templateRelease", "templateDigest", "templateCommit",
  "provenance", "platforms", "grandfatheredDivergences",
]);
const ALLOWED_PROVENANCE_FIELDS = new Set([
  "contractId", "templateRelease", "templateDigest", "templateCommit",
  "bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion",
]);
const ALLOWED_PLATFORM_FIELDS = new Set([
  "role", "priority", "rationale", "revisitTrigger", "owner", "acceptanceSuites",
]);
const BASE_REGISTRY_FIELDS = [
  "$schema", "schemaId", "schemaVersion", "contractId", "registryKind", "bootstrappedFromGuideVersion",
  "lastAuditedAgainstGuideVersion", "templateRelease", "templateDigest", "templateCommit", "provenance",
] as const;
const ALLOWED_TECHNOLOGY_REGISTRY_OVERLAY_FIELDS = new Set([...BASE_REGISTRY_FIELDS, "technologies"]);
const ALLOWED_COMPONENT_REGISTRY_OVERLAY_FIELDS = new Set([...BASE_REGISTRY_FIELDS, "components"]);
const ALLOWED_REGISTRY_ENTRY_FIELDS = new Set([
  "id", "state", "category", "contexts", "rationale", "revisitTrigger", "versionPolicy", "selectedVersion",
]);
const ALLOWED_GRANDFATHERED_DIVERGENCE_FIELDS = new Set([
  "component", "current", "guideDefault", "guideSection", "rationale", "revisitTrigger",
]);

const isPlatformRole = (v: string): v is ProductPlatformRole => (PRODUCT_PLATFORM_ROLES as readonly string[]).includes(v);
const isRegistryLifecycleState = (v: string): v is RegistryLifecycleState => (REGISTRY_LIFECYCLE_STATES as readonly string[]).includes(v);

function checkUnknownProperties(obj: Record<string, unknown>, allowed: Set<string>, pointer: string, diagnostics: Diagnostics): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) diagnostics.add("E_UNKNOWN_PROPERTY", pointer === "" ? `/${key}` : `${pointer}/${key}`, "unknown property");
  }
}

function checkTopLevelIdentities(obj: Record<string, unknown>, expSchemaId: string, expVersion: string, expContractId: string, diagnostics: Diagnostics): void {
  const checks = [["schemaId", expSchemaId], ["schemaVersion", expVersion], ["contractId", expContractId]] as const;
  for (const [key, expected] of checks) {
    const val = obj[key];
    if (val !== undefined) {
      if (typeof val !== "string") diagnostics.add("E_TYPE", `/${key}`, `${key} must be a string`);
      else if (val !== expected) diagnostics.add("E_INVALID_IDENTITY", `/${key}`, `${key} must be '${expected}'`);
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

function checkProvenanceFields(source: Record<string, unknown>, prefix: string, diagnostics: Diagnostics): boolean {
  let found = false;
  for (const f of ["bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion", "templateRelease"] as const) {
    if (checkProvenanceField(source[f], `${prefix}/${f}`, diagnostics)) found = true;
  }
  if (checkHexProvenanceField(source["templateDigest"], `${prefix}/templateDigest`, "templateDigest", 64, diagnostics)) found = true;
  if (checkHexProvenanceField(source["templateCommit"], `${prefix}/templateCommit`, "templateCommit", 40, diagnostics)) found = true;
  return found;
}

function checkProvenanceBlock(provenance: unknown, diagnostics: Diagnostics): boolean {
  if (provenance === undefined) return false;
  if (!isRecord(provenance)) {
    diagnostics.add("E_TYPE", "/provenance", "provenance must be an object");
    return false;
  }
  checkUnknownProperties(provenance, ALLOWED_PROVENANCE_FIELDS, "/provenance", diagnostics);
  if (provenance["contractId"] !== undefined) {
    if (typeof provenance["contractId"] !== "string") diagnostics.add("E_TYPE", "/provenance/contractId", "contractId must be a string");
    else if (provenance["contractId"] !== PRODUCT_OVERLAY_CONTRACT_ID) {
      diagnostics.add("E_INVALID_IDENTITY", "/provenance/contractId", `contractId must be '${PRODUCT_OVERLAY_CONTRACT_ID}'`);
    }
  }
  return checkProvenanceFields(provenance, "/provenance", diagnostics);
}

function checkProvenanceEnvelope(obj: Record<string, unknown>, overlayKindName: string, diagnostics: Diagnostics): boolean {
  const hasDirect = checkProvenanceFields(obj, "", diagnostics);
  const hasBlock = checkProvenanceBlock(obj["provenance"], diagnostics);
  if (!hasDirect && !hasBlock) {
    diagnostics.add("E_REQUIRED_PROVENANCE", "", `${overlayKindName} overlay requires immutable release provenance (version, commit, or digest)`);
    return false;
  }
  return true;
}


function checkStringArray(val: unknown, pointer: string, itemName: string, diagnostics: Diagnostics): void {
  if (val === undefined) return;
  if (!Array.isArray(val)) {
    diagnostics.add("E_TYPE", pointer, `${itemName} must be an array`);
    return;
  }
  for (const [idx, item] of val.entries()) {
    if (typeof item !== "string") diagnostics.add("E_TYPE", `${pointer}/${String(idx)}`, `${itemName} item must be a string`);
  }
}

function checkPlatformRole(role: unknown, def: Record<string, unknown>, pointer: string, diagnostics: Diagnostics): void {
  if (role === undefined) {
    diagnostics.add("E_REQUIRED_ROLE", `${pointer}/role`, "role is required");
    return;
  }
  if (typeof role !== "string" || !isPlatformRole(role)) {
    diagnostics.add("E_INVALID_ROLE", `${pointer}/role`, `invalid platform role: ${typeof role === "string" ? role : JSON.stringify(role)}; must be one of: ${PRODUCT_PLATFORM_ROLES.join(", ")}`);
    return;
  }
  if (role === "dormant" && (typeof def["revisitTrigger"] !== "string" || def["revisitTrigger"].trim() === "")) {
    diagnostics.add("E_MISSING_DORMANT_REVISIT_TRIGGER", `${pointer}/revisitTrigger`, "dormant platform requires a non-empty revisitTrigger");
  }
  if (role === "not-targeted" && (typeof def["rationale"] !== "string" || def["rationale"].trim() === "")) {
    diagnostics.add("E_MISSING_NOT_TARGETED_RATIONALE", `${pointer}/rationale`, "not-targeted platform requires a non-empty rationale");
  }
}

function checkPlatformMetadata(def: Record<string, unknown>, pointer: string, diagnostics: Diagnostics): void {
  const priority = def["priority"];
  if (priority !== undefined && (typeof priority !== "number" || priority < 1 || !Number.isInteger(priority))) {
    diagnostics.add("E_INVALID_PRIORITY", `${pointer}/priority`, "priority must be an integer >= 1");
  }
  for (const field of ["rationale", "revisitTrigger", "owner"] as const) {
    if (def[field] !== undefined) {
      if (typeof def[field] !== "string") diagnostics.add("E_TYPE", `${pointer}/${field}`, `${field} must be a string`);
      else if ((field === "rationale" || field === "revisitTrigger") && def[field].trim() === "") {
        diagnostics.add("E_EMPTY_VALUE", `${pointer}/${field}`, `${field} must not be empty or whitespace-only`);
      }
    }
  }
  checkStringArray(def["acceptanceSuites"], `${pointer}/acceptanceSuites`, "acceptanceSuite", diagnostics);
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
  for (const name of keys) {
    const pointer = `/platforms/${name}`;
    const def = platforms[name];
    if (!isRecord(def)) {
      diagnostics.add("E_TYPE", pointer, "platform definition must be an object");
      continue;
    }
    checkUnknownProperties(def, ALLOWED_PLATFORM_FIELDS, pointer, diagnostics);
    checkPlatformRole(def["role"], def, pointer, diagnostics);
    checkPlatformMetadata(def, pointer, diagnostics);
  }
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
  if (!isRecord(rawDef) || typeof rawDef["role"] !== "string" || !isPlatformRole(rawDef["role"])) return undefined;
  let suites: readonly string[] | undefined;
  if (Array.isArray(rawDef["acceptanceSuites"])) {
    if (!rawDef["acceptanceSuites"].every((s): s is string => typeof s === "string")) return undefined;
    suites = Object.freeze([...rawDef["acceptanceSuites"]]);
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

function buildBaseRegistryOverlay(obj: Record<string, unknown>) {
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

function buildProductOverlay(obj: Record<string, unknown>): ProductOverlay {
  const divergences = buildGrandfatheredDivergences(obj["grandfatheredDivergences"]);
  return Object.freeze({
    ...buildBaseRegistryOverlay(obj),
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

function checkSingleDivergence(item: Record<string, unknown>, ptr: string, diagnostics: Diagnostics): void {
  checkUnknownProperties(item, ALLOWED_GRANDFATHERED_DIVERGENCE_FIELDS, ptr, diagnostics);
  for (const req of ["component", "current", "guideDefault", "rationale"] as const) {
    const val = item[req];
    if (val === undefined) diagnostics.add("E_REQUIRED", `${ptr}/${req}`, `${req} is required`);
    else if (typeof val !== "string") diagnostics.add("E_TYPE", `${ptr}/${req}`, `${req} must be a string`);
    else if (val.trim() === "") diagnostics.add("E_EMPTY_VALUE", `${ptr}/${req}`, `${req} must not be empty or whitespace-only`);
  }
  for (const opt of ["guideSection", "revisitTrigger"] as const) {
    const val = item[opt];
    if (val !== undefined) {
      if (typeof val !== "string") diagnostics.add("E_TYPE", `${ptr}/${opt}`, `${opt} must be a string`);
      else if (val.trim() === "") diagnostics.add("E_EMPTY_VALUE", `${ptr}/${opt}`, `${opt} must not be empty or whitespace-only`);
    }
  }
}

function checkGrandfatheredDivergences(divergences: unknown, diagnostics: Diagnostics): void {
  if (divergences === undefined) return;
  if (!Array.isArray(divergences)) {
    diagnostics.add("E_TYPE", "/grandfatheredDivergences", "grandfatheredDivergences must be an array");
    return;
  }
  for (const [idx, item] of divergences.entries()) {
    const ptr = `/grandfatheredDivergences/${String(idx)}`;
    if (!isRecord(item)) {
      diagnostics.add("E_TYPE", ptr, "divergence item must be an object");
      continue;
    }
    checkSingleDivergence(item, ptr, diagnostics);
  }
}

export function validateProductOverlay(value: unknown): ValidationResult<ProductOverlay> {
  const diagnostics = new Diagnostics();
  const obj = parseOverlayInput(value, diagnostics);
  if (obj === undefined) return finish<ProductOverlay>(undefined, diagnostics);

  checkUnknownProperties(obj, ALLOWED_PRODUCT_OVERLAY_FIELDS, "", diagnostics);
  checkTopLevelIdentities(obj, PRODUCT_OVERLAY_SCHEMA_ID, PRODUCT_OVERLAY_SCHEMA_VERSION, PRODUCT_OVERLAY_CONTRACT_ID, diagnostics);
  checkProvenanceEnvelope(obj, "product", diagnostics);
  checkPlatformsBlock(obj["platforms"], diagnostics);
  checkGrandfatheredDivergences(obj["grandfatheredDivergences"], diagnostics);

  return finish<ProductOverlay>(diagnostics.rows.length === 0 ? buildProductOverlay(obj) : undefined, diagnostics);
}

function checkRegistryEntry(entriesKey: string, id: string, def: unknown, diagnostics: Diagnostics): void {
  const pointer = `/${entriesKey}/${id}`;
  if (!isRecord(def)) {
    diagnostics.add("E_TYPE", pointer, "entry must be an object");
    return;
  }
  checkUnknownProperties(def, ALLOWED_REGISTRY_ENTRY_FIELDS, pointer, diagnostics);
  const state = def["state"];
  if (state === undefined) diagnostics.add("E_REQUIRED", `${pointer}/state`, "state is required");
  else if (typeof state !== "string" || !isRegistryLifecycleState(state)) {
    diagnostics.add("E_INVALID_LIFECYCLE_STATE", `${pointer}/state`, `invalid lifecycle state: ${typeof state === "string" ? state : JSON.stringify(state)}; must be one of: ${REGISTRY_LIFECYCLE_STATES.join(", ")}`);
  }

  for (const f of ["id", "category", "rationale", "revisitTrigger", "versionPolicy", "selectedVersion"] as const) {
    if (def[f] !== undefined) {
      if (typeof def[f] !== "string") diagnostics.add("E_TYPE", `${pointer}/${f}`, `${f} must be a string`);
      else if ((f === "rationale" || f === "revisitTrigger") && def[f].trim() === "") {
        diagnostics.add("E_EMPTY_VALUE", `${pointer}/${f}`, `${f} must not be empty or whitespace-only`);
      }
    }
  }
  checkStringArray(def["contexts"], `${pointer}/contexts`, "contexts", diagnostics);
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
  if (!isRecord(rawDef) || typeof rawDef["state"] !== "string" || !isRegistryLifecycleState(rawDef["state"])) return undefined;
  let contexts: readonly string[] | undefined;
  if (Array.isArray(rawDef["contexts"])) {
    if (!rawDef["contexts"].every((item): item is string => typeof item === "string")) return undefined;
    contexts = Object.freeze([...rawDef["contexts"]]);
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

interface RegistryOverlayDescriptor {
  readonly kind: "technology" | "component";
  readonly entriesKey: "technologies" | "components";
  readonly allowedFields: Set<string>;
  readonly schemaId: string;
}

const TECHNOLOGY_OVERLAY_DESCRIPTOR: RegistryOverlayDescriptor = {
  kind: "technology",
  entriesKey: "technologies",
  allowedFields: ALLOWED_TECHNOLOGY_REGISTRY_OVERLAY_FIELDS,
  schemaId: TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID,
};

const COMPONENT_OVERLAY_DESCRIPTOR: RegistryOverlayDescriptor = {
  kind: "component",
  entriesKey: "components",
  allowedFields: ALLOWED_COMPONENT_REGISTRY_OVERLAY_FIELDS,
  schemaId: COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID,
};

function checkRegistryOverlayEnvelope(
  obj: Record<string, unknown>,
  descriptor: RegistryOverlayDescriptor,
  diagnostics: Diagnostics,
): void {
  checkUnknownProperties(obj, descriptor.allowedFields, "", diagnostics);
  checkTopLevelIdentities(obj, descriptor.schemaId, PRODUCT_OVERLAY_SCHEMA_VERSION, PRODUCT_OVERLAY_CONTRACT_ID, diagnostics);
  const kind = obj["registryKind"];
  if (kind !== descriptor.kind && kind !== `${descriptor.kind}-overlay`) {
    diagnostics.add("E_INVALID_KIND", "/registryKind", `registryKind must be '${descriptor.kind}' or '${descriptor.kind}-overlay'`);
  }
  checkProvenanceEnvelope(obj, `${descriptor.kind} registry`, diagnostics);
  checkRegistryEntries(obj[descriptor.entriesKey], descriptor.entriesKey, diagnostics);
}

export function validateTechnologyRegistryOverlay(value: unknown): ValidationResult<TechnologyRegistryOverlay> {
  const diagnostics = new Diagnostics();
  const obj = parseOverlayInput(value, diagnostics);
  if (obj === undefined) return finish<TechnologyRegistryOverlay>(undefined, diagnostics);

  checkRegistryOverlayEnvelope(obj, TECHNOLOGY_OVERLAY_DESCRIPTOR, diagnostics);
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

  checkRegistryOverlayEnvelope(obj, COMPONENT_OVERLAY_DESCRIPTOR, diagnostics);
  const built: ComponentRegistryOverlay = Object.freeze({
    ...buildBaseRegistryOverlay(obj),
    registryKind: "component",
    components: Object.freeze(buildRegistryEntries(obj["components"])),
  });
  return finish<ComponentRegistryOverlay>(diagnostics.rows.length === 0 ? built : undefined, diagnostics);
}

