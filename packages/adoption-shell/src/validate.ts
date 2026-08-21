import {
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type BundleReference,
  type MaterializerInput,
  type PayloadEntry,
  type ReleasePayloadSet,
  type ValidationResult,
} from "./contract.ts";
import {
  decodeCanonicalBase64,
  sha256Bytes,
  sha256CanonicalJson,
  sha256PayloadEntries,
} from "./digest.ts";
import { validateCapabilityBundleRegistryV2 } from "./capability-bundles.ts";
import {
  isIssueTemplateOverride,
  isPreCustodyWorkflow,
  portablePathFailure,
} from "./path-policy.ts";
import {
  assertSortedUnique,
  BUNDLE_ID_PATTERN,
  Diagnostics,
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
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function schemaIdentity(
  record: Record<string, unknown>,
  pointer: string,
  expectedId: string,
  expectedDigest: string,
  diagnostics: Diagnostics,
): void {
  diagnostics.string(record["schemaId"], `${pointer}/schemaId`, {
    constant: expectedId,
  });
  diagnostics.string(record["schemaVersion"], `${pointer}/schemaVersion`, {
    constant: CONTRACT_VERSION,
  });
  if (
    diagnostics.sha(record["schemaDigest"], `${pointer}/schemaDigest`) &&
    record["schemaDigest"] !== expectedDigest
  ) {
    diagnostics.add(
      "E_SCHEMA_DIGEST",
      `${pointer}/schemaDigest`,
      "schema digest does not match the committed contract",
    );
  }
}

function validatePath(
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

function validateBundleReference(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is BundleReference {
  if (
    !diagnostics.object(
      value,
      pointer,
      ["id", "version", "digest"],
      ["id", "version", "digest"],
    )
  ) {
    return false;
  }
  diagnostics.string(value["id"], `${pointer}/id`, {
    min: 1,
    max: 80,
    pattern: BUNDLE_ID_PATTERN,
  });
  diagnostics.string(value["version"], `${pointer}/version`, {
    min: 5,
    max: 80,
    pattern: SEMVER_PATTERN,
  });
  diagnostics.sha(value["digest"], `${pointer}/digest`);
  return true;
}

function validatePayloadEntryEncoding(
  role: unknown,
  encoding: unknown,
  bundleId: unknown,
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

function validatePayloadEntryContent(
  contentBase64: unknown,
  contentSha256: unknown,
  role: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (!diagnostics.string(contentBase64, `${pointer}/contentBase64`)) return;
  const expectedEncoding = role === "generic-base-binary" ? "binary" : "utf-8";
  try {
    const bytes = decodeCanonicalBase64(contentBase64);
    if (
      typeof contentSha256 === "string" &&
      sha256Bytes(bytes) !== contentSha256
    ) {
      diagnostics.add(
        "E_CONTENT_DIGEST",
        `${pointer}/contentSha256`,
        "content digest does not match decoded bytes",
      );
    }
    if (expectedEncoding === "utf-8") {
      try {
        UTF8_DECODER.decode(bytes);
      } catch {
        diagnostics.add(
          "E_UTF8",
          `${pointer}/contentBase64`,
          "text role content must be valid UTF-8",
        );
      }
    }
  } catch {
    diagnostics.add(
      "E_BASE64",
      `${pointer}/contentBase64`,
      "content must use canonical padded base64",
    );
  }
}

function validatePayloadEntry(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is PayloadEntry {
  const fields = [
    "path", "kind", "mode", "contentSha256", "role", "encoding", "bundleId", "contentBase64",
  ];
  if (!diagnostics.object(value, pointer, fields, fields)) {
    return false;
  }
  const rec = value;
  const pathValid = validatePath(rec["path"], `${pointer}/path`, diagnostics);
  diagnostics.string(rec["kind"], `${pointer}/kind`, { constant: "file" });
  if (
    diagnostics.string(rec["mode"], `${pointer}/mode`) &&
    rec["mode"] !== "100644" &&
    rec["mode"] !== "100755"
  ) {
    diagnostics.add("E_MODE", `${pointer}/mode`, "mode must be 100644 or 100755");
  }
  diagnostics.sha(rec["contentSha256"], `${pointer}/contentSha256`);
  if (
    diagnostics.string(rec["role"], `${pointer}/role`) &&
    !ENTRY_ROLES.has(rec["role"])
  ) {
    diagnostics.add("E_ROLE", `${pointer}/role`, "unsupported payload role");
  }
  validatePayloadEntryEncoding(rec["role"], rec["encoding"], rec["bundleId"], pointer, diagnostics);
  validatePayloadEntryContent(rec["contentBase64"], rec["contentSha256"], rec["role"], pointer, diagnostics);
  return (
    pathValid &&
    typeof rec["kind"] === "string" &&
    typeof rec["mode"] === "string" &&
    typeof rec["contentSha256"] === "string" &&
    typeof rec["role"] === "string" &&
    typeof rec["encoding"] === "string" &&
    (rec["bundleId"] === null || typeof rec["bundleId"] === "string") &&
    typeof rec["contentBase64"] === "string"
  );
}

function finish<T>(value: T | undefined, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: rows };
}

function validateReleaseEntries(
  entriesValue: unknown,
  diagnostics: Diagnostics,
): PayloadEntry[] {
  const entries: PayloadEntry[] = [];
  if (!diagnostics.array(entriesValue, "/entries", 1, 4096)) return entries;
  for (const [index, entry] of (entriesValue).entries()) {
    if (validatePayloadEntry(entry, `/entries/${index}`, diagnostics)) entries.push(entry);
  }
  const paths = entries.map((entry) => entry.path);
  assertSortedUnique(paths, "/entries", diagnostics);
  const folded = new Map<string, string>();
  for (const [index, entry] of entries.entries()) {
    const key = entry.path.toLowerCase();
    const prior = folded.get(key);
    if (prior !== undefined && prior !== entry.path) {
      diagnostics.add(
        "E_PATH_CASE_COLLISION",
        `/entries/${index}/path`,
        `case-fold collision with ${prior}`,
      );
    } else {
      folded.set(key, entry.path);
    }
  }
  return entries;
}

export function validateReleasePayloadSetV2(value: unknown): ValidationResult<ReleasePayloadSet> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId", "schemaVersion", "schemaDigest", "contractId", "digestAlgorithm",
    "payloadDigestAlgorithm", "releaseDigest", "payloadDigest", "entryCount",
    "migrationRefs", "entries",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish<ReleasePayloadSet>(undefined, diagnostics);
  }
  const rec = value;
  schemaIdentity(rec, "", SCHEMA_IDS.releasePayloadSet, SCHEMA_DIGESTS.releasePayloadSet, diagnostics);
  diagnostics.string(rec["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(rec["digestAlgorithm"], "/digestAlgorithm", { constant: ENVELOPE_DIGEST_ALGORITHM });
  diagnostics.string(rec["payloadDigestAlgorithm"], "/payloadDigestAlgorithm", {
    constant: PAYLOAD_DIGEST_ALGORITHM,
  });
  diagnostics.sha(rec["releaseDigest"], "/releaseDigest");
  diagnostics.sha(rec["payloadDigest"], "/payloadDigest");
  if (!Number.isInteger(rec["entryCount"]) || Number(rec["entryCount"]) < 1) {
    diagnostics.add("E_COUNT", "/entryCount", "entryCount must be a positive integer");
  }
  diagnostics.array(rec["migrationRefs"], "/migrationRefs", 0, 0);
  const entries = validateReleaseEntries(rec["entries"], diagnostics);
  if (Number.isInteger(rec["entryCount"]) && rec["entryCount"] !== entries.length) {
    diagnostics.add("E_ENTRY_COUNT", "/entryCount", "entryCount does not match entries");
  }
  if (typeof rec["payloadDigest"] === "string" && entries.length > 0) {
    try {
      if (sha256PayloadEntries(entries) !== rec["payloadDigest"]) {
        diagnostics.add("E_PAYLOAD_DIGEST", "/payloadDigest", "payload digest mismatch");
      }
    } catch {
      // Entry-level diagnostics already identify malformed content.
    }
  }
  if (typeof rec["releaseDigest"] === "string") {
    const { releaseDigest: _releaseDigest, ...body } = rec;
    try {
      if (sha256CanonicalJson(body) !== rec["releaseDigest"]) {
        diagnostics.add("E_RELEASE_DIGEST", "/releaseDigest", "release digest mismatch");
      }
    } catch {
      diagnostics.add("E_CANONICAL_JSON", "/releaseDigest", "release body is not supported canonical JSON");
    }
  }
  return finish(value as unknown as ReleasePayloadSet, diagnostics);
}

function validateConformance(conformance: unknown, diagnostics: Diagnostics): void {
  const fields = ["noLocalIssueTemplateOverride", "noPreCustodyWorkflows"];
  if (diagnostics.object(conformance, "/conformance", fields, fields)) {
    const confRec = conformance;
    if (confRec["noLocalIssueTemplateOverride"] !== true) {
      diagnostics.add("E_CONST", "/conformance/noLocalIssueTemplateOverride", "must be true");
    }
    if (confRec["noPreCustodyWorkflows"] !== true) {
      diagnostics.add("E_CONST", "/conformance/noPreCustodyWorkflows", "must be true");
    }
  }
}

export function validateMaterializerInputV2(value: unknown): ValidationResult<MaterializerInput> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId", "schemaVersion", "schemaDigest", "contractId", "release",
    "capabilities", "requestedBundles", "conformance",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish<MaterializerInput>(undefined, diagnostics);
  }
  const rec = value;
  schemaIdentity(rec, "", SCHEMA_IDS.materializerInput, SCHEMA_DIGESTS.materializerInput, diagnostics);
  diagnostics.string(rec["contractId"], "/contractId", { constant: CONTRACT_ID });
  const releaseResult = validateReleasePayloadSetV2(rec["release"]);
  if (!releaseResult.ok) {
    for (const row of releaseResult.diagnostics) {
      diagnostics.add(row.code, `/release${row.pointer}`, row.message);
    }
  }
  const registryResult = validateCapabilityBundleRegistryV2(rec["capabilities"]);
  if (!registryResult.ok) {
    for (const row of registryResult.diagnostics) {
      diagnostics.add(row.code, `/capabilities${row.pointer}`, row.message);
    }
  }
  if (diagnostics.array(rec["requestedBundles"], "/requestedBundles", 0, 256)) {
    const keys: string[] = [];
    for (const [index, reference] of (rec["requestedBundles"]).entries()) {
      if (validateBundleReference(reference, `/requestedBundles/${index}`, diagnostics)) {
        keys.push(`${reference.id}\u{0}${reference.version}\u{0}${reference.digest}`);
      }
    }
    assertSortedUnique(keys, "/requestedBundles", diagnostics);
  }
  validateConformance(rec["conformance"], diagnostics);
  return finish(value as unknown as MaterializerInput, diagnostics);
}
