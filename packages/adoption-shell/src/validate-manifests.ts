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
} from "./contract.js";
import { sha256CanonicalJson } from "./digest.js";
import { isIssueTemplateOverride, portablePathFailure } from "./path-policy.js";
import {
  assertSortedUnique,
  BUNDLE_ID_PATTERN,
  Diagnostics,
  SEMVER_PATTERN,
} from "./validation-helpers.js";

const ENTRY_ROLES = new Set([
  "generic-base-text",
  "generic-base-binary",
  "capability-executable",
  "capability-config",
  "capability-fixture",
  "capability-golden",
]);

function finish<T>(value: T, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
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
  return failure === null && !isIssueTemplateOverride(value);
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
  value.forEach((row, index) => {
    if (validateFileRow(row, `${pointer}/${index}`, diagnostics)) rows.push(row);
  });
  assertSortedUnique(rows.map((row) => row.path), pointer, diagnostics);
  return rows;
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
  if (
    diagnostics.string(value["encoding"], `${pointer}/encoding`) &&
    value["encoding"] !== "utf-8" &&
    value["encoding"] !== "binary"
  ) {
    diagnostics.add("E_ENCODING", `${pointer}/encoding`, "unsupported encoding");
  }
  const generic =
    value["role"] === "generic-base-text" || value["role"] === "generic-base-binary";
  if (generic ? value["bundleId"] !== null : typeof value["bundleId"] !== "string") {
    diagnostics.add(
      "E_BUNDLE_OWNERSHIP",
      `${pointer}/bundleId`,
      "bundleId does not agree with the entry role",
    );
  }
  const expectedEncoding =
    value["role"] === "generic-base-binary" ? "binary" : "utf-8";
  if (ENTRY_ROLES.has(String(value["role"])) && value["encoding"] !== expectedEncoding) {
    diagnostics.add(
      "E_ENCODING_ROLE",
      `${pointer}/encoding`,
      `${String(value["role"])} requires ${expectedEncoding}`,
    );
  }
  return pathValid ? value["path"] as string : null;
}

export function validateMaterializerOutputManifestV2(
  value: unknown,
): ValidationResult<MaterializerOutputManifest> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId",
    "schemaVersion",
    "schemaDigest",
    "contractId",
    "digestAlgorithm",
    "manifestDigest",
    "releaseDigest",
    "releasePayloadDigest",
    "payloadDigestAlgorithm",
    "outputPayloadDigest",
    "entryCount",
    "selectedBundles",
    "migrationRefs",
    "entries",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish(value as MaterializerOutputManifest, diagnostics);
  }
  schemaIdentity(
    value,
    SCHEMA_IDS.materializerOutputManifest,
    SCHEMA_DIGESTS.materializerOutputManifest,
    diagnostics,
  );
  diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(value["digestAlgorithm"], "/digestAlgorithm", {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["manifestDigest"], "/manifestDigest");
  diagnostics.sha(value["releaseDigest"], "/releaseDigest");
  diagnostics.sha(value["releasePayloadDigest"], "/releasePayloadDigest");
  diagnostics.string(value["payloadDigestAlgorithm"], "/payloadDigestAlgorithm", {
    constant: PAYLOAD_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["outputPayloadDigest"], "/outputPayloadDigest");
  if (!Number.isInteger(value["entryCount"]) || Number(value["entryCount"]) < 1) {
    diagnostics.add("E_COUNT", "/entryCount", "entryCount must be a positive integer");
  }
  if (diagnostics.array(value["selectedBundles"], "/selectedBundles", 0, 256)) {
    const keys: string[] = [];
    value["selectedBundles"].forEach((reference, index) => {
      const pointer = `/selectedBundles/${index}`;
      if (
        diagnostics.object(
          reference,
          pointer,
          ["id", "version", "digest"],
          ["id", "version", "digest"],
        )
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
          `${String(reference["id"])}\u0000${String(reference["version"])}\u0000${String(reference["digest"])}`,
        );
      }
    });
    assertSortedUnique(keys, "/selectedBundles", diagnostics);
  }
  diagnostics.array(value["migrationRefs"], "/migrationRefs", 0, 0);
  const paths: string[] = [];
  if (diagnostics.array(value["entries"], "/entries", 1, 4096)) {
    value["entries"].forEach((entry, index) => {
      const rowPath = validateOutputEntry(entry, `/entries/${index}`, diagnostics);
      if (rowPath !== null) paths.push(rowPath);
    });
    assertSortedUnique(paths, "/entries", diagnostics);
  }
  if (Number.isInteger(value["entryCount"]) && value["entryCount"] !== paths.length) {
    diagnostics.add("E_ENTRY_COUNT", "/entryCount", "entryCount does not match entries");
  }
  if (typeof value["manifestDigest"] === "string") {
    const { manifestDigest: _manifestDigest, ...body } = value;
    if (sha256CanonicalJson(body) !== value["manifestDigest"]) {
      diagnostics.add("E_MANIFEST_DIGEST", "/manifestDigest", "manifest digest mismatch");
    }
  }
  return finish(value as unknown as MaterializerOutputManifest, diagnostics);
}

export function validateArtifactManifestV2(
  value: unknown,
): ValidationResult<ArtifactManifest> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId",
    "schemaVersion",
    "schemaDigest",
    "contractId",
    "contractVersion",
    "digestAlgorithm",
    "manifestDigest",
    "artifactDigestAlgorithm",
    "artifactDigest",
    "toolchain",
    "entrypoint",
    "validatorExport",
    "runtimeDependencyCount",
    "releaseReceiptKind",
    "sources",
    "schemas",
    "emitted",
    "fixtures",
    "goldens",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish(value as ArtifactManifest, diagnostics);
  }
  schemaIdentity(
    value,
    SCHEMA_IDS.artifactManifest,
    SCHEMA_DIGESTS.artifactManifest,
    diagnostics,
  );
  diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(value["contractVersion"], "/contractVersion", {
    constant: CONTRACT_VERSION,
  });
  diagnostics.string(value["digestAlgorithm"], "/digestAlgorithm", {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["manifestDigest"], "/manifestDigest");
  diagnostics.string(value["artifactDigestAlgorithm"], "/artifactDigestAlgorithm", {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["artifactDigest"], "/artifactDigest");
  if (
    diagnostics.object(
      value["toolchain"],
      "/toolchain",
      ["typescript", "nodeCompatibility", "packageManager"],
      ["typescript", "nodeCompatibility", "packageManager"],
    )
  ) {
    diagnostics.string(value["toolchain"]["typescript"], "/toolchain/typescript", {
      constant: "7.0.2",
    });
    diagnostics.string(
      value["toolchain"]["nodeCompatibility"],
      "/toolchain/nodeCompatibility",
      { constant: ">=24.16.0 <25" },
    );
    diagnostics.string(value["toolchain"]["packageManager"], "/toolchain/packageManager", {
      constant: "pnpm@11.17.0",
    });
  }
  diagnostics.string(value["entrypoint"], "/entrypoint", { constant: "index.js" });
  diagnostics.string(value["validatorExport"], "/validatorExport", {
    constant: "validateMaterializerInputV2",
  });
  if (value["runtimeDependencyCount"] !== 0) {
    diagnostics.add("E_CONST", "/runtimeDependencyCount", "must equal 0");
  }
  diagnostics.string(value["releaseReceiptKind"], "/releaseReceiptKind", {
    constant: RELEASE_RECEIPT_KIND,
  });
  validateFileRows(value["sources"], "/sources", diagnostics);
  validateFileRows(value["emitted"], "/emitted", diagnostics);
  validateFileRows(value["fixtures"], "/fixtures", diagnostics);
  validateFileRows(value["goldens"], "/goldens", diagnostics);
  if (diagnostics.array(value["schemas"], "/schemas", 6, 6)) {
    const rows: SchemaClosureRow[] = [];
    value["schemas"].forEach((row, index) => {
      const pointer = `/schemas/${index}`;
      const schemaFields = ["id", "version", "path", "kind", "mode", "sha256", "bytes"];
      if (!diagnostics.object(row, pointer, schemaFields, schemaFields)) return;
      diagnostics.string(row["id"], `${pointer}/id`, {
        min: 1,
        max: 240,
        pattern: /^https:\/\/schemas\.repo-template\.dev\//,
      });
      diagnostics.string(row["version"], `${pointer}/version`, {
        constant: CONTRACT_VERSION,
      });
      if (validateFileRow(
        {
          path: row["path"],
          kind: row["kind"],
          mode: row["mode"],
          sha256: row["sha256"],
          bytes: row["bytes"],
        },
        pointer,
        diagnostics,
      )) {
        rows.push(row as unknown as SchemaClosureRow);
      }
    });
    assertSortedUnique(rows.map((row) => row.path), "/schemas", diagnostics);
  }
  if (typeof value["manifestDigest"] === "string") {
    const { manifestDigest: _manifestDigest, ...body } = value;
    if (sha256CanonicalJson(body) !== value["manifestDigest"]) {
      diagnostics.add("E_MANIFEST_DIGEST", "/manifestDigest", "manifest digest mismatch");
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
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish(value as VerificationReceipt, diagnostics);
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
    if (sha256CanonicalJson(body) !== value["receiptDigest"]) {
      diagnostics.add("E_RECEIPT_DIGEST", "/receiptDigest", "receipt digest mismatch");
    }
  }
  return finish(value as unknown as VerificationReceipt, diagnostics);
}
