import { Diagnostics, isRecord } from "./validation-helpers.js";
import { PRODUCT_PLATFORM_ROLES, REGISTRY_LIFECYCLE_STATES, isImmutableProvenance, } from "./product-overlay-contract.js";
import { parseYamlOrJson } from "./product-overlay-yaml.js";
function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 && value !== undefined
        ? { ok: true, value }
        : { ok: false, diagnostics: rows };
}
const ALLOWED_PRODUCT_OVERLAY_FIELDS = new Set([
    "$schema", "schemaId", "schemaVersion", "contractId",
    "bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion",
    "templateRelease", "templateDigest", "templateCommit",
    "provenance", "platforms", "grandfatheredDivergences",
]);
const ALLOWED_PROVENANCE_FIELDS = new Set([
    "contractId", "templateRelease", "templateDigest", "templateCommit",
]);
const ALLOWED_PLATFORM_FIELDS = new Set([
    "role", "priority", "rationale", "revisitTrigger",
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
function isPlatformRole(value) {
    return PRODUCT_PLATFORM_ROLES.includes(value);
}
function isRegistryLifecycleState(value) {
    return REGISTRY_LIFECYCLE_STATES.includes(value);
}
function checkUnknownProperties(obj, allowed, pointer, diagnostics) {
    for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) {
            diagnostics.add("E_UNKNOWN_PROPERTY", `${pointer}/${key}`, "unknown property");
        }
    }
}
function checkProvenanceField(value, pointer, diagnostics) {
    if (value === undefined)
        return false;
    if (typeof value !== "string" || !isImmutableProvenance(value)) {
        diagnostics.add("E_MUTABLE_PROVENANCE", pointer, "provenance must be bound to immutable release evidence; mutable branch references and URLs are forbidden");
        return false;
    }
    return true;
}
function checkProvenanceBlock(provenance, diagnostics) {
    if (!isRecord(provenance)) {
        diagnostics.add("E_TYPE", "/provenance", "provenance must be an object");
        return false;
    }
    checkUnknownProperties(provenance, ALLOWED_PROVENANCE_FIELDS, "/provenance", diagnostics);
    let found = false;
    for (const field of ["templateRelease", "templateDigest", "templateCommit"]) {
        if (checkProvenanceField(provenance[field], `/provenance/${field}`, diagnostics)) {
            found = true;
        }
    }
    return found;
}
function checkPlatformEntry(name, def, diagnostics) {
    const pointer = `/platforms/${name}`;
    if (!isRecord(def)) {
        diagnostics.add("E_TYPE", pointer, "platform definition must be an object");
        return;
    }
    checkUnknownProperties(def, ALLOWED_PLATFORM_FIELDS, pointer, diagnostics);
    const role = def["role"];
    if (role === undefined) {
        diagnostics.add("E_REQUIRED_ROLE", `${pointer}/role`, "role is required");
        return;
    }
    if (typeof role !== "string" || !isPlatformRole(role)) {
        const roleStr = typeof role === "string" ? role : JSON.stringify(role);
        diagnostics.add("E_INVALID_ROLE", `${pointer}/role`, `invalid platform role: ${roleStr}; must be one of: ${PRODUCT_PLATFORM_ROLES.join(", ")}`);
        return;
    }
    if (role === "dormant") {
        const trigger = def["revisitTrigger"];
        if (typeof trigger !== "string" || trigger.trim() === "") {
            diagnostics.add("E_MISSING_DORMANT_REVISIT_TRIGGER", `${pointer}/revisitTrigger`, "dormant platform requires a non-empty revisitTrigger");
        }
    }
    if (role === "not-targeted") {
        const rationale = def["rationale"];
        if (typeof rationale !== "string" || rationale.trim() === "") {
            diagnostics.add("E_MISSING_NOT_TARGETED_RATIONALE", `${pointer}/rationale`, "not-targeted platform requires a non-empty rationale");
        }
    }
    const priority = def["priority"];
    if (priority !== undefined && (typeof priority !== "number" || priority < 0)) {
        diagnostics.add("E_INVALID_PRIORITY", `${pointer}/priority`, "priority must be a non-negative number");
    }
}
function checkPlatformsBlock(platforms, diagnostics) {
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
        checkPlatformEntry(name, platforms[name], diagnostics);
    }
}
function buildProvenance(prov) {
    return Object.freeze({
        templateRelease: typeof prov["templateRelease"] === "string" ? prov["templateRelease"] : "legacy",
        ...(typeof prov["contractId"] === "string" ? { contractId: prov["contractId"] } : {}),
        ...(typeof prov["templateDigest"] === "string" ? { templateDigest: prov["templateDigest"] } : {}),
        ...(typeof prov["templateCommit"] === "string" ? { templateCommit: prov["templateCommit"] } : {}),
        ...(typeof prov["bootstrappedFromGuideVersion"] === "string"
            ? { bootstrappedFromGuideVersion: prov["bootstrappedFromGuideVersion"] }
            : {}),
        ...(typeof prov["lastAuditedAgainstGuideVersion"] === "string"
            ? { lastAuditedAgainstGuideVersion: prov["lastAuditedAgainstGuideVersion"] }
            : {}),
    });
}
function buildPlatforms(rawPlatforms) {
    const platforms = {};
    if (!isRecord(rawPlatforms))
        return platforms;
    for (const [name, rawDef] of Object.entries(rawPlatforms)) {
        if (isRecord(rawDef) && typeof rawDef["role"] === "string" && isPlatformRole(rawDef["role"])) {
            platforms[name] = {
                role: rawDef["role"],
                ...(typeof rawDef["priority"] === "number" ? { priority: rawDef["priority"] } : {}),
                ...(typeof rawDef["rationale"] === "string" ? { rationale: rawDef["rationale"] } : {}),
                ...(typeof rawDef["revisitTrigger"] === "string" ? { revisitTrigger: rawDef["revisitTrigger"] } : {}),
            };
        }
    }
    return platforms;
}
function buildGrandfatheredDivergences(raw) {
    if (!Array.isArray(raw))
        return undefined;
    const result = [];
    for (const item of raw) {
        if (isRecord(item) &&
            typeof item["component"] === "string" &&
            typeof item["current"] === "string" &&
            typeof item["guideDefault"] === "string" &&
            typeof item["rationale"] === "string") {
            result.push({
                component: item["component"],
                current: item["current"],
                guideDefault: item["guideDefault"],
                rationale: item["rationale"],
                ...(typeof item["guideSection"] === "string" ? { guideSection: item["guideSection"] } : {}),
                ...(typeof item["revisitTrigger"] === "string" ? { revisitTrigger: item["revisitTrigger"] } : {}),
            });
        }
    }
    return Object.freeze(result);
}
function buildProductOverlay(obj) {
    const divergences = buildGrandfatheredDivergences(obj["grandfatheredDivergences"]);
    return Object.freeze({
        ...(typeof obj["$schema"] === "string" ? { $schema: obj["$schema"] } : {}),
        ...(typeof obj["schemaId"] === "string" ? { schemaId: obj["schemaId"] } : {}),
        ...(typeof obj["schemaVersion"] === "string" ? { schemaVersion: obj["schemaVersion"] } : {}),
        ...(typeof obj["contractId"] === "string" ? { contractId: obj["contractId"] } : {}),
        ...(typeof obj["bootstrappedFromGuideVersion"] === "string"
            ? { bootstrappedFromGuideVersion: obj["bootstrappedFromGuideVersion"] }
            : {}),
        ...(typeof obj["lastAuditedAgainstGuideVersion"] === "string"
            ? { lastAuditedAgainstGuideVersion: obj["lastAuditedAgainstGuideVersion"] }
            : {}),
        ...(typeof obj["templateRelease"] === "string" ? { templateRelease: obj["templateRelease"] } : {}),
        ...(typeof obj["templateDigest"] === "string" ? { templateDigest: obj["templateDigest"] } : {}),
        ...(typeof obj["templateCommit"] === "string" ? { templateCommit: obj["templateCommit"] } : {}),
        ...(isRecord(obj["provenance"]) ? { provenance: buildProvenance(obj["provenance"]) } : {}),
        platforms: Object.freeze(buildPlatforms(obj["platforms"])),
        ...(divergences !== undefined ? { grandfatheredDivergences: divergences } : {}),
    });
}
function parseOverlayInput(value, diagnostics) {
    let obj = value;
    if (typeof value === "string") {
        try {
            obj = parseYamlOrJson(value);
        }
        catch {
            diagnostics.add("E_INVALID_YAML", "", "failed to parse overlay YAML/JSON");
            return undefined;
        }
    }
    if (!isRecord(obj)) {
        diagnostics.add("E_TYPE", "", "expected object");
        return undefined;
    }
    return obj;
}
export function validateProductOverlay(value) {
    const diagnostics = new Diagnostics();
    const obj = parseOverlayInput(value, diagnostics);
    if (obj === undefined) {
        return finish(undefined, diagnostics);
    }
    checkUnknownProperties(obj, ALLOWED_PRODUCT_OVERLAY_FIELDS, "", diagnostics);
    let hasEvidence = false;
    for (const field of [
        "bootstrappedFromGuideVersion",
        "lastAuditedAgainstGuideVersion",
        "templateRelease",
        "templateDigest",
        "templateCommit",
    ]) {
        if (checkProvenanceField(obj[field], `/${field}`, diagnostics)) {
            hasEvidence = true;
        }
    }
    if (obj["provenance"] !== undefined && checkProvenanceBlock(obj["provenance"], diagnostics)) {
        hasEvidence = true;
    }
    if (!hasEvidence) {
        diagnostics.add("E_REQUIRED_PROVENANCE", "", "product overlay requires immutable release provenance (version, commit, or digest)");
    }
    checkPlatformsBlock(obj["platforms"], diagnostics);
    const grandfathered = obj["grandfatheredDivergences"];
    if (grandfathered !== undefined && !Array.isArray(grandfathered)) {
        diagnostics.add("E_TYPE", "/grandfatheredDivergences", "grandfatheredDivergences must be an array");
    }
    return finish(diagnostics.rows.length === 0 ? buildProductOverlay(obj) : undefined, diagnostics);
}
function checkRegistryEntry(entriesKey, id, def, diagnostics) {
    const pointer = `/${entriesKey}/${id}`;
    if (!isRecord(def)) {
        diagnostics.add("E_TYPE", pointer, "entry must be an object");
        return;
    }
    checkUnknownProperties(def, ALLOWED_REGISTRY_ENTRY_FIELDS, pointer, diagnostics);
    const state = def["state"];
    if (typeof state !== "string" || !isRegistryLifecycleState(state)) {
        const stateStr = typeof state === "string" ? state : JSON.stringify(state);
        diagnostics.add("E_INVALID_LIFECYCLE_STATE", `${pointer}/state`, `invalid lifecycle state: ${stateStr}; must be one of: ${REGISTRY_LIFECYCLE_STATES.join(", ")}`);
    }
}
function checkRegistryEntries(entriesVal, entriesKey, diagnostics) {
    if (entriesVal === undefined) {
        diagnostics.add("E_REQUIRED", `/${entriesKey}`, `${entriesKey} is required`);
        return;
    }
    if (!isRecord(entriesVal)) {
        diagnostics.add("E_TYPE", `/${entriesKey}`, `${entriesKey} must be an object`);
        return;
    }
    for (const [id, def] of Object.entries(entriesVal)) {
        checkRegistryEntry(entriesKey, id, def, diagnostics);
    }
}
function buildSingleRegistryEntry(rawDef) {
    if (!isRecord(rawDef) || typeof rawDef["state"] !== "string" || !isRegistryLifecycleState(rawDef["state"])) {
        return undefined;
    }
    return {
        state: rawDef["state"],
        ...(typeof rawDef["id"] === "string" ? { id: rawDef["id"] } : {}),
        ...(typeof rawDef["category"] === "string" ? { category: rawDef["category"] } : {}),
        ...(Array.isArray(rawDef["contexts"]) ? { contexts: Object.freeze(rawDef["contexts"].map(String)) } : {}),
        ...(typeof rawDef["rationale"] === "string" ? { rationale: rawDef["rationale"] } : {}),
        ...(typeof rawDef["revisitTrigger"] === "string" ? { revisitTrigger: rawDef["revisitTrigger"] } : {}),
        ...(typeof rawDef["versionPolicy"] === "string" ? { versionPolicy: rawDef["versionPolicy"] } : {}),
        ...(typeof rawDef["selectedVersion"] === "string" ? { selectedVersion: rawDef["selectedVersion"] } : {}),
    };
}
function buildRegistryEntries(rawEntries) {
    const result = {};
    if (!isRecord(rawEntries))
        return result;
    for (const [id, rawDef] of Object.entries(rawEntries)) {
        const entry = buildSingleRegistryEntry(rawDef);
        if (entry !== undefined) {
            result[id] = entry;
        }
    }
    return result;
}
function checkRegistryOverlayEnvelope(obj, expectedKind, entriesKey, diagnostics) {
    checkUnknownProperties(obj, ALLOWED_REGISTRY_OVERLAY_FIELDS, "", diagnostics);
    const kind = obj["registryKind"];
    if (kind !== expectedKind && kind !== `${expectedKind}-overlay`) {
        diagnostics.add("E_INVALID_KIND", "/registryKind", `registryKind must be '${expectedKind}' or '${expectedKind}-overlay'`);
    }
    for (const field of ["bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion", "templateRelease"]) {
        checkProvenanceField(obj[field], `/${field}`, diagnostics);
    }
    checkRegistryEntries(obj[entriesKey], entriesKey, diagnostics);
}
export function validateTechnologyRegistryOverlay(value) {
    const diagnostics = new Diagnostics();
    const obj = parseOverlayInput(value, diagnostics);
    if (obj === undefined) {
        return finish(undefined, diagnostics);
    }
    checkRegistryOverlayEnvelope(obj, "technology", "technologies", diagnostics);
    const built = Object.freeze({
        ...(typeof obj["$schema"] === "string" ? { $schema: obj["$schema"] } : {}),
        ...(typeof obj["schemaId"] === "string" ? { schemaId: obj["schemaId"] } : {}),
        ...(typeof obj["schemaVersion"] === "string" ? { schemaVersion: obj["schemaVersion"] } : {}),
        ...(typeof obj["contractId"] === "string" ? { contractId: obj["contractId"] } : {}),
        registryKind: "technology",
        ...(typeof obj["bootstrappedFromGuideVersion"] === "string"
            ? { bootstrappedFromGuideVersion: obj["bootstrappedFromGuideVersion"] }
            : {}),
        ...(typeof obj["lastAuditedAgainstGuideVersion"] === "string"
            ? { lastAuditedAgainstGuideVersion: obj["lastAuditedAgainstGuideVersion"] }
            : {}),
        ...(typeof obj["templateRelease"] === "string" ? { templateRelease: obj["templateRelease"] } : {}),
        ...(typeof obj["templateDigest"] === "string" ? { templateDigest: obj["templateDigest"] } : {}),
        ...(typeof obj["templateCommit"] === "string" ? { templateCommit: obj["templateCommit"] } : {}),
        ...(isRecord(obj["provenance"]) ? { provenance: buildProvenance(obj["provenance"]) } : {}),
        technologies: Object.freeze(buildRegistryEntries(obj["technologies"])),
    });
    return finish(diagnostics.rows.length === 0 ? built : undefined, diagnostics);
}
export function validateComponentRegistryOverlay(value) {
    const diagnostics = new Diagnostics();
    const obj = parseOverlayInput(value, diagnostics);
    if (obj === undefined) {
        return finish(undefined, diagnostics);
    }
    checkRegistryOverlayEnvelope(obj, "component", "components", diagnostics);
    const built = Object.freeze({
        ...(typeof obj["$schema"] === "string" ? { $schema: obj["$schema"] } : {}),
        ...(typeof obj["schemaId"] === "string" ? { schemaId: obj["schemaId"] } : {}),
        ...(typeof obj["schemaVersion"] === "string" ? { schemaVersion: obj["schemaVersion"] } : {}),
        ...(typeof obj["contractId"] === "string" ? { contractId: obj["contractId"] } : {}),
        registryKind: "component",
        ...(typeof obj["bootstrappedFromGuideVersion"] === "string"
            ? { bootstrappedFromGuideVersion: obj["bootstrappedFromGuideVersion"] }
            : {}),
        ...(typeof obj["lastAuditedAgainstGuideVersion"] === "string"
            ? { lastAuditedAgainstGuideVersion: obj["lastAuditedAgainstGuideVersion"] }
            : {}),
        ...(typeof obj["templateRelease"] === "string" ? { templateRelease: obj["templateRelease"] } : {}),
        ...(typeof obj["templateDigest"] === "string" ? { templateDigest: obj["templateDigest"] } : {}),
        ...(typeof obj["templateCommit"] === "string" ? { templateCommit: obj["templateCommit"] } : {}),
        ...(isRecord(obj["provenance"]) ? { provenance: buildProvenance(obj["provenance"]) } : {}),
        components: Object.freeze(buildRegistryEntries(obj["components"])),
    });
    return finish(diagnostics.rows.length === 0 ? built : undefined, diagnostics);
}
