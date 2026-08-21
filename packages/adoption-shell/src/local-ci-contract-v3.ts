import { type Diagnostic, type ValidationResult } from "./contract.ts";
import { canonicalizeJson } from "./canonical-json.ts";
import { sha256Bytes } from "./digest.ts";
import {
  classifyAndMigrateLegacyLocalCiV1,
  validateLocalCiContractV2,
  type LegacyLineageKind,
} from "./local-ci-contract-v2.ts";
import { Diagnostics, escapePointer, isRecord } from "./validation-helpers.ts";

export const LOCAL_CI_CONTRACT_V3_ID = "repo-template/local-ci-v3" as const;
export const LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION = "3.0.0" as const;
export const LOCAL_CI_CONTRACT_V3_SCHEMA_ID =
  "https://schemas.repo-template.dev/local-ci-v3/local-ci-contract-v3.schema.json" as const;

export type LocalCiShellV3 = "pwsh" | "cmd" | "bash" | "sh" | "none";
export type LocalCiFailureDispositionV3 = "fail-gate" | "warning" | "non-routable";
export type LocalCiNetworkExpectationV3 = "offline-only" | "local-loopback" | "outbound-allowed";
export type DetectionProofExpectationV3 = "non-zero-exit";

export interface DetectionProofFixtureV3 {
  readonly path: string;
  readonly description: string;
  readonly expectation: DetectionProofExpectationV3;
}

export type DetectionProofV3 =
  | Readonly<{ fixture: DetectionProofFixtureV3; exempt?: undefined }>
  | Readonly<{ fixture?: undefined; exempt: string }>;

export interface LocalCiCommandV3 {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly shell: LocalCiShellV3;
  readonly cwd: string;
  readonly timeoutSeconds: number;
  readonly expectedExitCode: number;
  readonly failureDisposition: LocalCiFailureDispositionV3;
  readonly detectionProof: DetectionProofV3;
}

export interface OrderedLocalCiCommandV3 extends LocalCiCommandV3 {
  readonly id: string;
  readonly order: number;
  readonly isAuthoritativeGate: boolean;
}

export interface LocalCiEnvironmentV3 {
  readonly runtime: Readonly<{ name: string; versionConstraint: string }>;
  readonly packageManager: Readonly<{ name: string; version: string }>;
  readonly supportedPlatforms: readonly string[];
  readonly supportedArchitectures: readonly string[];
  readonly requiredEnvVars: readonly string[];
  readonly requiredCredentials: readonly string[];
  readonly networkExpectation: LocalCiNetworkExpectationV3;
}

export interface LocalCiEffectsV3 {
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

export interface LocalCiContractV3 {
  readonly schemaId: typeof LOCAL_CI_CONTRACT_V3_SCHEMA_ID;
  readonly schemaVersion: typeof LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION;
  readonly contractId: typeof LOCAL_CI_CONTRACT_V3_ID;
  readonly repository: string;
  readonly canonicalBranch: string;
  readonly commands: Readonly<Record<string, LocalCiCommandV3>>;
  readonly environment: LocalCiEnvironmentV3;
  readonly effects: LocalCiEffectsV3;
}

export type LegacyLineageKindV3 = LegacyLineageKind | "local-ci-v2";

export interface LegacyLocalCiDispositionV3 {
  readonly disposition: "valid-v3" | "migrated" | "rejected";
  readonly legacyLineage: LegacyLineageKindV3;
  readonly sourceBlobSha256: string;
  readonly reasonCode?: string;
  readonly commandsMissingDetectionProof?: readonly string[];
  readonly contract?: LocalCiContractV3;
  readonly diagnostics?: readonly Diagnostic[];
}

const SHELLS = new Set(["pwsh", "cmd", "bash", "sh", "none"]);
const FAILURE_DISPOSITIONS = new Set(["fail-gate", "warning", "non-routable"]);
const NETWORK_EXPECTATIONS = new Set(["offline-only", "local-loopback", "outbound-allowed"]);
const COMMAND_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function stringArray(value: unknown, pointer: string, min: number, max: number, diagnostics: Diagnostics): void {
  if (!diagnostics.array(value, pointer, min, max)) return;
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!diagnostics.string(item, `${pointer}/${index}`, { min: 1 })) continue;
    if (seen.has(item)) diagnostics.add("E_DUPLICATE", `${pointer}/${index}`, `duplicate value: ${item}`);
    else seen.add(item);
  }
}

function finish<T>(value: T | undefined, diagnostics: Diagnostics): ValidationResult<T> {
  const sorted = diagnostics.sorted();
  return sorted.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: sorted };
}

function hasValidatedShape(value: unknown, diagnostics: Diagnostics): value is LocalCiContractV3 {
  return diagnostics.rows.length === 0;
}

function validateDetectionProof(value: unknown, pointer: string, diagnostics: Diagnostics): void {
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
    diagnostics.add(
      "E_DETECTION_PROOF_CONFLICT",
      pointer,
      "detectionProof must declare exactly one of fixture or exempt, never both",
    );
    return;
  }
  if (!hasFixture && !hasExempt) {
    diagnostics.add(
      "E_DETECTION_PROOF_MISSING",
      pointer,
      "detectionProof must declare a known-bad fixture or a recorded exemption",
    );
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

export function orderedLocalCiCommandsV3(
  contract: LocalCiContractV3,
): readonly OrderedLocalCiCommandV3[] {
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

function validateSingleCommandV3(
  cmd: unknown,
  id: string,
  diagnostics: Diagnostics,
): void {
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

function validateCommandsV3(commandsRaw: unknown, diagnostics: Diagnostics): void {
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
    diagnostics.add(
      "E_NO_AUTHORITATIVE_GATE",
      "/commands/authoritative-gate",
      "required authoritative gate is missing",
    );
  }
  for (const id of commandIds) {
    validateSingleCommandV3(commandsRaw[id], id, diagnostics);
  }
}

function validateEnvironmentV3(envRaw: unknown, diagnostics: Diagnostics): void {
  const envFields = [
    "runtime", "packageManager", "supportedPlatforms", "supportedArchitectures",
    "requiredEnvVars", "requiredCredentials", "networkExpectation",
  ];
  if (!diagnostics.object(envRaw, "/environment", envFields, envFields)) return;
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

function validateEffectsV3(effRaw: unknown, diagnostics: Diagnostics): void {
  const effFields = [
    "credentialsAccess", "networkProviderAccess", "providerSpend",
    "externalMutation", "registrationMutation", "schedulesMutation",
    "deploymentMutation", "consumerBindingMutation", "servingAuthorityMutation",
  ];
  if (!diagnostics.object(effRaw, "/effects", effFields, effFields)) return;
  const effRec = effRaw;
  for (const field of effFields) {
    if (typeof effRec[field] !== "boolean") diagnostics.add("E_TYPE", `/effects/${field}`, "expected boolean");
  }
}

export function validateLocalCiContractV3(value: unknown): ValidationResult<LocalCiContractV3> {
  const diagnostics = new Diagnostics();
  const fields = ["schemaId", "schemaVersion", "contractId", "repository", "canonicalBranch", "commands", "environment", "effects"];
  if (!diagnostics.object(value, "", fields, fields)) return finish<LocalCiContractV3>(undefined, diagnostics);

  diagnostics.string(value["schemaId"], "/schemaId", { constant: LOCAL_CI_CONTRACT_V3_SCHEMA_ID });
  diagnostics.string(value["schemaVersion"], "/schemaVersion", { constant: LOCAL_CI_CONTRACT_V3_SCHEMA_VERSION });
  diagnostics.string(value["contractId"], "/contractId", { constant: LOCAL_CI_CONTRACT_V3_ID });
  diagnostics.string(value["repository"], "/repository", { min: 1, pattern: /^[^/]+\/[^/]+$/ });
  diagnostics.string(value["canonicalBranch"], "/canonicalBranch", { min: 1 });

  validateCommandsV3(value["commands"], diagnostics);
  validateEnvironmentV3(value["environment"], diagnostics);
  validateEffectsV3(value["effects"], diagnostics);

  return finish(
    hasValidatedShape(value, diagnostics) ? value : undefined,
    diagnostics,
  );
}

export function classifyAndMigrateLocalCiV2ToV3(
  rawInput: unknown,
  sourceBlob?: Uint8Array | string,
): LegacyLocalCiDispositionV3 {
  const blobBytes = sourceBlob !== undefined ? (typeof sourceBlob === "string" ? Buffer.from(sourceBlob, "utf8") : sourceBlob) : Buffer.from(canonicalizeJson(rawInput), "utf8");
  const sourceBlobSha256 = sha256Bytes(blobBytes);

  const v3Result = validateLocalCiContractV3(rawInput);
  if (v3Result.ok) return { disposition: "valid-v3", legacyLineage: "none", sourceBlobSha256, contract: v3Result.value };

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
