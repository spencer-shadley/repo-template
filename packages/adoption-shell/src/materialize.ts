import {
  AdoptionShellValidationError,
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type Diagnostic,
  type MaterializationResult,
  type MaterializerInput,
  type MaterializerOutputManifest,
  type OutputManifestEntry,
  type PayloadEntry,
} from "./contract.js";
import { resolveCapabilityClosure } from "./capability-bundles.js";
import { sha256CanonicalJson, sha256PayloadEntries } from "./digest.js";
import {
  mergeDiagnostics,
  validateDocumentationLinks,
  validateMaterializerInputV2,
} from "./validate.js";
import { compareStrings } from "./validation-helpers.js";

function selectedEntryDiagnostics(
  input: MaterializerInput,
  selectedBundleIds: ReadonlySet<string>,
  selectedDeclaredPaths: ReadonlyMap<string, ReadonlySet<string>>,
): readonly Diagnostic[] {
  const rows: Diagnostic[] = [];
  const knownBundleIds = new Set(input.capabilities.bundles.map((bundle) => bundle.id));
  for (const entry of input.release.entries) {
    if (entry.bundleId === null) continue;
    if (!knownBundleIds.has(entry.bundleId)) {
      rows.push({
        code: "E_UNOWNED_ENTRY",
        pointer: `/release/entries/${entry.path}`,
        message: "capability entry names no authenticated bundle",
      });
      continue;
    }
    if (
      selectedBundleIds.has(entry.bundleId) &&
      !selectedDeclaredPaths.get(entry.bundleId)?.has(entry.path)
    ) {
      rows.push({
        code: "E_UNOWNED_ENTRY",
        pointer: `/release/entries/${entry.path}`,
        message: "selected capability does not declare this entry",
      });
    }
  }
  return rows.sort((left, right) =>
    compareStrings(left.pointer, right.pointer) ||
    compareStrings(left.code, right.code),
  );
}

function cloneEntry(entry: PayloadEntry): PayloadEntry {
  return Object.freeze({
    path: entry.path,
    kind: entry.kind,
    mode: entry.mode,
    contentSha256: entry.contentSha256,
    role: entry.role,
    encoding: entry.encoding,
    bundleId: entry.bundleId,
    contentBase64: entry.contentBase64,
  });
}

function manifestEntry(entry: PayloadEntry): OutputManifestEntry {
  return Object.freeze({
    path: entry.path,
    kind: entry.kind,
    mode: entry.mode,
    contentSha256: entry.contentSha256,
    role: entry.role,
    encoding: entry.encoding,
    bundleId: entry.bundleId,
  });
}

export function materializeAdoptionShellV2(inputValue: unknown): MaterializationResult {
  const validation = validateMaterializerInputV2(inputValue);
  if (!validation.ok) {
    throw new AdoptionShellValidationError(validation.diagnostics);
  }
  const input = validation.value;
  const closure = resolveCapabilityClosure(
    input.capabilities,
    input.requestedBundles,
    input.release.entries,
  );
  const bundleIds = new Set(closure.bundles.map((bundle) => bundle.id));
  const declaredPaths = new Map(
    closure.bundles.map((bundle) => [
      bundle.id,
      new Set([...bundle.artifacts, ...bundle.fixtures, ...bundle.goldens]),
    ]),
  );
  const ownership = selectedEntryDiagnostics(input, bundleIds, declaredPaths);
  const selected = input.release.entries
    .filter((entry) => entry.bundleId === null || bundleIds.has(entry.bundleId))
    .map(cloneEntry)
    .sort((left, right) => compareStrings(left.path, right.path));
  const documentation = validateDocumentationLinks(selected);
  const diagnostics = mergeDiagnostics(closure.diagnostics, ownership, documentation);
  if (diagnostics.length > 0) {
    throw new AdoptionShellValidationError(diagnostics);
  }

  const selectedBundles = Object.freeze(
    closure.bundles.map((bundle) =>
      Object.freeze({
        id: bundle.id,
        version: bundle.version,
        digest: bundle.digest,
      }),
    ),
  );
  const entries = Object.freeze(selected);
  const manifestEntries = Object.freeze(selected.map(manifestEntry));
  const migrationRefs = Object.freeze([]) as readonly [];
  const manifestBody = {
    schemaId: SCHEMA_IDS.materializerOutputManifest,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.materializerOutputManifest,
    contractId: CONTRACT_ID,
    digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    releaseDigest: input.release.releaseDigest,
    releasePayloadDigest: input.release.payloadDigest,
    payloadDigestAlgorithm: PAYLOAD_DIGEST_ALGORITHM,
    outputPayloadDigest: sha256PayloadEntries(entries),
    entryCount: entries.length,
    selectedBundles,
    migrationRefs,
    entries: manifestEntries,
  };
  const manifest: MaterializerOutputManifest = Object.freeze({
    ...manifestBody,
    manifestDigest: sha256CanonicalJson(manifestBody),
  });
  return Object.freeze({ entries, manifest });
}
