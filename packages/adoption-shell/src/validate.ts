import {
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type BundleReference,
  type Diagnostic,
  type MaterializerInput,
  type PayloadEntry,
  type ReleasePayloadSet,
  type ValidationResult,
} from "./contract.js";
import {
  decodeCanonicalBase64,
  sha256Bytes,
  sha256CanonicalJson,
  sha256PayloadEntries,
} from "./digest.js";
import { validateCapabilityBundleRegistryV2 } from "./capability-bundles.js";
import {
  isIssueTemplateOverride,
  portablePathFailure,
  resolvePayloadLink,
} from "./path-policy.js";
import {
  assertSortedUnique,
  BUNDLE_ID_PATTERN,
  compareStrings,
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
  return failure === null && !isIssueTemplateOverride(value);
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

function validatePayloadEntry(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is PayloadEntry {
  if (
    !diagnostics.object(
      value,
      pointer,
      [
        "path",
        "kind",
        "mode",
        "contentSha256",
        "role",
        "encoding",
        "bundleId",
        "contentBase64",
      ],
      [
        "path",
        "kind",
        "mode",
        "contentSha256",
        "role",
        "encoding",
        "bundleId",
        "contentBase64",
      ],
    )
  ) {
    return false;
  }
  validatePath(value["path"], `${pointer}/path`, diagnostics);
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
  if (generic) {
    if (value["bundleId"] !== null) {
      diagnostics.add(
        "E_BUNDLE_OWNERSHIP",
        `${pointer}/bundleId`,
        "generic base entries must use null bundleId",
      );
    }
  } else {
    diagnostics.string(value["bundleId"], `${pointer}/bundleId`, {
      min: 1,
      max: 80,
      pattern: BUNDLE_ID_PATTERN,
    });
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
  if (diagnostics.string(value["contentBase64"], `${pointer}/contentBase64`)) {
    try {
      const bytes = decodeCanonicalBase64(value["contentBase64"]);
      if (
        typeof value["contentSha256"] === "string" &&
        sha256Bytes(bytes) !== value["contentSha256"]
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
  return true;
}

function finish<T>(value: T, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
}

export function validateReleasePayloadSetV2(value: unknown): ValidationResult<ReleasePayloadSet> {
  const diagnostics = new Diagnostics();
  if (
    !diagnostics.object(
      value,
      "",
      [
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "contractId",
        "digestAlgorithm",
        "payloadDigestAlgorithm",
        "releaseDigest",
        "payloadDigest",
        "entryCount",
        "migrationRefs",
        "entries",
      ],
      [
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "contractId",
        "digestAlgorithm",
        "payloadDigestAlgorithm",
        "releaseDigest",
        "payloadDigest",
        "entryCount",
        "migrationRefs",
        "entries",
      ],
    )
  ) {
    return finish(value as ReleasePayloadSet, diagnostics);
  }
  schemaIdentity(value, "", SCHEMA_IDS.releasePayloadSet, SCHEMA_DIGESTS.releasePayloadSet, diagnostics);
  diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(value["digestAlgorithm"], "/digestAlgorithm", {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.string(value["payloadDigestAlgorithm"], "/payloadDigestAlgorithm", {
    constant: PAYLOAD_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["releaseDigest"], "/releaseDigest");
  diagnostics.sha(value["payloadDigest"], "/payloadDigest");
  if (!Number.isInteger(value["entryCount"]) || Number(value["entryCount"]) < 1) {
    diagnostics.add("E_COUNT", "/entryCount", "entryCount must be a positive integer");
  }
  if (!diagnostics.array(value["migrationRefs"], "/migrationRefs", 0, 0)) {
    // Type diagnostic already added.
  }
  const entries: PayloadEntry[] = [];
  if (diagnostics.array(value["entries"], "/entries", 1, 4096)) {
    value["entries"].forEach((entry, index) => {
      if (validatePayloadEntry(entry, `/entries/${index}`, diagnostics)) entries.push(entry);
    });
    const paths = entries.map((entry) => entry.path);
    assertSortedUnique(paths, "/entries", diagnostics);
    const folded = new Map<string, string>();
    entries.forEach((entry, index) => {
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
    });
  }
  if (Number.isInteger(value["entryCount"]) && value["entryCount"] !== entries.length) {
    diagnostics.add("E_ENTRY_COUNT", "/entryCount", "entryCount does not match entries");
  }
  if (typeof value["payloadDigest"] === "string" && entries.length > 0) {
    try {
      if (sha256PayloadEntries(entries) !== value["payloadDigest"]) {
        diagnostics.add("E_PAYLOAD_DIGEST", "/payloadDigest", "payload digest mismatch");
      }
    } catch {
      // Entry-level diagnostics already identify malformed content.
    }
  }
  if (typeof value["releaseDigest"] === "string") {
    const { releaseDigest: _releaseDigest, ...body } = value;
    if (sha256CanonicalJson(body) !== value["releaseDigest"]) {
      diagnostics.add("E_RELEASE_DIGEST", "/releaseDigest", "release digest mismatch");
    }
  }
  return finish(value as unknown as ReleasePayloadSet, diagnostics);
}

export function validateMaterializerInputV2(value: unknown): ValidationResult<MaterializerInput> {
  const diagnostics = new Diagnostics();
  if (
    !diagnostics.object(
      value,
      "",
      [
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "contractId",
        "release",
        "capabilities",
        "requestedBundles",
        "conformance",
      ],
      [
        "schemaId",
        "schemaVersion",
        "schemaDigest",
        "contractId",
        "release",
        "capabilities",
        "requestedBundles",
        "conformance",
      ],
    )
  ) {
    return finish(value as MaterializerInput, diagnostics);
  }
  schemaIdentity(
    value,
    "",
    SCHEMA_IDS.materializerInput,
    SCHEMA_DIGESTS.materializerInput,
    diagnostics,
  );
  diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
  const releaseResult = validateReleasePayloadSetV2(value["release"]);
  if (!releaseResult.ok) {
    for (const row of releaseResult.diagnostics) {
      diagnostics.add(row.code, `/release${row.pointer}`, row.message);
    }
  }
  const registryResult = validateCapabilityBundleRegistryV2(value["capabilities"]);
  if (!registryResult.ok) {
    for (const row of registryResult.diagnostics) {
      diagnostics.add(row.code, `/capabilities${row.pointer}`, row.message);
    }
  }
  if (diagnostics.array(value["requestedBundles"], "/requestedBundles", 0, 256)) {
    const keys: string[] = [];
    value["requestedBundles"].forEach((reference, index) => {
      if (validateBundleReference(reference, `/requestedBundles/${index}`, diagnostics)) {
        keys.push(`${reference.id}\u0000${reference.version}\u0000${reference.digest}`);
      }
    });
    assertSortedUnique(keys, "/requestedBundles", diagnostics);
  }
  if (
    diagnostics.object(
      value["conformance"],
      "/conformance",
      ["noLocalIssueTemplateOverride"],
      ["noLocalIssueTemplateOverride"],
    ) &&
    value["conformance"]["noLocalIssueTemplateOverride"] !== true
  ) {
    diagnostics.add(
      "E_CONST",
      "/conformance/noLocalIssueTemplateOverride",
      "must be true",
    );
  }
  return finish(value as unknown as MaterializerInput, diagnostics);
}

export function validateDocumentationLinks(
  entries: readonly PayloadEntry[],
): readonly Diagnostic[] {
  const diagnostics = new Diagnostics();
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    if (!entry.path.endsWith(".md") || entry.encoding !== "utf-8") continue;
    let text: string;
    try {
      text = UTF8_DECODER.decode(decodeCanonicalBase64(entry.contentBase64));
    } catch {
      continue;
    }
    if (/(?:^|[^\[])\bADR-\d{4}\b(?![^\[]*\]\()/.test(text.replace(/^# ADR-\d{4}:[^\n]*$/gm, ""))) {
      diagnostics.add(
        "E_DOC_BARE_ADR",
        `/entries/${entry.path}`,
        "ADR authority references must link the exact decision title",
      );
    }
    if (/(?:\.\.\/)+agent-orchestrator\//i.test(text)) {
      diagnostics.add(
        "E_DOC_CHECKOUT_LINK",
        `/entries/${entry.path}`,
        "fleet documentation links must not depend on checkout depth",
      );
    }
    for (const match of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      const label = match[1] ?? "";
      const link = match[2] ?? "";
      if (/^https:\/\//.test(link) || link.startsWith("#")) continue;
      const resolved = resolvePayloadLink(entry.path, link);
      if (resolved === null || !byPath.has(resolved)) {
        diagnostics.add(
          "E_DOC_LINK_MISSING",
          `/entries/${entry.path}`,
          `relative documentation link does not resolve: ${link}`,
        );
        continue;
      }
      if (/^ADR-\d{4}: /.test(label)) {
        const target = byPath.get(resolved);
        if (target?.encoding === "utf-8") {
          const targetText = UTF8_DECODER.decode(decodeCanonicalBase64(target.contentBase64));
          const heading = targetText.split(/\r?\n/, 1)[0];
          if (heading !== `# ${label}`) {
            diagnostics.add(
              "E_DOC_ADR_TITLE",
              `/entries/${entry.path}`,
              `linked ADR heading does not match ${label}`,
            );
          }
        }
      }
    }
  }
  return diagnostics.sorted();
}

export function mergeDiagnostics(...sets: readonly (readonly Diagnostic[])[]): readonly Diagnostic[] {
  return sets
    .flat()
    .sort((left, right) =>
      compareStrings(left.pointer, right.pointer) ||
      compareStrings(left.code, right.code) ||
      compareStrings(left.message, right.message),
    );
}
