import {} from "./contract.js";
import { canonicalizeJson } from "./canonical-json.js";
import { sha256Bytes } from "./digest.js";
import { Diagnostics, isRecord } from "./validation-helpers.js";
export const LOCAL_CI_CONTRACT_V2_ID = "repo-template/local-ci-v2";
export const LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION = "2.0.0";
export const LOCAL_CI_CONTRACT_V2_SCHEMA_ID = "https://schemas.repo-template.dev/local-ci-v2/local-ci-contract-v2.schema.json";
const SHELLS = new Set(["pwsh", "cmd", "bash", "sh", "none"]);
const FAILURE_DISPOSITIONS = new Set(["fail-gate", "warning", "non-routable"]);
const NETWORK_EXPECTATIONS = new Set(["offline-only", "local-loopback", "outbound-allowed"]);
const COMMAND_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
function stringArray(value, pointer, min, max, diagnostics) {
    if (!diagnostics.array(value, pointer, min, max))
        return;
    const seen = new Set();
    value.forEach((item, index) => {
        if (!diagnostics.string(item, `${pointer}/${index}`, { min: 1 }))
            return;
        if (seen.has(item))
            diagnostics.add("E_DUPLICATE", `${pointer}/${index}`, `duplicate value: ${item}`);
        else
            seen.add(item);
    });
}
function finish(value, diagnostics) {
    const sorted = diagnostics.sorted();
    return sorted.length === 0 ? { ok: true, value } : { ok: false, diagnostics: sorted };
}
export function validateLocalCiContractV2(value) {
    const diagnostics = new Diagnostics();
    const fields = ["schemaId", "schemaVersion", "contractId", "repository", "canonicalBranch", "commands", "environment", "effects"];
    if (!diagnostics.object(value, "", fields, fields))
        return finish(value, diagnostics);
    diagnostics.string(value["schemaId"], "/schemaId", { constant: LOCAL_CI_CONTRACT_V2_SCHEMA_ID });
    diagnostics.string(value["schemaVersion"], "/schemaVersion", { constant: LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION });
    diagnostics.string(value["contractId"], "/contractId", { constant: LOCAL_CI_CONTRACT_V2_ID });
    diagnostics.string(value["repository"], "/repository", { min: 1, pattern: /^[^/]+\/[^/]+$/ });
    diagnostics.string(value["canonicalBranch"], "/canonicalBranch", { min: 1 });
    const commandsRaw = value["commands"];
    if (diagnostics.array(commandsRaw, "/commands", 1, 256)) {
        const seenIds = new Set();
        const seenOrders = new Set();
        let hasAuthoritativeGate = false;
        commandsRaw.forEach((cmd, idx) => {
            const ptr = `/commands/${idx}`;
            const cmdFields = ["id", "name", "executable", "args", "shell", "cwd", "timeoutSeconds", "order", "expectedExitCode", "isAuthoritativeGate", "failureDisposition"];
            if (diagnostics.object(cmd, ptr, cmdFields, cmdFields)) {
                const idStr = cmd["id"];
                if (diagnostics.string(idStr, `${ptr}/id`, { min: 1, pattern: COMMAND_ID_PATTERN })) {
                    if (seenIds.has(idStr))
                        diagnostics.add("E_DUPLICATE_COMMAND_ID", `${ptr}/id`, `duplicate command id: ${idStr}`);
                    else
                        seenIds.add(idStr);
                }
                diagnostics.string(cmd["name"], `${ptr}/name`, { min: 1 });
                diagnostics.string(cmd["executable"], `${ptr}/executable`, { min: 1 });
                stringArray(cmd["args"], `${ptr}/args`, 0, 256, diagnostics);
                const shellStr = cmd["shell"];
                if (diagnostics.string(shellStr, `${ptr}/shell`) && !SHELLS.has(shellStr))
                    diagnostics.add("E_ENUM", `${ptr}/shell`, "unsupported shell");
                diagnostics.string(cmd["cwd"], `${ptr}/cwd`, { min: 1 });
                const timeout = cmd["timeoutSeconds"];
                if (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1)
                    diagnostics.add("E_TYPE", `${ptr}/timeoutSeconds`, "expected positive integer");
                const order = cmd["order"];
                if (typeof order !== "number" || !Number.isInteger(order) || order < 0)
                    diagnostics.add("E_TYPE", `${ptr}/order`, "expected non-negative integer");
                else if (seenOrders.has(order))
                    diagnostics.add("E_DUPLICATE_COMMAND_ORDER", `${ptr}/order`, `duplicate command order: ${order}`);
                else
                    seenOrders.add(order);
                if (typeof cmd["expectedExitCode"] !== "number" || !Number.isInteger(cmd["expectedExitCode"]))
                    diagnostics.add("E_TYPE", `${ptr}/expectedExitCode`, "expected integer");
                if (typeof cmd["isAuthoritativeGate"] !== "boolean")
                    diagnostics.add("E_TYPE", `${ptr}/isAuthoritativeGate`, "expected boolean");
                else if (cmd["isAuthoritativeGate"])
                    hasAuthoritativeGate = true;
                const disp = cmd["failureDisposition"];
                if (diagnostics.string(disp, `${ptr}/failureDisposition`) && !FAILURE_DISPOSITIONS.has(disp))
                    diagnostics.add("E_ENUM", `${ptr}/failureDisposition`, "unsupported failure disposition");
            }
        });
        if (!hasAuthoritativeGate)
            diagnostics.add("E_NO_AUTHORITATIVE_GATE", "/commands", "at least one command must be marked as isAuthoritativeGate");
    }
    const envRaw = value["environment"];
    const envFields = ["runtime", "packageManager", "supportedPlatforms", "supportedArchitectures", "requiredEnvVars", "requiredCredentials", "networkExpectation"];
    if (diagnostics.object(envRaw, "/environment", envFields, envFields)) {
        const rt = envRaw["runtime"];
        if (diagnostics.object(rt, "/environment/runtime", ["name", "versionConstraint"], ["name", "versionConstraint"])) {
            diagnostics.string(rt["name"], "/environment/runtime/name", { min: 1 });
            diagnostics.string(rt["versionConstraint"], "/environment/runtime/versionConstraint", { min: 1 });
        }
        const pm = envRaw["packageManager"];
        if (diagnostics.object(pm, "/environment/packageManager", ["name", "version"], ["name", "version"])) {
            diagnostics.string(pm["name"], "/environment/packageManager/name", { min: 1 });
            diagnostics.string(pm["version"], "/environment/packageManager/version", { min: 1 });
        }
        stringArray(envRaw["supportedPlatforms"], "/environment/supportedPlatforms", 1, 32, diagnostics);
        stringArray(envRaw["supportedArchitectures"], "/environment/supportedArchitectures", 1, 32, diagnostics);
        stringArray(envRaw["requiredEnvVars"], "/environment/requiredEnvVars", 0, 256, diagnostics);
        stringArray(envRaw["requiredCredentials"], "/environment/requiredCredentials", 0, 256, diagnostics);
        const netExp = envRaw["networkExpectation"];
        if (diagnostics.string(netExp, "/environment/networkExpectation") && !NETWORK_EXPECTATIONS.has(netExp))
            diagnostics.add("E_ENUM", "/environment/networkExpectation", "unsupported network expectation");
    }
    const effRaw = value["effects"];
    const effFields = ["credentialsAccess", "networkProviderAccess", "providerSpend", "externalMutation", "registrationMutation", "schedulesMutation", "deploymentMutation", "consumerBindingMutation", "servingAuthorityMutation"];
    if (diagnostics.object(effRaw, "/effects", effFields, effFields)) {
        for (const field of effFields) {
            if (typeof effRaw[field] !== "boolean")
                diagnostics.add("E_TYPE", `/effects/${field}`, "expected boolean");
        }
    }
    return finish(value, diagnostics);
}
export function classifyAndMigrateLegacyLocalCiV1(rawInput, sourceBlob) {
    const blobBytes = sourceBlob !== undefined ? (typeof sourceBlob === "string" ? Buffer.from(sourceBlob, "utf8") : sourceBlob) : Buffer.from(canonicalizeJson(rawInput), "utf8");
    const sourceBlobSha256 = sha256Bytes(blobBytes);
    const v2Result = validateLocalCiContractV2(rawInput);
    if (v2Result.ok)
        return { disposition: "valid-v2", legacyLineage: "none", sourceBlobSha256, contract: v2Result.value };
    if (!isRecord(rawInput))
        return { disposition: "rejected", legacyLineage: "unknown", sourceBlobSha256, reasonCode: "MALFORMED_INPUT", diagnostics: v2Result.diagnostics };
    if ("checks" in rawInput && "runtime" in rawInput) {
        return { disposition: "rejected", legacyLineage: "model-gateway-v1", sourceBlobSha256, reasonCode: "INCOMPLETE_LEGACY_EVIDENCE" };
    }
    if ("entrypoint" in rawInput && "gates" in rawInput) {
        return { disposition: "rejected", legacyLineage: "repo-factory-v1", sourceBlobSha256, reasonCode: "INCOMPLETE_LEGACY_EVIDENCE" };
    }
    return { disposition: "rejected", legacyLineage: "unknown", sourceBlobSha256, reasonCode: "NON_ROUTABLE_DECLARATION", diagnostics: v2Result.diagnostics };
}
