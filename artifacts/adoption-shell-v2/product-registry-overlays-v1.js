import {} from "./contract.js";
import { decodeCanonicalBase64 } from "./digest.js";
import { Diagnostics, escapePointer, isRecord, SEMVER_PATTERN, SHA256_PATTERN, } from "./validation-helpers.js";
export const PRODUCT_OVERLAY_CONTRACT_ID = "repo-template/product-overlay-v1";
export const TECHNOLOGY_REGISTRY_OVERLAY_CONTRACT_ID = "repo-template/technology-registry-overlay-v1";
export const COMPONENT_REGISTRY_OVERLAY_CONTRACT_ID = "repo-template/component-registry-overlay-v1";
export const PRODUCT_OVERLAY_SCHEMA_ID = "https://schemas.repo-template.dev/overlays/v1/product-overlay.schema.json";
export const TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID = "https://schemas.repo-template.dev/overlays/v1/technology-registry.overlay.schema.json";
export const COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID = "https://schemas.repo-template.dev/overlays/v1/component-registry.overlay.schema.json";
export const OVERLAY_CAPABILITY_BUNDLE_ID = "repo-template/product-registry-overlays";
export const PRODUCT_OVERLAY_FILE_PATH = "product-overlay.yaml";
export const TECHNOLOGY_REGISTRY_OVERLAY_FILE_PATH = "technology-registry.overlay.yaml";
export const COMPONENT_REGISTRY_OVERLAY_FILE_PATH = "component-registry.overlay.yaml";
export const PRODUCT_OVERLAY_ROLES = new Set([
    "primary",
    "secondary",
    "accessory",
    "specialized",
    "dormant",
    "not-targeted",
]);
export const REGISTRY_LIFECYCLE_VALUES = new Set([
    "preferred-default",
    "context-preferred",
    "supported-alternative",
    "candidate",
    "legacy-compatibility",
    "discouraged",
    "prohibited",
]);
const REPOSITORY_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const MUTABLE_BRANCH_PATTERN = /(?:^|\/|@|refs\/heads\/)(?:master|main|HEAD)(?:$|\/|\?|#)/i;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
/**
 * Checks whether a string contains mutable branch references, branch URLs, or non-immutable authority references.
 */
export function isMutableBranchReference(value) {
    if (MUTABLE_BRANCH_PATTERN.test(value))
        return true;
    const trimmed = value.trim();
    if (trimmed === "master" || trimmed === "main" || trimmed === "HEAD")
        return true;
    if (trimmed.includes("agent-orchestrator/master") || trimmed.includes("agent-orchestrator/main")) {
        return true;
    }
    return false;
}
function finishResult(value, diagnostics) {
    const rows = diagnostics.sorted();
    if (rows.length === 0 && value !== undefined) {
        return Object.freeze({ ok: true, value: value });
    }
    return Object.freeze({ ok: false, diagnostics: rows });
}
export function validateBootstrapProvenance(value, pointer, diagnostics) {
    if (!diagnostics.object(value, pointer, ["templateRelease", "bootstrappedFromGuideVersion", "lastAuditedAgainstGuideVersion"], ["templateRelease"])) {
        return false;
    }
    const tr = value["templateRelease"];
    if (!diagnostics.object(tr, `${pointer}/templateRelease`, ["repository", "semver", "releaseDigest", "releaseId", "receiptDigest"], ["repository", "semver", "releaseDigest"])) {
        return false;
    }
    diagnostics.string(tr["repository"], `${pointer}/templateRelease/repository`, {
        min: 3,
        max: 120,
        pattern: REPOSITORY_PATTERN,
    });
    if (typeof tr["semver"] === "string") {
        if (isMutableBranchReference(tr["semver"])) {
            diagnostics.add("E_PROVENANCE_INCOMPATIBLE", `${pointer}/templateRelease/semver`, "mutable branch reference forbidden in release semver");
        }
        else if (!SEMVER_PATTERN.test(tr["semver"])) {
            diagnostics.add("E_FORMAT", `${pointer}/templateRelease/semver`, "string does not match the required SemVer format");
        }
    }
    else {
        diagnostics.string(tr["semver"], `${pointer}/templateRelease/semver`);
    }
    diagnostics.sha(tr["releaseDigest"], `${pointer}/templateRelease/releaseDigest`);
    if (tr["receiptDigest"] !== undefined) {
        diagnostics.sha(tr["receiptDigest"], `${pointer}/templateRelease/receiptDigest`);
    }
    if (tr["releaseId"] !== undefined) {
        if (typeof tr["releaseId"] === "string") {
            if (isMutableBranchReference(tr["releaseId"])) {
                diagnostics.add("E_PROVENANCE_INCOMPATIBLE", `${pointer}/templateRelease/releaseId`, "mutable branch reference forbidden in releaseId");
            }
        }
        else {
            diagnostics.string(tr["releaseId"], `${pointer}/templateRelease/releaseId`);
        }
    }
    for (const guideKey of [
        "bootstrappedFromGuideVersion",
        "lastAuditedAgainstGuideVersion",
    ]) {
        const guideVal = value[guideKey];
        if (guideVal !== undefined) {
            if (typeof guideVal !== "string" || guideVal.trim().length === 0) {
                diagnostics.string(guideVal, `${pointer}/${guideKey}`, { min: 1 });
            }
            else if (isMutableBranchReference(guideVal)) {
                diagnostics.add("E_PROVENANCE_INCOMPATIBLE", `${pointer}/${guideKey}`, `bootstrap provenance ${guideKey} cannot use mutable branch reference: "${guideVal}"`);
            }
        }
    }
    return diagnostics.rows.length === 0;
}
export function validateProductOverlay(value, pointer = "") {
    const diagnostics = new Diagnostics();
    if (!diagnostics.object(value, pointer, ["schemaVersion", "contractId", "profile", "provenance", "platforms"], ["schemaVersion", "contractId", "profile", "provenance", "platforms"])) {
        return finishResult(undefined, diagnostics);
    }
    const schemaVersion = value["schemaVersion"];
    if (schemaVersion !== "1.0.0" && schemaVersion !== "product-overlay/v1") {
        diagnostics.add("E_CONST", `${pointer}/schemaVersion`, 'schemaVersion must equal "product-overlay/v1" or "1.0.0"');
    }
    diagnostics.string(value["contractId"], `${pointer}/contractId`, {
        constant: PRODUCT_OVERLAY_CONTRACT_ID,
    });
    diagnostics.string(value["profile"], `${pointer}/profile`, { min: 1, max: 80 });
    validateBootstrapProvenance(value["provenance"], `${pointer}/provenance`, diagnostics);
    const platformsVal = value["platforms"];
    if (!isRecord(platformsVal)) {
        diagnostics.add("E_TYPE", `${pointer}/platforms`, "expected object for platforms");
        return finishResult(undefined, diagnostics);
    }
    const platformKeys = Object.keys(platformsVal);
    if (platformKeys.length === 0) {
        diagnostics.add("E_REQUIRED", `${pointer}/platforms`, "at least one platform record is required");
    }
    for (const platformId of platformKeys) {
        const pRecord = platformsVal[platformId];
        const pPtr = `${pointer}/platforms/${escapePointer(platformId)}`;
        if (!diagnostics.object(pRecord, pPtr, [
            "role",
            "priority",
            "owner",
            "acceptanceSuites",
            "rationale",
            "revisitTrigger",
            "grandfatheredDivergences",
            "bootstrappedFromGuideVersion",
            "lastAuditedAgainstGuideVersion",
        ], ["role", "priority", "owner", "acceptanceSuites"])) {
            continue;
        }
        const role = pRecord["role"];
        if (typeof role !== "string" || !PRODUCT_OVERLAY_ROLES.has(role)) {
            diagnostics.add("E_OVERLAY_ROLE", `${pPtr}/role`, `unknown or malformed platform role: "${String(role)}"`);
        }
        else {
            if (role === "dormant") {
                const revisitTrigger = pRecord["revisitTrigger"];
                if (typeof revisitTrigger !== "string" || revisitTrigger.trim().length === 0) {
                    diagnostics.add("E_DORMANT_REVISIT_TRIGGER", `${pPtr}/revisitTrigger`, `dormant platform "${platformId}" requires a non-empty revisitTrigger`);
                }
            }
            if (role === "not-targeted") {
                const rationale = pRecord["rationale"];
                if (typeof rationale !== "string" || rationale.trim().length === 0) {
                    diagnostics.add("E_NOT_TARGETED_RATIONALE", `${pPtr}/rationale`, `not-targeted platform "${platformId}" requires rationale`);
                }
            }
        }
        const priority = pRecord["priority"];
        if (typeof priority !== "number" ||
            !Number.isInteger(priority) ||
            priority < 1) {
            diagnostics.add("E_TYPE", `${pPtr}/priority`, "priority must be a positive integer");
        }
        diagnostics.string(pRecord["owner"], `${pPtr}/owner`, { min: 1 });
        const suites = pRecord["acceptanceSuites"];
        if (!Array.isArray(suites) || !suites.every((s) => typeof s === "string")) {
            diagnostics.add("E_TYPE", `${pPtr}/acceptanceSuites`, "acceptanceSuites must be an array of strings");
        }
        for (const guideKey of [
            "bootstrappedFromGuideVersion",
            "lastAuditedAgainstGuideVersion",
        ]) {
            const guideVal = pRecord[guideKey];
            if (guideVal !== undefined) {
                if (typeof guideVal !== "string" || guideVal.trim().length === 0) {
                    diagnostics.string(guideVal, `${pPtr}/${guideKey}`, { min: 1 });
                }
                else if (isMutableBranchReference(guideVal)) {
                    diagnostics.add("E_PROVENANCE_INCOMPATIBLE", `${pPtr}/${guideKey}`, `platform ${platformId} ${guideKey} cannot use mutable branch reference: "${guideVal}"`);
                }
            }
        }
    }
    return finishResult(value, diagnostics);
}
export function validateTechnologyRegistryOverlay(value, pointer = "") {
    const diagnostics = new Diagnostics();
    if (!diagnostics.object(value, pointer, ["schemaVersion", "contractId", "provenance", "technologies"], ["schemaVersion", "contractId", "provenance", "technologies"])) {
        return finishResult(undefined, diagnostics);
    }
    const schemaVersion = value["schemaVersion"];
    if (schemaVersion !== "1.0.0" &&
        schemaVersion !== "technology-registry-overlay/v1") {
        diagnostics.add("E_CONST", `${pointer}/schemaVersion`, 'schemaVersion must equal "technology-registry-overlay/v1" or "1.0.0"');
    }
    diagnostics.string(value["contractId"], `${pointer}/contractId`, {
        constant: TECHNOLOGY_REGISTRY_OVERLAY_CONTRACT_ID,
    });
    validateBootstrapProvenance(value["provenance"], `${pointer}/provenance`, diagnostics);
    const techsVal = value["technologies"];
    if (!Array.isArray(techsVal)) {
        diagnostics.add("E_TYPE", `${pointer}/technologies`, "expected array for technologies");
        return finishResult(undefined, diagnostics);
    }
    for (const [index, entry] of techsVal.entries()) {
        const ePtr = `${pointer}/technologies/${String(index)}`;
        if (!diagnostics.object(entry, ePtr, ["logicalId", "lifecycle", "priority", "rationale", "package", "selectedVersion", "evaluation"], ["logicalId", "lifecycle", "priority", "rationale"])) {
            continue;
        }
        diagnostics.string(entry["logicalId"], `${ePtr}/logicalId`, { min: 1 });
        const lifecycle = entry["lifecycle"];
        if (typeof lifecycle !== "string" ||
            !REGISTRY_LIFECYCLE_VALUES.has(lifecycle)) {
            diagnostics.add("E_REGISTRY_LIFECYCLE", `${ePtr}/lifecycle`, `unknown or malformed technology lifecycle value: "${String(lifecycle)}"`);
        }
        const priority = entry["priority"];
        if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 1) {
            diagnostics.add("E_TYPE", `${ePtr}/priority`, "priority must be a positive integer");
        }
        diagnostics.string(entry["rationale"], `${ePtr}/rationale`, { min: 1 });
        if (entry["package"] !== undefined) {
            diagnostics.string(entry["package"], `${ePtr}/package`, { min: 1 });
        }
        if (entry["selectedVersion"] !== undefined) {
            diagnostics.string(entry["selectedVersion"], `${ePtr}/selectedVersion`, { min: 1 });
        }
        const evaluation = entry["evaluation"];
        if (evaluation !== undefined) {
            if (diagnostics.object(evaluation, `${ePtr}/evaluation`, ["owner", "reviewTrigger", "targetEvidence", "exitCriteria"], ["owner", "reviewTrigger", "targetEvidence", "exitCriteria"])) {
                diagnostics.string(evaluation["owner"], `${ePtr}/evaluation/owner`, { min: 1 });
                diagnostics.string(evaluation["reviewTrigger"], `${ePtr}/evaluation/reviewTrigger`, { min: 1 });
                diagnostics.string(evaluation["targetEvidence"], `${ePtr}/evaluation/targetEvidence`, { min: 1 });
                diagnostics.string(evaluation["exitCriteria"], `${ePtr}/evaluation/exitCriteria`, { min: 1 });
            }
        }
    }
    return finishResult(value, diagnostics);
}
export function validateComponentRegistryOverlay(value, pointer = "") {
    const diagnostics = new Diagnostics();
    if (!diagnostics.object(value, pointer, ["schemaVersion", "contractId", "provenance", "components"], ["schemaVersion", "contractId", "provenance", "components"])) {
        return finishResult(undefined, diagnostics);
    }
    const schemaVersion = value["schemaVersion"];
    if (schemaVersion !== "1.0.0" &&
        schemaVersion !== "component-registry-overlay/v1") {
        diagnostics.add("E_CONST", `${pointer}/schemaVersion`, 'schemaVersion must equal "component-registry-overlay/v1" or "1.0.0"');
    }
    diagnostics.string(value["contractId"], `${pointer}/contractId`, {
        constant: COMPONENT_REGISTRY_OVERLAY_CONTRACT_ID,
    });
    validateBootstrapProvenance(value["provenance"], `${pointer}/provenance`, diagnostics);
    const compsVal = value["components"];
    if (!Array.isArray(compsVal)) {
        diagnostics.add("E_TYPE", `${pointer}/components`, "expected array for components");
        return finishResult(undefined, diagnostics);
    }
    for (const [index, entry] of compsVal.entries()) {
        const ePtr = `${pointer}/components/${String(index)}`;
        if (!diagnostics.object(entry, ePtr, ["logicalId", "lifecycle", "priority", "rationale", "package", "selectedVersion"], ["logicalId", "lifecycle", "priority", "rationale"])) {
            continue;
        }
        diagnostics.string(entry["logicalId"], `${ePtr}/logicalId`, { min: 1 });
        const lifecycle = entry["lifecycle"];
        if (typeof lifecycle !== "string" ||
            !REGISTRY_LIFECYCLE_VALUES.has(lifecycle)) {
            diagnostics.add("E_REGISTRY_LIFECYCLE", `${ePtr}/lifecycle`, `unknown or malformed component lifecycle value: "${String(lifecycle)}"`);
        }
        const priority = entry["priority"];
        if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 1) {
            diagnostics.add("E_TYPE", `${ePtr}/priority`, "priority must be a positive integer");
        }
        diagnostics.string(entry["rationale"], `${ePtr}/rationale`, { min: 1 });
        if (entry["package"] !== undefined) {
            diagnostics.string(entry["package"], `${ePtr}/package`, { min: 1 });
        }
        if (entry["selectedVersion"] !== undefined) {
            diagnostics.string(entry["selectedVersion"], `${ePtr}/selectedVersion`, { min: 1 });
        }
    }
    return finishResult(value, diagnostics);
}
// Minimal, safe, deterministic YAML parser for overlay documents.
export function parseOverlayYaml(yamlText) {
    const trimmed = yamlText.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return JSON.parse(trimmed);
    }
    const rawLines = yamlText.split(/\r?\n/);
    const lines = [];
    for (let i = 0; i < rawLines.length; i += 1) {
        const line = rawLines[i] ?? "";
        const withoutComment = line.replace(/(^|\s+)#.*$/, "").trimEnd();
        if (withoutComment.trim().length === 0)
            continue;
        const indent = withoutComment.search(/\S/);
        lines.push({ indent, text: withoutComment.trim(), lineNum: i + 1 });
    }
    if (lines.length === 0)
        return {};
    let index = 0;
    function parseScalar(val) {
        const t = val.trim();
        if (t === "true")
            return true;
        if (t === "false")
            return false;
        if (t === "null" || t === "~")
            return null;
        if (t === "[]")
            return [];
        if (t === "{}")
            return {};
        if (/^-?\d+$/.test(t))
            return Number.parseInt(t, 10);
        if (/^-?\d+\.\d+$/.test(t))
            return Number.parseFloat(t);
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
            return t.slice(1, -1);
        }
        return t;
    }
    function parseBlock(currentIndent) {
        if (index >= lines.length)
            return {};
        const firstLine = lines[index];
        if (!firstLine)
            return {};
        if (firstLine.text.startsWith("- ") || firstLine.text === "-") {
            const arr = [];
            while (index < lines.length && lines[index].indent === currentIndent) {
                const itemLine = lines[index];
                if (!itemLine.text.startsWith("- ") && itemLine.text !== "-")
                    break;
                const rest = itemLine.text.slice(1).trim();
                index += 1;
                if (rest === "") {
                    if (index < lines.length && lines[index].indent > currentIndent) {
                        arr.push(parseBlock(lines[index].indent));
                    }
                    else {
                        arr.push(null);
                    }
                }
                else if (rest.includes(":") && !rest.startsWith('"') && !rest.startsWith("'")) {
                    const colonIdx = rest.indexOf(":");
                    const k = rest.slice(0, colonIdx).trim();
                    const v = rest.slice(colonIdx + 1).trim();
                    const obj = {};
                    if (v === "") {
                        if (index < lines.length && lines[index].indent > currentIndent) {
                            obj[k] = parseBlock(lines[index].indent);
                        }
                        else {
                            obj[k] = null;
                        }
                    }
                    else {
                        obj[k] = parseScalar(v);
                    }
                    while (index < lines.length && lines[index].indent > currentIndent) {
                        const nextL = lines[index];
                        const cIdx = nextL.text.indexOf(":");
                        if (cIdx === -1)
                            break;
                        const subK = nextL.text.slice(0, cIdx).trim();
                        const subV = nextL.text.slice(cIdx + 1).trim();
                        index += 1;
                        if (subV === "") {
                            if (index < lines.length && lines[index].indent > nextL.indent) {
                                obj[subK] = parseBlock(lines[index].indent);
                            }
                            else {
                                obj[subK] = null;
                            }
                        }
                        else {
                            obj[subK] = parseScalar(subV);
                        }
                    }
                    arr.push(obj);
                }
                else {
                    arr.push(parseScalar(rest));
                }
            }
            return arr;
        }
        const obj = {};
        while (index < lines.length && lines[index].indent === currentIndent) {
            const line = lines[index];
            const colonIdx = line.text.indexOf(":");
            if (colonIdx === -1) {
                index += 1;
                continue;
            }
            const key = line.text.slice(0, colonIdx).trim();
            const valStr = line.text.slice(colonIdx + 1).trim();
            index += 1;
            if (valStr === "") {
                if (index < lines.length && lines[index].indent > currentIndent) {
                    obj[key] = parseBlock(lines[index].indent);
                }
                else {
                    obj[key] = null;
                }
            }
            else {
                obj[key] = parseScalar(valStr);
            }
        }
        return obj;
    }
    return parseBlock(lines[0]?.indent ?? 0);
}
export function formatOverlayYaml(data, indentLevel = 0) {
    const indent = "  ".repeat(indentLevel);
    if (data === null || data === undefined)
        return "null\n";
    if (typeof data === "boolean" || typeof data === "number")
        return `${String(data)}\n`;
    if (typeof data === "string") {
        if (data === "" || /[:#\s\-\[\]{}"',]/.test(data)) {
            return `"${data.replaceAll('"', '\\"')}"\n`;
        }
        return `${data}\n`;
    }
    if (Array.isArray(data)) {
        if (data.length === 0)
            return "[]\n";
        let res = "\n";
        for (const item of data) {
            if (isRecord(item)) {
                const keys = Object.keys(item);
                if (keys.length === 0) {
                    res += `${indent}- {}\n`;
                }
                else {
                    const firstKey = keys[0];
                    const firstVal = item[firstKey];
                    res += `${indent}- ${firstKey}: ${formatOverlayYaml(firstVal, indentLevel + 2).trimStart()}`;
                    for (let k = 1; k < keys.length; k += 1) {
                        const nextKey = keys[k];
                        res += `${indent}  ${nextKey}: ${formatOverlayYaml(item[nextKey], indentLevel + 2).trimStart()}`;
                    }
                }
            }
            else {
                res += `${indent}- ${formatOverlayYaml(item, indentLevel + 1).trimStart()}`;
            }
        }
        return res;
    }
    if (isRecord(data)) {
        const keys = Object.keys(data);
        if (keys.length === 0)
            return "{}\n";
        let res = indentLevel === 0 ? "" : "\n";
        for (const key of keys) {
            const val = data[key];
            if (isRecord(val) || (Array.isArray(val) && val.length > 0)) {
                res += `${indent}${key}:${formatOverlayYaml(val, indentLevel + 1)}`;
            }
            else {
                res += `${indent}${key}: ${formatOverlayYaml(val, indentLevel + 1).trimStart()}`;
            }
        }
        return res;
    }
    return `${String(data)}\n`;
}
export function validateOverlayPayloadEntries(entries) {
    const diagnostics = [];
    for (const entry of entries) {
        if (entry.path === PRODUCT_OVERLAY_FILE_PATH) {
            let rawText = "";
            try {
                rawText = UTF8_DECODER.decode(decodeCanonicalBase64(entry.contentBase64));
            }
            catch {
                diagnostics.push({
                    code: "E_OVERLAY_ENCODING",
                    pointer: `/entries/${entry.path}`,
                    message: "failed to decode product-overlay UTF-8 content",
                });
                continue;
            }
            let parsed;
            try {
                parsed = parseOverlayYaml(rawText);
            }
            catch (err) {
                diagnostics.push({
                    code: "E_OVERLAY_SYNTAX",
                    pointer: `/entries/${entry.path}`,
                    message: `failed to parse YAML in ${entry.path}: ${err instanceof Error ? err.message : String(err)}`,
                });
                continue;
            }
            const validation = validateProductOverlay(parsed, `/entries/${entry.path}`);
            if (!validation.ok) {
                diagnostics.push(...validation.diagnostics);
            }
        }
        else if (entry.path === TECHNOLOGY_REGISTRY_OVERLAY_FILE_PATH) {
            let rawText = "";
            try {
                rawText = UTF8_DECODER.decode(decodeCanonicalBase64(entry.contentBase64));
            }
            catch {
                diagnostics.push({
                    code: "E_OVERLAY_ENCODING",
                    pointer: `/entries/${entry.path}`,
                    message: "failed to decode technology-registry overlay UTF-8 content",
                });
                continue;
            }
            let parsed;
            try {
                parsed = parseOverlayYaml(rawText);
            }
            catch (err) {
                diagnostics.push({
                    code: "E_OVERLAY_SYNTAX",
                    pointer: `/entries/${entry.path}`,
                    message: `failed to parse YAML in ${entry.path}: ${err instanceof Error ? err.message : String(err)}`,
                });
                continue;
            }
            const validation = validateTechnologyRegistryOverlay(parsed, `/entries/${entry.path}`);
            if (!validation.ok) {
                diagnostics.push(...validation.diagnostics);
            }
        }
        else if (entry.path === COMPONENT_REGISTRY_OVERLAY_FILE_PATH) {
            let rawText = "";
            try {
                rawText = UTF8_DECODER.decode(decodeCanonicalBase64(entry.contentBase64));
            }
            catch {
                diagnostics.push({
                    code: "E_OVERLAY_ENCODING",
                    pointer: `/entries/${entry.path}`,
                    message: "failed to decode component-registry overlay UTF-8 content",
                });
                continue;
            }
            let parsed;
            try {
                parsed = parseOverlayYaml(rawText);
            }
            catch (err) {
                diagnostics.push({
                    code: "E_OVERLAY_SYNTAX",
                    pointer: `/entries/${entry.path}`,
                    message: `failed to parse YAML in ${entry.path}: ${err instanceof Error ? err.message : String(err)}`,
                });
                continue;
            }
            const validation = validateComponentRegistryOverlay(parsed, `/entries/${entry.path}`);
            if (!validation.ok) {
                diagnostics.push(...validation.diagnostics);
            }
        }
    }
    return diagnostics;
}
