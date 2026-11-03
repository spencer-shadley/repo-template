/**
 * Fleet PR-validation overlay fields for LocalCiContractV3.
 *
 * Fleet `local-ci.json` files declare PR-validation metadata (merge profile,
 * broader-gate fallback, receipt identity bindings, full-required legs, and
 * focused `simpleDiff` path classes) beside the core V3 contract. These are
 * optional, but when present each is strictly typed; unknown properties are
 * still rejected.
 */
import { Diagnostics, escapePointer, isRecord } from "./validation-helpers.js";
export const SHELLS = new Set(["pwsh", "cmd", "bash", "sh", "none"]);
export const FAILURE_DISPOSITIONS = new Set(["fail-gate", "warning", "non-routable"]);
export const LEG_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const COMMAND_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export function stringArray(value, pointer, min, max, diagnostics) {
    if (!diagnostics.array(value, pointer, min, max))
        return;
    const seen = new Set();
    for (const [index, item] of value.entries()) {
        if (!diagnostics.string(item, `${pointer}/${String(index)}`, { min: 1 }))
            continue;
        if (seen.has(item))
            diagnostics.add("E_DUPLICATE", `${pointer}/${String(index)}`, `duplicate value: ${item}`);
        else
            seen.add(item);
    }
}
const PR_MERGE_PROFILE_ID_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const RESERVED_SIMPLE_DIFF_CLASSES = new Set(["full", "skipped"]);
const PR_RECEIPT_FLAGS = [
    ["bindsCandidate", "prReceiptBindsCandidate"],
    ["bindsBase", "prReceiptBindsBase"],
    ["bindsIntegration", "prReceiptBindsIntegration"],
];
function optionalBoolean(value, pointer, diagnostics) {
    if (value !== undefined && typeof value !== "boolean")
        diagnostics.add("E_TYPE", pointer, "expected boolean");
}
function validatePrReceiptV3(record, diagnostics) {
    for (const [, flat] of PR_RECEIPT_FLAGS)
        optionalBoolean(record[flat], `/${flat}`, diagnostics);
    const receipt = record["prReceipt"];
    if (receipt === undefined)
        return;
    const fields = PR_RECEIPT_FLAGS.map(([nested]) => nested);
    if (!diagnostics.object(receipt, "/prReceipt", fields, fields))
        return;
    for (const [nested, flat] of PR_RECEIPT_FLAGS) {
        const nestedValue = receipt[nested];
        if (Object.hasOwn(receipt, nested) && typeof nestedValue !== "boolean") {
            diagnostics.add("E_TYPE", `/prReceipt/${nested}`, "expected boolean");
            continue;
        }
        const flatValue = record[flat];
        if (typeof flatValue === "boolean" && typeof nestedValue === "boolean" && flatValue !== nestedValue) {
            diagnostics.add("E_PR_RECEIPT_CONFLICT", `/prReceipt/${nested}`, `prReceipt.${nested} disagrees with ${flat}`);
        }
    }
}
function validateFullRequiredLegIdsV3(value, diagnostics) {
    if (value === undefined)
        return;
    if (!diagnostics.array(value, "/fullRequiredLegIds", 1, 64))
        return;
    const seen = new Set();
    for (const [index, item] of value.entries()) {
        const ptr = `/fullRequiredLegIds/${String(index)}`;
        if (!diagnostics.string(item, ptr, { min: 1, pattern: LEG_ID_PATTERN }))
            continue;
        if (seen.has(item))
            diagnostics.add("E_DUPLICATE", ptr, `duplicate leg id: ${item}`);
        else
            seen.add(item);
    }
}
function validateSimpleDiffCommandV3(cmd, ptr, diagnostics) {
    const allowed = ["name", "executable", "args", "shell", "cwd", "timeoutSeconds", "expectedExitCode", "failureDisposition"];
    if (!diagnostics.object(cmd, ptr, allowed, ["executable", "args"]))
        return;
    if (cmd["name"] !== undefined)
        diagnostics.string(cmd["name"], `${ptr}/name`, { min: 1 });
    diagnostics.string(cmd["executable"], `${ptr}/executable`, { min: 1 });
    const args = cmd["args"];
    if (diagnostics.array(args, `${ptr}/args`, 0, 256)) {
        for (const [index, arg] of args.entries()) {
            diagnostics.string(arg, `${ptr}/args/${String(index)}`, { min: 1 });
        }
    }
    validateSimpleDiffCommandOptionsV3(cmd, ptr, diagnostics);
}
function validateSimpleDiffCommandOptionsV3(cmd, ptr, diagnostics) {
    const shell = cmd["shell"];
    if (shell !== undefined && diagnostics.string(shell, `${ptr}/shell`) && !SHELLS.has(shell)) {
        diagnostics.add("E_ENUM", `${ptr}/shell`, "unsupported shell");
    }
    if (cmd["cwd"] !== undefined)
        diagnostics.string(cmd["cwd"], `${ptr}/cwd`, { min: 1 });
    const timeout = cmd["timeoutSeconds"];
    if (timeout !== undefined && (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1)) {
        diagnostics.add("E_TYPE", `${ptr}/timeoutSeconds`, "expected positive integer");
    }
    const exit = cmd["expectedExitCode"];
    if (exit !== undefined && (typeof exit !== "number" || !Number.isInteger(exit))) {
        diagnostics.add("E_TYPE", `${ptr}/expectedExitCode`, "expected integer");
    }
    const disp = cmd["failureDisposition"];
    if (disp !== undefined && diagnostics.string(disp, `${ptr}/failureDisposition`) && !FAILURE_DISPOSITIONS.has(disp)) {
        diagnostics.add("E_ENUM", `${ptr}/failureDisposition`, "unsupported failure disposition");
    }
}
function validateSimpleDiffClassV3(name, cls, diagnostics) {
    const ptr = `/simpleDiff/${escapePointer(name)}`;
    if (name.trim() === "" || name !== name.trim())
        diagnostics.add("E_FORMAT", ptr, "invalid simpleDiff class name");
    if (RESERVED_SIMPLE_DIFF_CLASSES.has(name))
        diagnostics.add("E_RESERVED", ptr, `simpleDiff class name '${name}' is reserved`);
    if (!diagnostics.object(cls, ptr, ["paths", "commands", "requiresDependencies"], ["paths", "commands"]))
        return;
    stringArray(cls["paths"], `${ptr}/paths`, 1, 256, diagnostics);
    optionalBoolean(cls["requiresDependencies"], `${ptr}/requiresDependencies`, diagnostics);
    const commands = cls["commands"];
    if (!isRecord(commands)) {
        diagnostics.add("E_TYPE", `${ptr}/commands`, "expected object");
        return;
    }
    const ids = Object.keys(commands).toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    if (ids.length === 0)
        diagnostics.add("E_LENGTH", `${ptr}/commands`, "expected at least one command");
    for (const id of ids) {
        const cmdPtr = `${ptr}/commands/${escapePointer(id)}`;
        if (!COMMAND_ID_PATTERN.test(id))
            diagnostics.add("E_FORMAT", cmdPtr, "invalid command id");
        validateSimpleDiffCommandV3(commands[id], cmdPtr, diagnostics);
    }
}
function validateSimpleDiffV3(value, diagnostics) {
    if (value === undefined)
        return;
    if (!isRecord(value)) {
        diagnostics.add("E_TYPE", "/simpleDiff", "expected object");
        return;
    }
    const names = Object.keys(value).toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    if (names.length === 0)
        diagnostics.add("E_LENGTH", "/simpleDiff", "expected at least one class");
    for (const name of names)
        validateSimpleDiffClassV3(name, value[name], diagnostics);
}
/**
 * Validates the fleet PR-validation overlay fields that sit beside the core
 * V3 contract. Each field is optional but, when present, strictly typed.
 */
export function validateFleetOverlayV3(record, diagnostics) {
    if (record["prMergeProfileId"] !== undefined) {
        diagnostics.string(record["prMergeProfileId"], "/prMergeProfileId", { min: 1, max: 128, pattern: PR_MERGE_PROFILE_ID_PATTERN });
    }
    optionalBoolean(record["prBroaderFallback"], "/prBroaderFallback", diagnostics);
    validatePrReceiptV3(record, diagnostics);
    validateFullRequiredLegIdsV3(record["fullRequiredLegIds"], diagnostics);
    validateSimpleDiffV3(record["simpleDiff"], diagnostics);
}
export const LOCAL_CI_CONTRACT_V3_FLEET_OVERLAY_FIELDS = [
    "prMergeProfileId",
    "prBroaderFallback",
    "prReceiptBindsCandidate",
    "prReceiptBindsBase",
    "prReceiptBindsIntegration",
    "prReceipt",
    "fullRequiredLegIds",
    "simpleDiff",
];
