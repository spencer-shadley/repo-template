import {
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  RELEASE_RECEIPT_KIND,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type ArtifactManifest,
  type FileClosureRow,
  type MaterializerOutputManifest,
  type SchemaClosureRow,
  type ValidationResult,
  type VerificationReceipt,
} from "./contract.ts";
import { sha256CanonicalJson } from "./digest.ts";
import {
  isIssueTemplateOverride,
  isPreCustodyWorkflow,
  portablePathFailure,
} from "./path-policy.ts";
import {
  assertSortedUnique,
  BUNDLE_ID_PATTERN,
  Diagnostics,
  isRecord,
  SEMVER_PATTERN,
} from "./validation-helpers.ts";

const ENTRY_ROLES = new Set([
  "generic-base-text",
  "generic-base-binary",
  "capability-executable",
  "capability-config",
  "capability-fixture",
  "capability-golden",
]);

function finish<T>(value: T | undefined, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: rows };
}

function schemaIdentity(
  record: Record<string, unknown>,
  expectedId: string,
  expectedDigest: string,
  diagnostics: Diagnostics,
): void {
  diagnostics.string(record["schemaId"], "/schemaId", { constant: expectedId });
  diagnostics.string(record["schemaVersion"], "/schemaVersion", {
    constant: CONTRACT_VERSION,
  });
  if (
    diagnostics.sha(record["schemaDigest"], "/schemaDigest") &&
    record["schemaDigest"] !== expectedDigest
  ) {
    diagnostics.add(
      "E_SCHEMA_DIGEST",
      "/schemaDigest",
      "schema digest does not match the committed contract",
    );
  }
}

function portablePath(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is string {
  if (!diagnostics.string(value, pointer, { min: 1, max: 240 })) return false;
  const failure = portablePathFailure(value);
  if (failure !== null) {
    diagnostics.add("E_PATH_PORTABLE", pointer, `portable path rejected: ${failure}`);
  }
  if (isIssueTemplateOverride(value)) {
    diagnostics.add(
      "E_PATH_ISSUE_TEMPLATE",
      pointer,
      "local .github/ISSUE_TEMPLATE overrides are forbidden",
    );
  }
  if (isPreCustodyWorkflow(value)) {
    diagnostics.add(
      "E_PATH_PRE_CUSTODY_WORKFLOW",
      pointer,
      "pre-custody .github/workflows entries are forbidden",
    );
  }
  return (
    failure === null &&
    !isIssueTemplateOverride(value) &&
    !isPreCustodyWorkflow(value)
  );
}

function validateFileRow(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is FileClosureRow {
  const fields = ["path", "kind", "mode", "sha256", "bytes"];
  if (!diagnostics.object(value, pointer, fields, fields)) return false;
  portablePath(value["path"], `${pointer}/path`, diagnostics);
  diagnostics.string(value["kind"], `${pointer}/kind`, { constant: "file" });
  if (
    diagnostics.string(value["mode"], `${pointer}/mode`) &&
    value["mode"] !== "100644" &&
    value["mode"] !== "100755"
  ) {
    diagnostics.add("E_MODE", `${pointer}/mode`, "mode must be 100644 or 100755");
  }
  diagnostics.sha(value["sha256"], `${pointer}/sha256`);
  if (
    !Number.isSafeInteger(value["bytes"]) ||
    Number(value["bytes"]) < 0 ||
    Number(value["bytes"]) > 33_554_432
  ) {
    diagnostics.add("E_COUNT", `${pointer}/bytes`, "bytes must be between 0 and 33554432");
  }
  return true;
}

function validateFileRows(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): readonly FileClosureRow[] {
  if (!diagnostics.array(value, pointer, 0, 4096)) return [];
  const rows: FileClosureRow[] = [];
  for (const [index, row] of value.entries()) {
    if (validateFileRow(row, `${pointer}/${index}`, diagnostics)) rows.push(row);
  }
  assertSortedUnique(rows.map((row) => row.path), pointer, diagnostics);
  return rows;
}

function validateOutputEntryOwnership(
  role: unknown,
  bundleId: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  const generic =
    role === "generic-base-text" || role === "generic-base-binary";
  if (generic) {
    if (bundleId !== null) {
      diagnostics.add(
        "E_BUNDLE_OWNERSHIP",
        `${pointer}/bundleId`,
        "generic base entries must use null bundleId",
      );
    }
  } else {
    diagnostics.string(bundleId, `${pointer}/bundleId`, {
      min: 1,
      max: 80,
      pattern: BUNDLE_ID_PATTERN,
    });
  }
}

function validateOutputEntryEncoding(
  role: unknown,
  encoding: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (
    diagnostics.string(encoding, `${pointer}/encoding`) &&
    encoding !== "utf-8" &&
    encoding !== "binary"
  ) {
    diagnostics.add("E_ENCODING", `${pointer}/encoding`, "unsupported encoding");
  }
  const expectedEncoding =
    role === "generic-base-binary" ? "binary" : "utf-8";
  if (ENTRY_ROLES.has(String(role)) && encoding !== expectedEncoding) {
    diagnostics.add(
      "E_ENCODING_ROLE",
      `${pointer}/encoding`,
      `${String(role)} requires ${expectedEncoding}`,
    );
  }
}

function validateOutputEntry(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): string | null {
  const fields = [
    "path",
    "kind",
    "mode",
    "contentSha256",
    "role",
    "encoding",
    "bundleId",
  ];
  if (!diagnostics.object(value, pointer, fields, fields)) return null;
  const pathValid = portablePath(value["path"], `${pointer}/path`, diagnostics);
  diagnostics.string(value["kind"], `${pointer}/kind`, { constant: "file" });
  if (
    diagnostics.string(value["mode"], `${pointer}/mode`) &&
    value["mode"] !== "100644" &&
    value["mode"] !== "100755"
  ) {
    diagnostics.add("E_MODE", `${pointer}/mode`, "mode must be 100644 or 100755");
  }
  diagnostics.sha(value["contentSha256"], `${pointer}/contentSha256`);
  if (
    diagnostics.string(value["role"], `${pointer}/role`) &&
    !ENTRY_ROLES.has(value["role"])
  ) {
    diagnostics.add("E_ROLE", `${pointer}/role`, "unsupported payload role");
  }
  validateOutputEntryOwnership(value["role"], value["bundleId"], pointer, diagnostics);
  validateOutputEntryEncoding(value["role"], value["encoding"], pointer, diagnostics);
  return pathValid && typeof value["path"] === "string" ? value["path"] : null;
}

function validateOutputSelectedBundles(value: unknown, diagnostics: Diagnostics): void {
  if (!diagnostics.array(value, "/selectedBundles", 0, 256) || !Array.isArray(value)) return;
  const keys: string[] = [];
  for (const [index, reference] of value.entries()) {
    const pointer = `/selectedBundles/${index}`;
    if (
      diagnostics.object(
        reference,
        pointer,
        ["id", "version", "digest"],
        ["id", "version", "digest"],
      ) &&
      isRecord(reference)
    ) {
      diagnostics.string(reference["id"], `${pointer}/id`, {
        min: 1,
        max: 80,
        pattern: BUNDLE_ID_PATTERN,
      });
      diagnostics.string(reference["version"], `${pointer}/version`, {
        min: 5,
        max: 80,
        pattern: SEMVER_PATTERN,
      });
      diagnostics.sha(reference["digest"], `${pointer}/digest`);
      keys.push(
        `${String(reference["id"])}\u{0}${String(reference["version"])}\u{0}${String(reference["digest"])}`,
      );
    }
  }
  assertSortedUnique(keys, "/selectedBundles", diagnostics);
}

function validateManifestDigest(rec: Record<string, unknown>, diagnostics: Diagnostics): void {
  if (typeof rec["manifestDigest"] !== "string") return;
  const { manifestDigest: _manifestDigest, ...body } = rec;
  try {
    if (sha256CanonicalJson(body) !== rec["manifestDigest"]) {
      diagnostics.add("E_MANIFEST_DIGEST", "/manifestDigest", "manifest digest mismatch");
    }
  } catch {
    diagnostics.add("E_CANONICAL_JSON", "/manifestDigest", "manifest body is not supported canonical JSON");
  }
}

function validateOutputEntries(
  entries: unknown,
  entryCount: unknown,
  diagnostics: Diagnostics,
): void {
  const paths: string[] = [];
  if (diagnostics.array(entries, "/entries", 1, 4096) && Array.isArray(entries)) {
    for (const [index, entry] of entries.entries()) {
      const rowPath = validateOutputEntry(entry, `/entries/${index}`, diagnostics);
      if (rowPath !== null) paths.push(rowPath);
    }
    assertSortedUnique(paths, "/entries", diagnostics);
  }
  if (Number.isInteger(entryCount) && entryCount !== paths.length) {
    diagnostics.add("E_ENTRY_COUNT", "/entryCount", "entryCount does not match entries");
  }
}

export function validateMaterializerOutputManifestV2(
  value: unknown,
): ValidationResult<MaterializerOutputManifest> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId", "schemaVersion", "schemaDigest", "contractId", "digestAlgorithm",
    "manifestDigest", "releaseDigest", "releasePayloadDigest", "payloadDigestAlgorithm",
    "outputPayloadDigest", "entryCount", "selectedBundles", "migrationRefs", "entries",
  ];
  if (!diagnostics.object(value, "", fields, fields) || !isRecord(value)) {
    return finish<MaterializerOutputManifest>(undefined, diagnostics);
  }
  const rec = value;
  schemaIdentity(rec, SCHEMA_IDS.materializerOutputManifest, SCHEMA_DIGESTS.materializerOutputManifest, diagnostics);
  diagnostics.string(rec["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(rec["digestAlgorithm"], "/digestAlgorithm", { constant: ENVELOPE_DIGEST_ALGORITHM });
  diagnostics.sha(rec["manifestDigest"], "/manifestDigest");
  diagnostics.sha(rec["releaseDigest"], "/releaseDigest");
  diagnostics.sha(rec["releasePayloadDigest"], "/releasePayloadDigest");
  diagnostics.string(rec["payloadDigestAlgorithm"], "/payloadDigestAlgorithm", {
    constant: PAYLOAD_DIGEST_ALGORITHM,
  });
  diagnostics.sha(rec["outputPayloadDigest"], "/outputPayloadDigest");
  if (!Number.isInteger(rec["entryCount"]) || Number(rec["entryCount"]) < 1) {
    diagnostics.add("E_COUNT", "/entryCount", "entryCount must be a positive integer");
  }
  validateOutputSelectedBundles(rec["selectedBundles"], diagnostics);
  diagnostics.array(rec["migrationRefs"], "/migrationRefs", 0, 0);
  validateOutputEntries(rec["entries"], rec["entryCount"], diagnostics);
  validateManifestDigest(rec, diagnostics);
  return finish(value as unknown as MaterializerOutputManifest, diagnostics);
}

function validateArtifactToolchain(toolchain: unknown, diagnostics: Diagnostics): void {
  if (!(diagnostics.object(
      toolchain,
      "/toolchain",
      ["typescript", "nodeCompatibility", "packageManager"],
      ["typescript", "nodeCompatibility", "packageManager"],
    ) &&
    isRecord(toolchain))) {
  	return;
  }

  diagnostics.string(toolchain["typescript"], "/toolchain/typescript", {
    constant: "7.0.2",
  });
  diagnostics.string(
    toolchain["nodeCompatibility"],
    "/toolchain/nodeCompatibility",
    { constant: ">=24.16.0 <25" },
  );
  diagnostics.string(toolchain["packageManager"], "/toolchain/packageManager", {
    constant: "pnpm@11.17.0",
  });
}

function validateArtifactSchemas(schemas: unknown, diagnostics: Diagnostics): void {
  if (!diagnostics.array(schemas, "/schemas", 9, 9) || !Array.isArray(schemas)) return;
  const rows: SchemaClosureRow[] = [];
  for (const [index, row] of schemas.entries()) {
    const pointer = `/schemas/${index}`;
    const schemaFields = ["id", "version", "path", "kind", "mode", "sha256", "bytes"];
    if (!diagnostics.object(row, pointer, schemaFields, schemaFields) || !isRecord(row)) continue;
    diagnostics.string(row["id"], `${pointer}/id`, {
      min: 1,
      max: 240,
      pattern: /^https:\/\/schemas\.repo-template\.dev\//,
    });
    diagnostics.string(row["version"], `${pointer}/version`, {
      constant: CONTRACT_VERSION,
    });
    const fileRow = {
      path: row["path"], kind: row["kind"], mode: row["mode"],
      sha256: row["sha256"], bytes: row["bytes"],
    };
    if (validateFileRow(fileRow, pointer, diagnostics)) {
      if (row["mode"] === "100755") {
        diagnostics.add("E_MODE", `${pointer}/mode`, "schema files must use mode 100644");
      }
      const schemaBytes = Number(row["bytes"]);
      if (Number.isSafeInteger(schemaBytes) && (schemaBytes < 1 || schemaBytes > 1_048_576)) {
        diagnostics.add("E_COUNT", `${pointer}/bytes`, "schema bytes must be 1-1048576");
      }
      rows.push(row as unknown as SchemaClosureRow);
    }
  }
  assertSortedUnique(rows.map((row) => row.path), "/schemas", diagnostics);
}

export function validateArtifactManifestV2(
  value: unknown,
): ValidationResult<ArtifactManifest> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId", "schemaVersion", "schemaDigest", "contractId", "contractVersion",
    "digestAlgorithm", "manifestDigest", "artifactDigestAlgorithm", "artifactDigest",
    "toolchain", "entrypoint", "validatorExport", "runtimeDependencyCount",
    "releaseReceiptKind", "sources", "schemas", "emitted", "fixtures", "goldens",
  ];
  if (!diagnostics.object(value, "", fields, fields) || !isRecord(value)) {
    return finish<ArtifactManifest>(undefined, diagnostics);
  }
  const rec = value;
  schemaIdentity(rec, SCHEMA_IDS.artifactManifest, SCHEMA_DIGESTS.artifactManifest, diagnostics);
  diagnostics.string(rec["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(rec["contractVersion"], "/contractVersion", { constant: CONTRACT_VERSION });
  diagnostics.string(rec["digestAlgorithm"], "/digestAlgorithm", { constant: ENVELOPE_DIGEST_ALGORITHM });
  diagnostics.sha(rec["manifestDigest"], "/manifestDigest");
  diagnostics.string(rec["artifactDigestAlgorithm"], "/artifactDigestAlgorithm", {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(rec["artifactDigest"], "/artifactDigest");
  validateArtifactToolchain(rec["toolchain"], diagnostics);
  diagnostics.string(rec["entrypoint"], "/entrypoint", { constant: "index.js" });
  diagnostics.string(rec["validatorExport"], "/validatorExport", { constant: "validateMaterializerInputV2" });
  if (rec["runtimeDependencyCount"] !== 0) {
    diagnostics.add("E_CONST", "/runtimeDependencyCount", "must equal 0");
  }
  diagnostics.string(rec["releaseReceiptKind"], "/releaseReceiptKind", { constant: RELEASE_RECEIPT_KIND });
  validateFileRows(rec["sources"], "/sources", diagnostics);
  validateFileRows(rec["emitted"], "/emitted", diagnostics);
  validateFileRows(rec["fixtures"], "/fixtures", diagnostics);
  validateFileRows(rec["goldens"], "/goldens", diagnostics);
  validateArtifactSchemas(rec["schemas"], diagnostics);
  if (typeof rec["manifestDigest"] === "string") {
    const { manifestDigest: _manifestDigest, ...body } = rec;
    try {
      if (sha256CanonicalJson(body) !== rec["manifestDigest"]) {
        diagnostics.add("E_MANIFEST_DIGEST", "/manifestDigest", "manifest digest mismatch");
      }
    } catch {
      diagnostics.add("E_CANONICAL_JSON", "/manifestDigest", "manifest body is not supported canonical JSON");
    }
  }
  return finish(value as unknown as ArtifactManifest, diagnostics);
}

export function validateVerificationReceiptV2(
  value: unknown,
): ValidationResult<VerificationReceipt> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId",
    "schemaVersion",
    "schemaDigest",
    "contractId",
    "receiptKind",
    "digestAlgorithm",
    "receiptDigest",
    "artifactDigest",
    "inputDigest",
    "outputManifestDigest",
    "outputPayloadDigest",
    "independentRunCount",
    "result",
  ];
  if (!diagnostics.object(value, "", fields, fields) || !isRecord(value)) {
    return finish<VerificationReceipt>(undefined, diagnostics);
  }
  schemaIdentity(
    value,
    SCHEMA_IDS.verificationReceipt,
    SCHEMA_DIGESTS.verificationReceipt,
    diagnostics,
  );
  diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(value["receiptKind"], "/receiptKind", {
    constant: "repo-template/adoption-shell-verification/v2",
  });
  diagnostics.string(value["digestAlgorithm"], "/digestAlgorithm", {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["receiptDigest"], "/receiptDigest");
  diagnostics.sha(value["artifactDigest"], "/artifactDigest");
  diagnostics.sha(value["inputDigest"], "/inputDigest");
  diagnostics.sha(value["outputManifestDigest"], "/outputManifestDigest");
  diagnostics.sha(value["outputPayloadDigest"], "/outputPayloadDigest");
  if (value["independentRunCount"] !== 2) {
    diagnostics.add("E_CONST", "/independentRunCount", "must equal 2");
  }
  diagnostics.string(value["result"], "/result", { constant: "verified" });
  if (typeof value["receiptDigest"] === "string") {
    const { receiptDigest: _receiptDigest, ...body } = value;
    try {
      if (sha256CanonicalJson(body) !== value["receiptDigest"]) {
        diagnostics.add("E_RECEIPT_DIGEST", "/receiptDigest", "receipt digest mismatch");
      }
    } catch {
      diagnostics.add(
        "E_CANONICAL_JSON",
        "/receiptDigest",
        "receipt body is not supported canonical JSON",
      );
    }
  }
  return finish(value as unknown as VerificationReceipt, diagnostics);
}
