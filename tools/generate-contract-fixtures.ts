import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  canonicalizeJson,
  materializeAdoptionShellV2,
  sha256Bytes,
  sha256CanonicalJson,
  sha256PayloadEntries,
  type BundleReference,
  type CapabilityBundle,
  type CapabilityBundleRegistry,
  type EntryRole,
  type MaterializerInput,
  type PayloadEntry,
  type ReleasePayloadSet,
} from "../packages/adoption-shell/src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputArgument = process.argv[2];
if (outputArgument === undefined) {
  throw new Error(
    "usage: node tools/generate-contract-fixtures.ts <output-directory> [artifact-digest]",
  );
}
const contractRoot = path.resolve(outputArgument);
const fixtureRoot = path.join(contractRoot, "fixtures");
const goldenRoot = path.join(contractRoot, "golden");

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function entry(
  portablePath: string,
  bytes: Uint8Array,
  role: EntryRole,
  bundleId: string | null,
  mode: "100644" | "100755" = "100644",
): PayloadEntry {
  return {
    path: portablePath,
    kind: "file",
    mode,
    contentSha256: sha256Bytes(bytes),
    role,
    encoding: role === "generic-base-binary" ? "binary" : "utf-8",
    bundleId,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}

function textEntry(
  portablePath: string,
  text: string,
  role: EntryRole,
  bundleId: string | null,
): PayloadEntry {
  return entry(portablePath, Buffer.from(text, "utf8"), role, bundleId);
}

function fileEntry(
  portablePath: string,
  role: EntryRole,
  bundleId: string,
): PayloadEntry {
  return entry(
    portablePath,
    fs.readFileSync(path.join(root, ...portablePath.split("/"))),
    role,
    bundleId,
  );
}

function release(entriesInput: readonly PayloadEntry[]): ReleasePayloadSet {
  const entries = [...entriesInput].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const body = {
    schemaId: SCHEMA_IDS.releasePayloadSet,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.releasePayloadSet,
    contractId: CONTRACT_ID,
    digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    payloadDigestAlgorithm: PAYLOAD_DIGEST_ALGORITHM,
    payloadDigest: sha256PayloadEntries(entries),
    entryCount: entries.length,
    migrationRefs: [] as const,
    entries,
  };
  return { ...body, releaseDigest: sha256CanonicalJson(body) };
}

function bundle(
  input: Omit<CapabilityBundle, "digest" | "digestAlgorithm">,
): CapabilityBundle {
  const body = { ...input, digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM };
  return { ...body, digest: sha256CanonicalJson(body) };
}

function registry(bundlesInput: readonly CapabilityBundle[]): CapabilityBundleRegistry {
  const bundles = [...bundlesInput].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const body = {
    schemaId: SCHEMA_IDS.capabilityBundle,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.capabilityBundle,
    contractId: CONTRACT_ID,
    digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    bundles,
  };
  return { ...body, registryDigest: sha256CanonicalJson(body) };
}

function reference(value: CapabilityBundle): BundleReference {
  return { id: value.id, version: value.version, digest: value.digest };
}

function input(
  payload: ReleasePayloadSet,
  capabilities: CapabilityBundleRegistry,
  requestedBundles: readonly BundleReference[],
): MaterializerInput {
  return {
    schemaId: SCHEMA_IDS.materializerInput,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.materializerInput,
    contractId: CONTRACT_ID,
    release: payload,
    capabilities,
    requestedBundles,
    conformance: { noLocalIssueTemplateOverride: true },
  };
}

const baseEntry = textEntry(
  "README.md",
  "# Generic shell\n\nTarget-specific setup happens after materialization.\n",
  "generic-base-text",
  null,
);
const minimalInput = input(release([baseEntry]), registry([]), []);

const alpha = bundle({
  id: "example/alpha",
  version: "1.0.0",
  dependencies: [],
  artifacts: ["features/alpha.txt"],
  fixtures: [],
  goldens: [],
  modes: [],
});
const beta = bundle({
  id: "example/beta",
  version: "1.0.0",
  dependencies: [reference(alpha)],
  artifacts: ["features/beta.txt"],
  fixtures: [],
  goldens: [],
  modes: [],
});
const multiInput = input(
  release([
    baseEntry,
    textEntry(
      "features/alpha.txt",
      "alpha\n",
      "capability-config",
      alpha.id,
    ),
    textEntry(
      "features/beta.txt",
      "beta\n",
      "capability-config",
      beta.id,
    ),
  ]),
  registry([alpha, beta]),
  [reference(beta)],
);

const lintId = "repo-template/user-surface-lint";
const lintArtifacts = [
  ".user-surface-lint.json",
  ".user-surface-lint.schema.json",
  "scripts/lint-user-surface-leaks.mjs",
];
const lintFixtures = [
  "tests/fixtures/user-surface-lint/allowlisted/config.json",
  "tests/fixtures/user-surface-lint/allowlisted/src/messages.js",
  "tests/fixtures/user-surface-lint/bad/config.json",
  "tests/fixtures/user-surface-lint/bad/src/messages.js",
  "tests/fixtures/user-surface-lint/empty/config.json",
  "tests/fixtures/user-surface-lint/good/config.json",
  "tests/fixtures/user-surface-lint/good/src/messages.js",
];
const lintBundle = bundle({
  id: lintId,
  version: "2.5.0",
  dependencies: [],
  artifacts: lintArtifacts,
  fixtures: lintFixtures,
  goldens: [],
  modes: [
    {
      id: "config",
      entrypoint: "scripts/lint-user-surface-leaks.mjs",
      requiredPaths: lintArtifacts,
    },
    {
      id: "self-test",
      entrypoint: "scripts/lint-user-surface-leaks.mjs",
      requiredPaths: ["scripts/lint-user-surface-leaks.mjs", ...lintFixtures],
    },
  ],
});
const lintRegistry = registry([lintBundle]);
const lintEntries = [
  baseEntry,
  ...lintArtifacts.map((portablePath) =>
    fileEntry(
      portablePath,
      portablePath.startsWith("scripts/")
        ? "capability-executable"
        : "capability-config",
      lintId,
    ),
  ),
  ...lintFixtures.map((portablePath) =>
    fileEntry(portablePath, "capability-fixture", lintId),
  ),
];
const lintInput = input(release(lintEntries), lintRegistry, [reference(lintBundle)]);

const unrelatedAdr = textEntry(
  "docs/adr/0003-unrelated-local-decision.md",
  "# ADR-0003: Unrelated local decision\n\nThis decision is intentionally unrelated.\n",
  "generic-base-text",
  null,
);
const falseAuthority = textEntry(
  "docs/INCIDENTS.md",
  "# Incidents\n\nPer ADR-0003, JSONL is the incident authority.\n",
  "generic-base-text",
  null,
);
const unrelatedAdrInput = input(
  release([baseEntry, falseAuthority, unrelatedAdr]),
  registry([]),
  [],
);

const invalidCases = [
  ["unknown-property", "add top-level owner", "E_UNKNOWN_PROPERTY"],
  ["absolute-root", "set first path to /rooted", "E_PATH_PORTABLE"],
  ["absolute-drive", "set first path to C:/rooted", "E_PATH_PORTABLE"],
  ["absolute-unc", "set first path to \\\\server\\share", "E_PATH_PORTABLE"],
  ["traversal", "set first path to ../escape", "E_PATH_PORTABLE"],
  ["dot-segment", "set first path to docs/./file", "E_PATH_PORTABLE"],
  ["control", "insert a control character in path", "E_PATH_PORTABLE"],
  ["trailing-dot", "set first path to docs/file.", "E_PATH_PORTABLE"],
  ["trailing-space", "set first path to docs/file ", "E_PATH_PORTABLE"],
  ["windows-reserved", "set first path to docs/CON.txt", "E_PATH_PORTABLE"],
  ["backslash", "set first path to docs\\file", "E_PATH_PORTABLE"],
  ["duplicate", "duplicate first entry", "E_DUPLICATE"],
  ["case-fold-collision", "add readme.md", "E_PATH_CASE_COLLISION"],
  ["mode", "set mode to 0644", "E_MODE"],
  ["kind", "set kind to symlink", "E_CONST"],
  ["encoding", "set text role to binary", "E_ENCODING_ROLE"],
  ["content-digest", "replace content digest", "E_CONTENT_DIGEST"],
  ["payload-digest", "replace payload digest", "E_PAYLOAD_DIGEST"],
  ["aggregate-digest", "replace release digest", "E_RELEASE_DIGEST"],
  ["missing-dependency", "remove referenced dependency bundle", "E_BUNDLE_MISSING"],
  ["missing-fixture", "remove advertised fixture entry", "E_BUNDLE_FIXTURE_MISSING"],
  ["missing-golden", "advertise an absent golden", "E_BUNDLE_GOLDEN_MISSING"],
  ["missing-mode-closure", "remove a self-test required path", "E_MODE_CLOSURE"],
  ["unowned-entry", "set capability bundleId to an unknown bundle", "E_UNOWNED_ENTRY"],
  ["issue-template", "add .github/ISSUE_TEMPLATE/task.md", "E_PATH_ISSUE_TEMPLATE"],
  ["bare-adr-authority", "use unrelated local ADR-0003 as authority", "E_DOC_BARE_ADR"],
].map(([name, mutation, expectedCode]) => ({ name, mutation, expectedCode }));

writeJson(path.join(fixtureRoot, "minimal-input.json"), minimalInput);
writeJson(path.join(fixtureRoot, "multi-bundle-input.json"), multiInput);
writeJson(path.join(fixtureRoot, "user-surface-lint-input.json"), lintInput);
writeJson(path.join(fixtureRoot, "unrelated-adr-input.json"), unrelatedAdrInput);
writeJson(path.join(fixtureRoot, "invalid-cases.json"), invalidCases);
writeJson(path.join(contractRoot, "capability-bundle-registry.json"), lintRegistry);
writeJson(path.join(goldenRoot, "user-surface-lint-modes.json"), {
  bundle: reference(lintBundle),
  modes: [
    {
      id: "config",
      invocation: "node scripts/lint-user-surface-leaks.mjs --config .user-surface-lint.json",
    },
    {
      id: "self-test",
      invocation: "node scripts/lint-user-surface-leaks.mjs --self-test",
    },
  ],
});
writeJson(path.join(goldenRoot, "digest-vectors.json"), {
  algorithm: ENVELOPE_DIGEST_ALGORITHM,
  canonical: canonicalizeJson({ b: 2, a: 1 }),
  canonicalSha256: sha256CanonicalJson({ b: 2, a: 1 }),
  payloadAlgorithm: PAYLOAD_DIGEST_ALGORITHM,
  payloadSha256: minimalInput.release.payloadDigest,
  firstEntryContentSha256: baseEntry.contentSha256,
});

const artifactDigest =
  process.argv[3] ?? createHash("sha256").update("unbuilt-artifact").digest("hex");
const firstRun = materializeAdoptionShellV2(JSON.parse(JSON.stringify(minimalInput)));
const secondRun = materializeAdoptionShellV2(JSON.parse(JSON.stringify(minimalInput)));
if (canonicalizeJson(firstRun) !== canonicalizeJson(secondRun)) {
  throw new Error("independently reconstructed materializations diverged");
}
const receiptBody = {
  schemaId: SCHEMA_IDS.verificationReceipt,
  schemaVersion: CONTRACT_VERSION,
  schemaDigest: SCHEMA_DIGESTS.verificationReceipt,
  contractId: CONTRACT_ID,
  receiptKind: "repo-template/adoption-shell-verification/v2",
  digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
  artifactDigest,
  inputDigest: sha256CanonicalJson(minimalInput),
  outputManifestDigest: firstRun.manifest.manifestDigest,
  outputPayloadDigest: firstRun.manifest.outputPayloadDigest,
  independentRunCount: 2,
  result: "verified",
};
writeJson(path.join(goldenRoot, "deterministic-receipt.json"), {
  ...receiptBody,
  receiptDigest: sha256CanonicalJson(receiptBody),
});
