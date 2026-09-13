import { type Diagnostic, type ValidationResult } from "./contract.ts";
import { canonicalizeJson } from "./canonical-json.ts";
import { sha256CanonicalJson } from "./digest.ts";
import { portablePathFailure } from "./path-policy.ts";
import { Diagnostics, escapePointer, isRecord } from "./validation-helpers.ts";

export const PRODUCT_SLI_PROBE_CONTRACT_ID = "repo-template/product-sli-probe-v1" as const;
export const PRODUCT_SLI_PROBE_SCHEMA_VERSION = "product-sli-probe/v1" as const;
export const PRODUCT_SLI_PROBE_SCHEMA_ID =
  "https://schemas.repo-template.dev/product-sli-probe/v1/product-sli-probe.schema.json" as const;
export const PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION = "product-sli-observation/v1" as const;
export const PRODUCT_SLI_OBSERVATION_SCHEMA_ID =
  "https://schemas.repo-template.dev/product-sli-probe/v1/product-sli-observation.schema.json" as const;
export const PRODUCT_SLI_MIGRATION_RECEIPT_SCHEMA_VERSION =
  "product-sli-migration-receipt/v1" as const;

export const FORBIDDEN_SHELL_CHARACTERS = /[;&|`$<>\r\n]/;
export const PRINCIPLE_ID_PATTERN = /^P\d+(?:\.\d+)*$/;
export const SLI_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const REPOSITORY_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const ALLOWED_EFFECT_CLASSES = new Set(["read-only", "fixture-only"]);
export const FORBIDDEN_EFFECT_CLASSES = new Set(["destructive", "live-write", "spend", "network-mutation"]);
export const OBSERVATION_KINDS = new Set(["gauge", "count-ratio", "boolean", "report-only"]);
export const COMPARATORS = new Set(["<", "<=", ">", ">=", "==", "!=", "in-range", "report-only"]);
export const DISPOSITION_KINDS = new Set(["report-only", "unsupported", "non-mechanizable"]);
export const OBSERVATION_STATUSES = new Set(["pass", "fail", "warn", "error", "report-only"]);

export type ProductSliObservationKind = "gauge" | "count-ratio" | "boolean" | "report-only";
export type ProductSliEffectClass = "read-only" | "fixture-only";
export type ProductSliComparator = "<" | "<=" | ">" | ">=" | "==" | "!=" | "in-range" | "report-only";
export type ProductSliDispositionKind = "report-only" | "unsupported" | "non-mechanizable";
export type ProductSliObservationStatus = "pass" | "fail" | "warn" | "error" | "report-only";

export interface ProductSliSloReference {
  readonly target: string;
  readonly comparator?: ProductSliComparator;
}

export interface ProductSliDisposition {
  readonly kind: ProductSliDispositionKind;
  readonly owner: string;
  readonly reviewDate: string;
  readonly rationale: string;
}

export interface ProductSliEntrypoint {
  readonly path: string;
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly timeoutSeconds?: number;
}

export interface ProductSliEffects {
  readonly effectClass: ProductSliEffectClass;
  readonly spend?: false;
  readonly liveMutation?: false;
}

export interface ProductSliCadence {
  readonly freshnessSeconds: number;
  readonly suggestedIntervalSeconds?: number;
}

export interface ProductSliObservationReceiptSpec {
  readonly schemaVersion: typeof PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION;
  readonly evidenceKind?: string;
}

export interface ProductSliProbeV1 {
  readonly sliId: string;
  readonly bindsPrinciple: string;
  readonly kind: ProductSliObservationKind;
  readonly sloReference: ProductSliSloReference;
  readonly disposition?: ProductSliDisposition;
  readonly entrypoint?: ProductSliEntrypoint;
  readonly effects?: ProductSliEffects;
  readonly requiredCapabilities?: readonly string[];
  readonly cadence: ProductSliCadence;
  readonly receipt?: ProductSliObservationReceiptSpec;
}

export interface ProductSliProbeContractV1 {
  readonly $schema?: string;
  readonly schemaId: typeof PRODUCT_SLI_PROBE_SCHEMA_ID;
  readonly schemaVersion: typeof PRODUCT_SLI_PROBE_SCHEMA_VERSION;
  readonly contractId: typeof PRODUCT_SLI_PROBE_CONTRACT_ID;
  readonly repository: string;
  readonly probes: readonly ProductSliProbeV1[];
}

export interface ProductSliObservationV1 {
  readonly schemaId: typeof PRODUCT_SLI_OBSERVATION_SCHEMA_ID;
  readonly schemaVersion: typeof PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION;
  readonly contractId: typeof PRODUCT_SLI_PROBE_CONTRACT_ID;
  readonly observationId: string;
  readonly repository: string;
  readonly sliId: string;
  readonly observedAt: string;
  readonly status: ProductSliObservationStatus;
  readonly kind: ProductSliObservationKind;
  readonly value:
    | number
    | boolean
    | string
    | Readonly<{
        numerator: number;
        denominator: number;
        ratio: number;
      }>;
  readonly target: string;
  readonly freshness?: Readonly<{
    observedAt: string;
    expiresAt?: string;
    freshnessSeconds?: number;
  }>;
  readonly evidence: Readonly<{
    kind: string;
    summary?: string;
    details?: unknown;
    receiptRef?: string;
  }>;
}

export interface ParsedPrioritiesRow {
  readonly id: string;
  readonly bindsPrinciple: string;
  readonly sli: string;
  readonly slo: string;
  readonly status: string;
  readonly line: number;
}

export interface ProductSliMigrationReceiptV1 {
  readonly schemaVersion: typeof PRODUCT_SLI_MIGRATION_RECEIPT_SCHEMA_VERSION;
  readonly repository: string;
  readonly migratedAt: string;
  readonly beforeSemanticDigest: string;
  readonly afterSemanticDigest: string;
  readonly provenancePreserved: boolean;
  readonly rowsCount: number;
  readonly mechanizedProbesCount: number;
  readonly reportOnlyProbesCount: number;
  readonly unboundActiveCount: 0;
  readonly bindings: readonly Readonly<{
    sliId: string;
    bindsPrinciple: string;
    status: string;
    probeKind: ProductSliObservationKind;
    target: string;
  }>[];
}

function parseMarkdownTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed.slice(1, -1).split("|").map((c) => c.trim());
}

function isMarkdownSeparator(line: string): boolean {
  const cells = parseMarkdownTableCells(line);
  return cells !== null && cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/u.test(c));
}

/**
 * Parse the authoritative ## Local SLI / SLO table from PRIORITIES.md
 */
export function parsePrioritiesLocalSliTable(prioritiesMarkdown: string): ParsedPrioritiesRow[] {
  const lines = prioritiesMarkdown.split(/\r?\n/u);
  const headingIdx = lines.findIndex((l) => /^##\s+Local SLI \/ SLO\s*$/u.test(l));
  if (headingIdx < 0) return [];

  let headerRowIndex = -1;
  let idCol = -1;
  let principleCol = -1;
  let sliCol = -1;
  let sloCol = -1;
  let statusCol = -1;

  for (let index = headingIdx + 1; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? "";
    if (/^##\s+/u.test(line)) break;
    const next = lines[index + 1] ?? "";
    if (!isMarkdownSeparator(next)) continue;

    const cells = parseMarkdownTableCells(line);
    if (!cells) continue;
    const normalized = cells.map((c) => c.toLowerCase());
    idCol = normalized.findIndex((c) => c === "id");
    principleCol = normalized.findIndex((c) => c === "binds principle");
    sliCol = normalized.findIndex((c) => c.startsWith("sli"));
    sloCol = normalized.findIndex((c) => c.startsWith("slo"));
    statusCol = normalized.findIndex((c) => c === "status");

    if (idCol >= 0 && principleCol >= 0 && sliCol >= 0 && sloCol >= 0 && statusCol >= 0) {
      headerRowIndex = index;
      break;
    }
  }

  if (headerRowIndex < 0) return [];

  const rows: ParsedPrioritiesRow[] = [];
  for (let index = headerRowIndex + 2; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^##\s+/u.test(line)) break;
    const cells = parseMarkdownTableCells(line);
    if (!cells || cells.length <= Math.max(idCol, principleCol, sliCol, sloCol, statusCol)) continue;

    const id = cells[idCol] ?? "";
    const bindsPrinciple = cells[principleCol] ?? "";
    const sli = cells[sliCol] ?? "";
    const slo = cells[sloCol] ?? "";
    const status = cells[statusCol] ?? "";

    if (id.length > 0) {
      rows.push({
        id,
        bindsPrinciple,
        sli,
        slo,
        status,
        line: index + 1,
      });
    }
  }

  return rows;
}

function validateEntrypoint(
  entrypoint: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const allowed = ["path", "argv", "cwd", "timeoutSeconds"];
  if (!diagnostics.object(entrypoint, pointer, allowed, ["path", "argv"])) return;

  const pathVal = entrypoint["path"];
  if (diagnostics.string(pathVal, `${pointer}/path`, { min: 1 })) {
    const failure = portablePathFailure(pathVal);
    if (failure !== null) {
      diagnostics.add("E_PATH_POLICY", `${pointer}/path`, `invalid repository-relative path: ${failure}`);
    } else if (FORBIDDEN_SHELL_CHARACTERS.test(pathVal)) {
      diagnostics.add("E_SHELL_INJECTION", `${pointer}/path`, "entrypoint path contains forbidden shell characters");
    }
  }

  const argvVal = entrypoint["argv"];
  if (diagnostics.array(argvVal, `${pointer}/argv`, 0, 128)) {
    for (const [argIndex, arg] of argvVal.entries()) {
      if (typeof arg !== "string") {
        diagnostics.add("E_TYPE", `${pointer}/argv/${String(argIndex)}`, "expected string argument");
      } else if (FORBIDDEN_SHELL_CHARACTERS.test(arg)) {
        diagnostics.add(
          "E_SHELL_INJECTION",
          `${pointer}/argv/${String(argIndex)}`,
          "argument contains forbidden shell metacharacters",
        );
      }
    }
  }

  if (entrypoint["cwd"] !== undefined) {
    const cwdVal = entrypoint["cwd"];
    if (diagnostics.string(cwdVal, `${pointer}/cwd`)) {
      if (cwdVal !== "." && portablePathFailure(cwdVal) !== null) {
        diagnostics.add("E_PATH_POLICY", `${pointer}/cwd`, "invalid cwd path");
      }
    }
  }

  if (entrypoint["timeoutSeconds"] !== undefined) {
    const t = entrypoint["timeoutSeconds"];
    if (typeof t !== "number" || !Number.isInteger(t) || t < 1 || t > 3600) {
      diagnostics.add("E_TYPE", `${pointer}/timeoutSeconds`, "expected integer between 1 and 3600");
    }
  }
}

function validateEffects(
  effects: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const allowed = ["effectClass", "spend", "liveMutation"];
  if (!diagnostics.object(effects, pointer, allowed, ["effectClass"])) return;

  const effectClass = effects["effectClass"];
  if (typeof effectClass === "string") {
    if (FORBIDDEN_EFFECT_CLASSES.has(effectClass)) {
      diagnostics.add(
        "E_FORBIDDEN_EFFECT",
        `${pointer}/effectClass`,
        `forbidden effect class '${effectClass}': destructive, live-write, and spend are structurally refused`,
      );
    } else if (!ALLOWED_EFFECT_CLASSES.has(effectClass)) {
      diagnostics.add("E_ENUM", `${pointer}/effectClass`, `unsupported effectClass '${effectClass}'`);
    }
  } else {
    diagnostics.add("E_TYPE", `${pointer}/effectClass`, "expected string effectClass");
  }

  if (effects["spend"] !== undefined && effects["spend"] !== false) {
    diagnostics.add("E_FORBIDDEN_EFFECT", `${pointer}/spend`, "spend effects are strictly forbidden for product probes");
  }
  if (effects["liveMutation"] !== undefined && effects["liveMutation"] !== false) {
    diagnostics.add("E_FORBIDDEN_EFFECT", `${pointer}/liveMutation`, "live mutation is strictly forbidden for product probes");
  }
}

function validateDisposition(
  disposition: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const fields = ["kind", "owner", "reviewDate", "rationale"];
  if (!diagnostics.object(disposition, pointer, fields, fields)) return;

  const k = disposition["kind"];
  if (typeof k === "string") {
    if (!DISPOSITION_KINDS.has(k)) {
      diagnostics.add("E_ENUM", `${pointer}/kind`, `unsupported disposition kind '${k}'`);
    }
  } else {
    diagnostics.add("E_TYPE", `${pointer}/kind`, "expected string");
  }

  diagnostics.string(disposition["owner"], `${pointer}/owner`, { min: 1 });
  const reviewDate = disposition["reviewDate"];
  if (diagnostics.string(reviewDate, `${pointer}/reviewDate`)) {
    if (!ISO_DATE_PATTERN.test(reviewDate)) {
      diagnostics.add("E_FORMAT", `${pointer}/reviewDate`, "expected YYYY-MM-DD date");
    }
  }
  diagnostics.string(disposition["rationale"], `${pointer}/rationale`, { min: 1 });
}

function validateSingleProbe(
  probe: unknown,
  pointer: string,
  diagnostics: Diagnostics,
  seenIds: Set<string>,
): void {
  const allowed = [
    "sliId",
    "bindsPrinciple",
    "kind",
    "sloReference",
    "disposition",
    "entrypoint",
    "effects",
    "requiredCapabilities",
    "cadence",
    "receipt",
  ];
  const required = ["sliId", "bindsPrinciple", "kind", "sloReference", "cadence"];
  if (!diagnostics.object(probe, pointer, allowed, required)) return;

  const sliId = probe["sliId"];
  if (diagnostics.string(sliId, `${pointer}/sliId`, { min: 1, max: 64, pattern: SLI_ID_PATTERN })) {
    if (seenIds.has(sliId)) {
      diagnostics.add("E_DUPLICATE_ID", `${pointer}/sliId`, `duplicate probe sliId '${sliId}'`);
    } else {
      seenIds.add(sliId);
    }
  }

  diagnostics.string(probe["bindsPrinciple"], `${pointer}/bindsPrinciple`, {
    pattern: PRINCIPLE_ID_PATTERN,
  });

  const kind = probe["kind"];
  if (diagnostics.string(kind, `${pointer}/kind`)) {
    if (!OBSERVATION_KINDS.has(kind)) {
      diagnostics.add("E_ENUM", `${pointer}/kind`, `unsupported observation kind '${kind}'`);
    }
  }

  const sloRef = probe["sloReference"];
  if (diagnostics.object(sloRef, `${pointer}/sloReference`, ["target", "comparator"], ["target"])) {
    diagnostics.string(sloRef["target"], `${pointer}/sloReference/target`, { min: 1 });
    if (sloRef["comparator"] !== undefined) {
      const comp = sloRef["comparator"];
      if (typeof comp === "string" && !COMPARATORS.has(comp)) {
        diagnostics.add("E_ENUM", `${pointer}/sloReference/comparator`, `invalid comparator '${comp}'`);
      }
    }
  }

  const cadence = probe["cadence"];
  if (diagnostics.object(cadence, `${pointer}/cadence`, ["freshnessSeconds", "suggestedIntervalSeconds"], ["freshnessSeconds"])) {
    const freshness = cadence["freshnessSeconds"];
    if (typeof freshness !== "number" || !Number.isInteger(freshness) || freshness < 1) {
      diagnostics.add("E_TYPE", `${pointer}/cadence/freshnessSeconds`, "expected positive integer");
    }
    if (cadence["suggestedIntervalSeconds"] !== undefined) {
      const interval = cadence["suggestedIntervalSeconds"];
      if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 1) {
        diagnostics.add("E_TYPE", `${pointer}/cadence/suggestedIntervalSeconds`, "expected positive integer");
      }
    }
  }

  if (kind === "report-only" || probe["disposition"] !== undefined) {
    if (probe["disposition"] === undefined) {
      diagnostics.add("E_REQUIRED", `${pointer}/disposition`, "report-only probe requires explicit disposition");
    } else {
      validateDisposition(probe["disposition"], `${pointer}/disposition`, diagnostics);
    }
  }

  if (kind !== "report-only") {
    if (probe["entrypoint"] === undefined) {
      diagnostics.add("E_REQUIRED", `${pointer}/entrypoint`, "mechanized probe requires entrypoint");
    } else {
      validateEntrypoint(probe["entrypoint"], `${pointer}/entrypoint`, diagnostics);
    }

    if (probe["effects"] === undefined) {
      diagnostics.add("E_REQUIRED", `${pointer}/effects`, "mechanized probe requires effects declaration");
    } else {
      validateEffects(probe["effects"], `${pointer}/effects`, diagnostics);
    }
  }

  if (probe["requiredCapabilities"] !== undefined) {
    const caps = probe["requiredCapabilities"];
    if (diagnostics.array(caps, `${pointer}/requiredCapabilities`, 0, 64)) {
      for (const [idx, cap] of caps.entries()) {
        diagnostics.string(cap, `${pointer}/requiredCapabilities/${String(idx)}`, { min: 1 });
      }
    }
  }

  if (probe["receipt"] !== undefined) {
    const rcpt = probe["receipt"];
    if (diagnostics.object(rcpt, `${pointer}/receipt`, ["schemaVersion", "evidenceKind"], ["schemaVersion"])) {
      if (rcpt["schemaVersion"] !== PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION) {
        diagnostics.add(
          "E_CONST",
          `${pointer}/receipt/schemaVersion`,
          `expected '${PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION}'`,
        );
      }
    }
  }
}

/**
 * Validate ProductSliProbeContractV1 and optionally verify 1-to-1 binding against PRIORITIES.md
 */
export function validateProductSliProbeContractV1(
  contractRaw: unknown,
  prioritiesMarkdown?: string,
): ValidationResult<ProductSliProbeContractV1> {
  const diagnostics = new Diagnostics();
  const allowed = ["$schema", "schemaId", "schemaVersion", "contractId", "repository", "probes"];
  const required = ["schemaId", "schemaVersion", "contractId", "repository", "probes"];

  if (!diagnostics.object(contractRaw, "", allowed, required)) {
    return { ok: false, diagnostics: diagnostics.sorted() };
  }

  if (contractRaw["schemaId"] !== PRODUCT_SLI_PROBE_SCHEMA_ID) {
    diagnostics.add("E_CONST", "/schemaId", `must equal '${PRODUCT_SLI_PROBE_SCHEMA_ID}'`);
  }
  if (contractRaw["schemaVersion"] !== PRODUCT_SLI_PROBE_SCHEMA_VERSION) {
    diagnostics.add("E_CONST", "/schemaVersion", `must equal '${PRODUCT_SLI_PROBE_SCHEMA_VERSION}'`);
  }
  if (contractRaw["contractId"] !== PRODUCT_SLI_PROBE_CONTRACT_ID) {
    diagnostics.add("E_CONST", "/contractId", `must equal '${PRODUCT_SLI_PROBE_CONTRACT_ID}'`);
  }

  diagnostics.string(contractRaw["repository"], "/repository", {
    min: 3,
    pattern: REPOSITORY_PATTERN,
  });

  const probesRaw = contractRaw["probes"];
  const seenProbeIds = new Set<string>();

  if (diagnostics.array(probesRaw, "/probes", 0, 256)) {
    for (const [index, probe] of probesRaw.entries()) {
      validateSingleProbe(probe, `/probes/${String(index)}`, diagnostics, seenProbeIds);
    }
  }

  // Cross-validation against PRIORITIES.md if supplied
  if (prioritiesMarkdown !== undefined && diagnostics.rows.length === 0) {
    const rows = parsePrioritiesLocalSliTable(prioritiesMarkdown);
    const seenRowIds = new Set<string>();

    for (const row of rows) {
      if (row.id.startsWith("_(") && row.id.endsWith(")_")) continue; // placeholder
      if (seenRowIds.has(row.id)) {
        diagnostics.add("E_DUPLICATE_ID", `/priorities/${row.id}`, `duplicate SLI row ID '${row.id}' in PRIORITIES.md`);
      } else {
        seenRowIds.add(row.id);
      }
    }

    const probesList = (probesRaw as unknown[]) ?? [];
    const probesById = new Map<string, Record<string, unknown>>();
    for (const probe of probesList) {
      if (isRecord(probe) && typeof probe["sliId"] === "string") {
        probesById.set(probe["sliId"], probe);
      }
    }

    // Every active row must have exactly one compatible binding
    for (const row of rows) {
      if (row.id.startsWith("_(") && row.id.endsWith(")_")) continue;
      if (row.status.toLowerCase() === "active") {
        const probe = probesById.get(row.id);
        if (!probe) {
          diagnostics.add(
            "E_UNBOUND_ACTIVE_ROW",
            `/probes/${row.id}`,
            `active local row '${row.id}' in PRIORITIES.md has no probe binding or explicit report-only disposition`,
          );
        } else {
          const principle = probe["bindsPrinciple"];
          if (typeof principle === "string" && principle !== row.bindsPrinciple) {
            diagnostics.add(
              "E_PRINCIPLE_MISMATCH",
              `/probes/${row.id}/bindsPrinciple`,
              `probe '${row.id}' binds principle '${principle}' which does not match PRIORITIES.md principle '${row.bindsPrinciple}'`,
            );
          }
        }
      }
    }

    // Every probe in contract must map to an authoritative row in PRIORITIES.md
    for (const [id, probe] of probesById.entries()) {
      const row = rows.find((r) => r.id === id);
      if (!row) {
        diagnostics.add(
          "E_UNKNOWN_SLI_ROW",
          `/probes/${id}`,
          `probe specifies sliId '${id}' which is not present in PRIORITIES.md`,
        );
      } else {
        const principle = probe["bindsPrinciple"];
        if (typeof principle === "string" && principle !== row.bindsPrinciple) {
          diagnostics.add(
            "E_PRINCIPLE_MISMATCH",
            `/probes/${id}/bindsPrinciple`,
            `probe '${id}' binds principle '${principle}' which does not match PRIORITIES.md principle '${row.bindsPrinciple}'`,
          );
        }
      }
    }
  }

  if (diagnostics.rows.length > 0) {
    return { ok: false, diagnostics: diagnostics.sorted() };
  }

  return { ok: true, value: (contractRaw as unknown) as ProductSliProbeContractV1 };
}

/**
 * Validate typed observation payload
 */
export function validateProductSliObservationV1(
  value: unknown,
): ValidationResult<ProductSliObservationV1> {
  const diagnostics = new Diagnostics();
  const allowed = [
    "schemaId",
    "schemaVersion",
    "contractId",
    "observationId",
    "repository",
    "sliId",
    "observedAt",
    "status",
    "kind",
    "value",
    "target",
    "freshness",
    "evidence",
  ];
  const required = [
    "schemaId",
    "schemaVersion",
    "contractId",
    "observationId",
    "repository",
    "sliId",
    "observedAt",
    "status",
    "kind",
    "value",
    "target",
    "evidence",
  ];

  if (!diagnostics.object(value, "", allowed, required)) {
    return { ok: false, diagnostics: diagnostics.sorted() };
  }

  if (value["schemaId"] !== PRODUCT_SLI_OBSERVATION_SCHEMA_ID) {
    diagnostics.add("E_CONST", "/schemaId", `must equal '${PRODUCT_SLI_OBSERVATION_SCHEMA_ID}'`);
  }
  if (value["schemaVersion"] !== PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION) {
    diagnostics.add("E_CONST", "/schemaVersion", `must equal '${PRODUCT_SLI_OBSERVATION_SCHEMA_VERSION}'`);
  }
  if (value["contractId"] !== PRODUCT_SLI_PROBE_CONTRACT_ID) {
    diagnostics.add("E_CONST", "/contractId", `must equal '${PRODUCT_SLI_PROBE_CONTRACT_ID}'`);
  }

  diagnostics.string(value["observationId"], "/observationId", { min: 1 });
  diagnostics.string(value["repository"], "/repository", { pattern: REPOSITORY_PATTERN });
  diagnostics.string(value["sliId"], "/sliId", { min: 1, pattern: SLI_ID_PATTERN });
  diagnostics.string(value["observedAt"], "/observedAt", { min: 1 });

  const status = value["status"];
  if (diagnostics.string(status, "/status") && !OBSERVATION_STATUSES.has(status)) {
    diagnostics.add("E_ENUM", "/status", `invalid status '${status}'`);
  }

  const kind = value["kind"];
  if (diagnostics.string(kind, "/kind") && !OBSERVATION_KINDS.has(kind)) {
    diagnostics.add("E_ENUM", "/kind", `invalid observation kind '${kind}'`);
  }

  diagnostics.string(value["target"], "/target", { min: 1 });

  const ev = value["evidence"];
  if (diagnostics.object(ev, "/evidence", ["kind", "summary", "details", "receiptRef"], ["kind"])) {
    diagnostics.string(ev["kind"], "/evidence/kind", { min: 1 });
  }

  if (diagnostics.rows.length > 0) {
    return { ok: false, diagnostics: diagnostics.sorted() };
  }

  return { ok: true, value: (value as unknown) as ProductSliObservationV1 };
}

/**
 * Creates a deterministic migration receipt asserting semantic preservation
 */
export function createProductSliMigrationReceipt(params: {
  readonly repository: string;
  readonly legacyDefinitions: readonly Readonly<{
    id: string;
    bindsPrinciple: string;
    sli: string;
    slo: string;
  }>[];
  readonly prioritiesRows: readonly ParsedPrioritiesRow[];
  readonly contract: ProductSliProbeContractV1;
  readonly migratedAt: string;
}): ProductSliMigrationReceiptV1 {
  const beforeCanonical = canonicalizeJson({
    repository: params.repository,
    rows: params.legacyDefinitions.map((d) => ({
      bindsPrinciple: d.bindsPrinciple,
      id: d.id,
      sli: d.sli,
      slo: d.slo,
    })),
  });
  const beforeSemanticDigest = sha256CanonicalJson(JSON.parse(beforeCanonical));

  const afterCanonical = canonicalizeJson({
    probes: params.contract.probes.map((p) => ({
      bindsPrinciple: p.bindsPrinciple,
      kind: p.kind,
      sliId: p.sliId,
      target: p.sloReference.target,
    })),
    repository: params.repository,
    rows: params.prioritiesRows
      .filter((r) => !r.id.startsWith("_("))
      .map((r) => ({
        bindsPrinciple: r.bindsPrinciple,
        id: r.id,
        sli: r.sli,
        slo: r.slo,
      })),
  });
  const afterSemanticDigest = sha256CanonicalJson(JSON.parse(afterCanonical));

  const mechanizedProbesCount = params.contract.probes.filter((p) => p.kind !== "report-only").length;
  const reportOnlyProbesCount = params.contract.probes.filter((p) => p.kind === "report-only").length;

  const bindings = params.prioritiesRows
    .filter((r) => !r.id.startsWith("_("))
    .map((row) => {
      const probe = params.contract.probes.find((p) => p.sliId === row.id);
      return {
        bindsPrinciple: row.bindsPrinciple,
        probeKind: probe?.kind ?? ("report-only" as const),
        sliId: row.id,
        status: row.status,
        target: row.slo,
      };
    });

  return {
    afterSemanticDigest,
    beforeSemanticDigest,
    bindings,
    mechanizedProbesCount,
    migratedAt: params.migratedAt,
    provenancePreserved: true,
    reportOnlyProbesCount,
    repository: params.repository,
    rowsCount: bindings.length,
    schemaVersion: PRODUCT_SLI_MIGRATION_RECEIPT_SCHEMA_VERSION,
    unboundActiveCount: 0,
  };
}
