import { type Diagnostic, type ValidationResult } from "./contract.ts";
import { canonicalizeJson } from "./canonical-json.ts";
import { sha256Bytes } from "./digest.ts";
import { Diagnostics, isRecord } from "./validation-helpers.ts";

export const LOCAL_CI_CONTRACT_V2_ID = "repo-template/local-ci-v2" as const;
export const LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION = "2.0.0" as const;
export const LOCAL_CI_CONTRACT_V2_SCHEMA_ID =
  "https://schemas.repo-template.dev/local-ci-v2/local-ci-contract-v2.schema.json" as const;

export type LocalCiShell = "pwsh" | "cmd" | "bash" | "sh" | "none";
export type LocalCiFailureDisposition = "fail-gate" | "warning" | "non-routable";
export type LocalCiNetworkExpectation = "offline-only" | "local-loopback" | "outbound-allowed";

export interface LocalCiCommandV2 {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly shell: LocalCiShell;
  readonly cwd: string;
  readonly timeoutSeconds: number;
  readonly expectedExitCode: number;
  readonly failureDisposition: LocalCiFailureDisposition;
}

export interface OrderedLocalCiCommandV2 extends LocalCiCommandV2 {
  readonly id: string;
  readonly order: number;
  readonly isAuthoritativeGate: boolean;
}

export interface LocalCiRuntimeConstraint {
  readonly name: string;
  readonly versionConstraint: string;
}

export interface LocalCiPackageManagerConstraint {
  readonly name: string;
  readonly version: string;
}

export interface LocalCiEnvironmentV2 {
  readonly runtime: LocalCiRuntimeConstraint;
  readonly packageManager: LocalCiPackageManagerConstraint;
  readonly supportedPlatforms: readonly string[];
  readonly supportedArchitectures: readonly string[];
  readonly requiredEnvVars: readonly string[];
  readonly requiredCredentials: readonly string[];
  readonly networkExpectation: LocalCiNetworkExpectation;
}

export interface LocalCiEffectsV2 {
  readonly credentialsAccess: boolean;
  readonly networkProviderAccess: boolean;
  readonly providerSpend: boolean;
  readonly externalMutation: boolean;
  readonly registrationMutation: boolean;
  readonly schedulesMutation: boolean;
  readonly deploymentMutation: boolean;
  readonly consumerBindingMutation: boolean;
  readonly servingAuthorityMutation: boolean;
}

export interface LocalCiContractV2 {
  readonly schemaId: typeof LOCAL_CI_CONTRACT_V2_SCHEMA_ID;
  readonly schemaVersion: typeof LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION;
  readonly contractId: typeof LOCAL_CI_CONTRACT_V2_ID;
  readonly repository: string;
  readonly canonicalBranch: string;
  readonly commands: Readonly<Record<string, LocalCiCommandV2>>;
  readonly environment: LocalCiEnvironmentV2;
  readonly effects: LocalCiEffectsV2;
}

export type LegacyLineageKind = "model-gateway-v1" | "repo-factory-v1" | "none" | "unknown";

export interface LegacyLocalCiDisposition {
  readonly disposition: "valid-v2" | "migrated" | "rejected";
  readonly legacyLineage: LegacyLineageKind;
  readonly sourceBlobSha256: string;
  readonly reasonCode?: string;
  readonly contract?: LocalCiContractV2;
  readonly diagnostics?: readonly Diagnostic[];
}

const SHELLS = new Set(["pwsh", "cmd", "bash", "sh", "none"]);
const FAILURE_DISPOSITIONS = new Set(["fail-gate", "warning", "non-routable"]);
const NETWORK_EXPECTATIONS = new Set(["offline-only", "local-loopback", "outbound-allowed"]);
const COMMAND_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function stringArray(value: unknown, pointer: string, min: number, max: number, diagnostics: Diagnostics): void {
  if (!diagnostics.array(value, pointer, min, max)) return;
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (!diagnostics.string(item, `${pointer}/${index}`, { min: 1 })) return;
    if (seen.has(item)) diagnostics.add("E_DUPLICATE", `${pointer}/${index}`, `duplicate value: ${item}`);
    else seen.add(item);
  });
}

function finish<T>(value: T, diagnostics: Diagnostics): ValidationResult<T> {
  const sorted = diagnostics.sorted();
  return sorted.length === 0 ? { ok: true, value } : { ok: false, diagnostics: sorted };
}

export function orderedLocalCiCommands(
  contract: LocalCiContractV2,
): readonly OrderedLocalCiCommandV2[] {
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
      ...contract.commands["authoritative-gate"]!,
      id: "authoritative-gate",
      order: preflight.length,
      isAuthoritativeGate: true,
    },
  ];
}

export function validateLocalCiContractV2(value: unknown): ValidationResult<LocalCiContractV2> {
  const diagnostics = new Diagnostics();
  const fields = ["schemaId", "schemaVersion", "contractId", "repository", "canonicalBranch", "commands", "environment", "effects"];
  if (!diagnostics.object(value, "", fields, fields)) return finish(value as unknown as LocalCiContractV2, diagnostics);

  diagnostics.string(value["schemaId"], "/schemaId", { constant: LOCAL_CI_CONTRACT_V2_SCHEMA_ID });
  diagnostics.string(value["schemaVersion"], "/schemaVersion", { constant: LOCAL_CI_CONTRACT_V2_SCHEMA_VERSION });
  diagnostics.string(value["contractId"], "/contractId", { constant: LOCAL_CI_CONTRACT_V2_ID });
  diagnostics.string(value["repository"], "/repository", { min: 1, pattern: /^[^/]+\/[^/]+$/ });
  diagnostics.string(value["canonicalBranch"], "/canonicalBranch", { min: 1 });

  const commandsRaw = value["commands"];
  if (!isRecord(commandsRaw)) {
    diagnostics.add("E_TYPE", "/commands", "expected object");
  } else {
    const commandIds = Object.keys(commandsRaw).sort();
    if (commandIds.length === 0) {
      diagnostics.add("E_LENGTH", "/commands", "expected at least one command");
    }
    if (commandIds.length > 256) {
      diagnostics.add("E_LENGTH", "/commands", "expected at most 256 commands");
    }
    if (!Object.hasOwn(commandsRaw, "authoritative-gate")) {
      diagnostics.add(
        "E_NO_AUTHORITATIVE_GATE",
        "/commands/authoritative-gate",
        "required authoritative gate is missing",
      );
    }
    for (const id of commandIds) {
      const cmd = commandsRaw[id];
      const ptr = `/commands/${id}`;
      if (!COMMAND_ID_PATTERN.test(id)) {
        diagnostics.add("E_FORMAT", ptr, "invalid command id");
      }
      const closedFields = [
        "name",
        "executable",
        "args",
        "shell",
        "cwd",
        "timeoutSeconds",
        "expectedExitCode",
        "failureDisposition",
      ];
      if (diagnostics.object(cmd, ptr, closedFields, closedFields)) {
        diagnostics.string(cmd["name"], `${ptr}/name`, { min: 1 });
        diagnostics.string(cmd["executable"], `${ptr}/executable`, { min: 1 });
        stringArray(cmd["args"], `${ptr}/args`, 0, 256, diagnostics);
        const shellStr = cmd["shell"];
        if (diagnostics.string(shellStr, `${ptr}/shell`) && !SHELLS.has(shellStr)) diagnostics.add("E_ENUM", `${ptr}/shell`, "unsupported shell");
        diagnostics.string(cmd["cwd"], `${ptr}/cwd`, { min: 1 });
        const timeout = cmd["timeoutSeconds"];
        if (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1) diagnostics.add("E_TYPE", `${ptr}/timeoutSeconds`, "expected positive integer");
        if (typeof cmd["expectedExitCode"] !== "number" || !Number.isInteger(cmd["expectedExitCode"])) diagnostics.add("E_TYPE", `${ptr}/expectedExitCode`, "expected integer");
        const disp = cmd["failureDisposition"];
        if (diagnostics.string(disp, `${ptr}/failureDisposition`) && !FAILURE_DISPOSITIONS.has(disp)) diagnostics.add("E_ENUM", `${ptr}/failureDisposition`, "unsupported failure disposition");
      }
    }
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
    if (diagnostics.string(netExp, "/environment/networkExpectation") && !NETWORK_EXPECTATIONS.has(netExp)) diagnostics.add("E_ENUM", "/environment/networkExpectation", "unsupported network expectation");
  }

  const effRaw = value["effects"];
  const effFields = ["credentialsAccess", "networkProviderAccess", "providerSpend", "externalMutation", "registrationMutation", "schedulesMutation", "deploymentMutation", "consumerBindingMutation", "servingAuthorityMutation"];
  if (diagnostics.object(effRaw, "/effects", effFields, effFields)) {
    for (const field of effFields) {
      if (typeof effRaw[field] !== "boolean") diagnostics.add("E_TYPE", `/effects/${field}`, "expected boolean");
    }
  }

  return finish(value as unknown as LocalCiContractV2, diagnostics);
}

export function classifyAndMigrateLegacyLocalCiV1(rawInput: unknown, sourceBlob?: Uint8Array | string): LegacyLocalCiDisposition {
  const blobBytes = sourceBlob !== undefined ? (typeof sourceBlob === "string" ? Buffer.from(sourceBlob, "utf8") : sourceBlob) : Buffer.from(canonicalizeJson(rawInput), "utf8");
  const sourceBlobSha256 = sha256Bytes(blobBytes);

  const v2Result = validateLocalCiContractV2(rawInput);
  if (v2Result.ok) return { disposition: "valid-v2", legacyLineage: "none", sourceBlobSha256, contract: v2Result.value };
  if (!isRecord(rawInput)) return { disposition: "rejected", legacyLineage: "unknown", sourceBlobSha256, reasonCode: "MALFORMED_INPUT", diagnostics: v2Result.diagnostics };

  if ("checks" in rawInput && "runtime" in rawInput) {
    return { disposition: "rejected", legacyLineage: "model-gateway-v1", sourceBlobSha256, reasonCode: "INCOMPLETE_LEGACY_EVIDENCE" };
  }

  if ("entrypoint" in rawInput && "gates" in rawInput) {
    return { disposition: "rejected", legacyLineage: "repo-factory-v1", sourceBlobSha256, reasonCode: "INCOMPLETE_LEGACY_EVIDENCE" };
  }

  return { disposition: "rejected", legacyLineage: "unknown", sourceBlobSha256, reasonCode: "NON_ROUTABLE_DECLARATION", diagnostics: v2Result.diagnostics };
}
