import {} from "./contract.js";
import { canonicalizeJson } from "./canonical-json.js";
import { sha256Bytes } from "./digest.js";
import { classifyAndMigrateLegacyLocalCiV1, validateLocalCiContractV2, } from "./local-ci-contract-v2.js";
import { Diagnostics, escapePointer, isRecord } from "./validation-helpers.js";
export const LOCAL_CI_CONTRACT_V3_ID = "repo-template/local-ci-v3";
export const LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION = "3.0.0";
export const LOCAL_CI_CONTRACT_V3_SCHEMA_ID = "https://schemas.repo-template.dev/local-ci-v3/local-ci-contract-v3.schema.json";
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
function validateDetectionProof(value, pointer, diagnostics) {
    if (!isRecord(value)) {
        diagnostics.add("E_TYPE", pointer, "expected object");
        return;
    }
    const hasFixture = Object.hasOwn(value, "fixture");
    const hasExempt = Object.hasOwn(value, "exempt");
    for (const key of Object.keys(value)) {
        if (key !== "fixture" && key !== "exempt") {
            diagnostics.add("E_UNKNOWN_PROPERTY", `${pointer}/${escapePointer(key)}`, "unknown property");
        }
    }
    if (hasFixture && hasExempt) {
        diagnostics.add("E_DETECTION_PROOF_CONFLICT", pointer, "detectionProof must declare exactly one of fixture or exempt, never both");
        return;
    }
    if (!hasFixture && !hasExempt) {
        diagnostics.add("E_DETECTION_PROOF_MISSING", pointer, "detectionProof must declare a known-bad fixture or a recorded exemption");
        return;
    }
    if (hasFixture) {
        const fixtureFields = ["path", "description", "expectation"];
        if (diagnostics.object(value["fixture"], `${pointer}/fixture`, fixtureFields, fixtureFields)) {
            diagnostics.string(value["fixture"]["path"], `${pointer}/fixture/path`, { min: 1 });
            diagnostics.string(value["fixture"]["description"], `${pointer}/fixture/description`, { min: 1 });
            diagnostics.string(value["fixture"]["expectation"], `${pointer}/fixture/expectation`, {
                constant: "non-zero-exit",
            });
        }
        return;
    }
    diagnostics.string(value["exempt"], `${pointer}/exempt`, { min: 1 });
}
export function orderedLocalCiCommandsV3(contract) {
    const preflight = Object.entries(contract.commands)
        .filter(([id]) => id !== "authoritative-gate")
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([id, command], order) => ({
        ...command,
        id,
        order,
        isAuthoritativeGate: false,
    }));
    return [
        ...preflight,
        {
            ...contract.commands["authoritative-gate"],
            id: "authoritative-gate",
            order: preflight.length,
            isAuthoritativeGate: true,
        },
    ];
}
function validateSingleCommandV3(cmd, id, diagnostics) {
    const ptr = `/commands/${id}`;
    if (!COMMAND_ID_PATTERN.test(id)) {
        diagnostics.add("E_FORMAT", ptr, "invalid command id");
    }
    const closedFields = [
        "name", "executable", "args", "shell", "cwd",
        "timeoutSeconds", "expectedExitCode", "failureDisposition", "detectionProof",
    ];
    if (diagnostics.object(cmd, ptr, closedFields, closedFields)) {
        const cmdRec = cmd;
        diagnostics.string(cmdRec["name"], `${ptr}/name`, { min: 1 });
        diagnostics.string(cmdRec["executable"], `${ptr}/executable`, { min: 1 });
        stringArray(cmdRec["args"], `${ptr}/args`, 0, 256, diagnostics);
        const shellStr = cmdRec["shell"];
        if (diagnostics.string(shellStr, `${ptr}/shell`) && !SHELLS.has(shellStr)) {
            diagnostics.add("E_ENUM", `${ptr}/shell`, "unsupported shell");
        }
        diagnostics.string(cmdRec["cwd"], `${ptr}/cwd`, { min: 1 });
        const timeout = cmdRec["timeoutSeconds"];
        if (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1) {
            diagnostics.add("E_TYPE", `${ptr}/timeoutSeconds`, "expected positive integer");
        }
        if (typeof cmdRec["expectedExitCode"] !== "number" || !Number.isInteger(cmdRec["expectedExitCode"])) {
            diagnostics.add("E_TYPE", `${ptr}/expectedExitCode`, "expected integer");
        }
        const disp = cmdRec["failureDisposition"];
        if (diagnostics.string(disp, `${ptr}/failureDisposition`) && !FAILURE_DISPOSITIONS.has(disp)) {
            diagnostics.add("E_ENUM", `${ptr}/failureDisposition`, "unsupported failure disposition");
        }
        validateDetectionProof(cmdRec["detectionProof"], `${ptr}/detectionProof`, diagnostics);
    }
}
function validateCommandsV3(commandsRaw, diagnostics) {
    if (!isRecord(commandsRaw)) {
        diagnostics.add("E_TYPE", "/commands", "expected object");
        return;
    }
    const commandIds = Object.keys(commandsRaw).sort();
    if (commandIds.length === 0) {
        diagnostics.add("E_LENGTH", "/commands", "expected at least one command");
    }
    if (commandIds.length > 256) {
        diagnostics.add("E_LENGTH", "/commands", "expected at most 256 commands");
    }
    if (!Object.hasOwn(commandsRaw, "authoritative-gate")) {
        diagnostics.add("E_NO_AUTHORITATIVE_GATE", "/commands/authoritative-gate", "required authoritative gate is missing");
    }
    for (const id of commandIds) {
        validateSingleCommandV3(commandsRaw[id], id, diagnostics);
    }
}
function validateEnvironmentV3(envRaw, diagnostics) {
    const envFields = [
        "runtime", "packageManager", "supportedPlatforms", "supportedArchitectures",
        "requiredEnvVars", "requiredCredentials", "networkExpectation",
    ];
    if (!diagnostics.object(envRaw, "/environment", envFields, envFields))
        return;
    const envRec = envRaw;
    const rt = envRec["runtime"];
    if (diagnostics.object(rt, "/environment/runtime", ["name", "versionConstraint"], ["name", "versionConstraint"])) {
        const rtRec = rt;
        diagnostics.string(rtRec["name"], "/environment/runtime/name", { min: 1 });
        diagnostics.string(rtRec["versionConstraint"], "/environment/runtime/versionConstraint", { min: 1 });
    }
    const pm = envRec["packageManager"];
    if (diagnostics.object(pm, "/environment/packageManager", ["name", "version"], ["name", "version"])) {
        const pmRec = pm;
        diagnostics.string(pmRec["name"], "/environment/packageManager/name", { min: 1 });
        diagnostics.string(pmRec["version"], "/environment/packageManager/version", { min: 1 });
    }
    stringArray(envRec["supportedPlatforms"], "/environment/supportedPlatforms", 1, 32, diagnostics);
    stringArray(envRec["supportedArchitectures"], "/environment/supportedArchitectures", 1, 32, diagnostics);
    stringArray(envRec["requiredEnvVars"], "/environment/requiredEnvVars", 0, 256, diagnostics);
    stringArray(envRec["requiredCredentials"], "/environment/requiredCredentials", 0, 256, diagnostics);
    const netExp = envRec["networkExpectation"];
    if (diagnostics.string(netExp, "/environment/networkExpectation") && !NETWORK_EXPECTATIONS.has(netExp)) {
        diagnostics.add("E_ENUM", "/environment/networkExpectation", "unsupported network expectation");
    }
}
function validateEffectsV3(effRaw, diagnostics) {
    const effFields = [
        "credentialsAccess", "networkProviderAccess", "providerSpend",
        "externalMutation", "registrationMutation", "schedulesMutation",
        "deploymentMutation", "consumerBindingMutation", "servingAuthorityMutation",
    ];
    if (!diagnostics.object(effRaw, "/effects", effFields, effFields))
        return;
    const effRec = effRaw;
    for (const field of effFields) {
        if (typeof effRec[field] !== "boolean")
            diagnostics.add("E_TYPE", `/effects/${field}`, "expected boolean");
    }
}
export function validateLocalCiContractV3(value) {
    const diagnostics = new Diagnostics();
    const fields = ["schemaId", "schemaVersion", "contractId", "repository", "canonicalBranch", "commands", "environment", "effects"];
    if (!diagnostics.object(value, "", fields, fields))
        return finish(value, diagnostics);
    diagnostics.string(value["schemaId"], "/schemaId", { constant: LOCAL_CI_CONTRACT_V3_SCHEMA_ID });
    diagnostics.string(value["schemaVersion"], "/schemaVersion", { constant: LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION });
    diagnostics.string(value["contractId"], "/contractId", { constant: LOCAL_CI_CONTRACT_V3_ID });
    diagnostics.string(value["repository"], "/repository", { min: 1, pattern: /^[^/]+\/[^/]+$/ });
    diagnostics.string(value["canonicalBranch"], "/canonicalBranch", { min: 1 });
    validateCommandsV3(value["commands"], diagnostics);
    validateEnvironmentV3(value["environment"], diagnostics);
    validateEffectsV3(value["effects"], diagnostics);
    return finish(value, diagnostics);
}
export function classifyAndMigrateLocalCiV2ToV3(rawInput, sourceBlob) {
    const blobBytes = sourceBlob !== undefined ? (typeof sourceBlob === "string" ? Buffer.from(sourceBlob, "utf8") : sourceBlob) : Buffer.from(canonicalizeJson(rawInput), "utf8");
    const sourceBlobSha256 = sha256Bytes(blobBytes);
    const v3Result = validateLocalCiContractV3(rawInput);
    if (v3Result.ok)
        return { disposition: "valid-v3", legacyLineage: "none", sourceBlobSha256, contract: v3Result.value };
    const v2Result = validateLocalCiContractV2(rawInput);
    if (v2Result.ok) {
        const commandsMissingDetectionProof = Object.keys(v2Result.value.commands).sort();
        return {
            disposition: "rejected",
            legacyLineage: "local-ci-v2",
            sourceBlobSha256,
            reasonCode: "MISSING_DETECTION_PROOF",
            commandsMissingDetectionProof,
            diagnostics: v3Result.diagnostics,
        };
    }
    const v1Disposition = classifyAndMigrateLegacyLocalCiV1(rawInput, blobBytes);
    return {
        disposition: "rejected",
        legacyLineage: v1Disposition.legacyLineage,
        sourceBlobSha256,
        ...(v1Disposition.reasonCode !== undefined ? { reasonCode: v1Disposition.reasonCode } : {}),
        diagnostics: v1Disposition.diagnostics ?? v3Result.diagnostics,
    };
}
