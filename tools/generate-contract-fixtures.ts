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

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type MutableMaterializerInput = {
  -readonly [Key in keyof MaterializerInput]: MaterializerInput[Key];
};

function mutableInput(value: MaterializerInput): MutableMaterializerInput {
  return clone(value) as MutableMaterializerInput;
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
  mode: "100644" | "100755" = "100644",
): PayloadEntry {
  return entry(portablePath, Buffer.from(text, "utf8"), role, bundleId, mode);
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
    "100644",
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
    conformance: {
      noLocalIssueTemplateOverride: true,
      noPreCustodyWorkflows: true,
    },
  };
}

function rehashRelease(value: MutableMaterializerInput): void {
  const entries = [...value.release.entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const payloadDigest = sha256PayloadEntries(entries);
  const { releaseDigest: _releaseDigest, ...oldBody } = value.release;
  const body = { ...oldBody, payloadDigest, entryCount: entries.length, entries };
  value.release = { ...body, releaseDigest: sha256CanonicalJson(body) };
}

function replaceBundle(
  value: MutableMaterializerInput,
  bundleId: string,
  transform: (current: CapabilityBundle) => CapabilityBundle,
): CapabilityBundle {
  const bundles = value.capabilities.bundles.map((current) =>
    current.id === bundleId ? transform(current) : current,
  );
  const updated = bundles.find((current) => current.id === bundleId);
  if (updated === undefined) throw new Error(`fixture bundle missing: ${bundleId}`);
  value.capabilities = registry(bundles);
  value.requestedBundles = value.requestedBundles.map((current) =>
    current.id === bundleId ? reference(updated) : current,
  );
  return updated;
}

function rehashBundle(
  value: CapabilityBundle,
  changes: Partial<Omit<CapabilityBundle, "digest">>,
): CapabilityBundle {
  const { digest: _digest, ...oldBody } = value;
  return bundle({ ...oldBody, ...changes });
}

interface NegativeFixture {
  readonly name: string;
  readonly expectedCodes: readonly string[];
  readonly input: unknown;
}

function invalid(
  name: string,
  expectedCodes: readonly string[],
  value: unknown,
): NegativeFixture {
  return { name, expectedCodes, input: value };
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
    textEntry("features/alpha.txt", "alpha\n", "capability-config", alpha.id),
    textEntry("features/beta.txt", "beta\n", "capability-config", beta.id),
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
  version: "2.6.0",
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
const lintInput = input(
  release([
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
  ]),
  lintRegistry,
  [reference(lintBundle)],
);

const templateAdr = textEntry(
  "docs/adr/template-file-format-selection.md",
  "# ADR-0003: File-format selection (md / json / jsonl / tsv / csv)\n\nTemplate-owned decision.\n",
  "generic-base-text",
  null,
);
const unrelatedAdr = textEntry(
  "docs/adr/0003-unrelated-local-decision.md",
  "# ADR-0003: Unrelated local decision\n\nThis local decision is intentionally unrelated.\n",
  "generic-base-text",
  null,
);
const correctAuthority = textEntry(
  "docs/INCIDENTS.md",
  "# Incidents\n\nPer [ADR-0003: File-format selection (md / json / jsonl / tsv / csv)](adr/template-file-format-selection.md), JSONL is the incident authority.\n",
  "generic-base-text",
  null,
);
const portableDocsInput = input(
  release([baseEntry, correctAuthority, unrelatedAdr, templateAdr]),
  registry([]),
  [],
);

function pathCase(name: string, portablePath: string): NegativeFixture {
  const value = mutableInput(minimalInput);
  (value.release.entries[0] as { path: string }).path = portablePath;
  return invalid(name, ["E_PATH_PORTABLE"], value);
}

function kindCase(kind: string): NegativeFixture {
  const value = mutableInput(minimalInput);
  (value.release.entries[0] as { kind: string }).kind = kind;
  rehashRelease(value);
  return invalid(`kind-${kind}`, ["E_CONST"], value);
}

function foreignFieldCase(field: string): NegativeFixture {
  const value = clone(minimalInput) as unknown as Record<string, unknown>;
  value[field] = "foreign-authority";
  return invalid(`foreign-${field}`, ["E_UNKNOWN_PROPERTY"], value);
}

function firstEntryOf(value: MaterializerInput): PayloadEntry {
  const first = value.release.entries[0];
  if (first === undefined) throw new Error("fixture release must contain an entry");
  return first;
}

function negativeFixtures(): readonly NegativeFixture[] {
  const rows: NegativeFixture[] = [
    pathCase("absolute-root", "/rooted"),
    pathCase("absolute-drive", "C:/rooted"),
    pathCase("absolute-unc", "\\\\server\\share"),
    pathCase("traversal", "../escape"),
    pathCase("dot-segment", "docs/./file"),
    pathCase("control", "docs/\u0001file"),
    pathCase("trailing-dot", "docs/file."),
    pathCase("trailing-space", "docs/file "),
    pathCase("windows-reserved", "docs/CON.txt"),
    pathCase("backslash", "docs\\file"),
    ...["symlink", "device", "socket", "special"].map(kindCase),
  ];

  for (const [name, issuePath] of [
    ["issue-template", ".github/ISSUE_TEMPLATE/task.md"],
    ["issue-template-case-root", ".GITHUB/issue_template/task.md"],
    ["issue-template-case-leaf", ".github/Issue_Template/task.md"],
  ] as const) {
    const value = mutableInput(minimalInput);
    (value.release.entries[0] as { path: string }).path = issuePath;
    rows.push(invalid(name, ["E_PATH_ISSUE_TEMPLATE"], value));
  }

  for (const [name, workflowPath] of [
    ["pre-custody-workflow", ".github/workflows/ci.yml"],
    ["pre-custody-workflow-case", ".GITHUB/WORKFLOWS/ci.yml"],
  ] as const) {
    const value = mutableInput(minimalInput);
    (value.release.entries[0] as { path: string }).path = workflowPath;
    rows.push(invalid(name, ["E_PATH_PRE_CUSTODY_WORKFLOW"], value));
  }

  const duplicate = mutableInput(minimalInput);
  const duplicateEntry = firstEntryOf(duplicate);
  duplicate.release = {
    ...duplicate.release,
    entries: [
      clone(duplicateEntry),
      clone(duplicateEntry),
    ],
  };
  rehashRelease(duplicate);
  rows.push(invalid("duplicate", ["E_DUPLICATE"], duplicate));

  const collision = mutableInput(minimalInput);
  const collisionEntry = firstEntryOf(collision);
  collision.release = {
    ...collision.release,
    entries: [
      ...collision.release.entries,
      { ...clone(collisionEntry), path: "readme.md" },
    ],
  };
  rehashRelease(collision);
  rows.push(invalid("case-fold-collision", ["E_PATH_CASE_COLLISION"], collision));

  for (const mode of ["0644", "100600"]) {
    const value = mutableInput(minimalInput);
    (value.release.entries[0] as { mode: string }).mode = mode;
    rehashRelease(value);
    rows.push(invalid(`mode-${mode}`, ["E_MODE"], value));
  }

  const encoding = mutableInput(minimalInput);
  (encoding.release.entries[0] as { encoding: string }).encoding = "binary";
  rows.push(invalid("encoding-role", ["E_ENCODING_ROLE"], encoding));

  const utf8 = mutableInput(minimalInput);
  const invalidUtf8 = Buffer.from([0xc3, 0x28]);
  const utf8Entry = utf8.release.entries[0] as {
    contentBase64: string;
    contentSha256: string;
  };
  utf8Entry.contentBase64 = invalidUtf8.toString("base64");
  utf8Entry.contentSha256 = sha256Bytes(invalidUtf8);
  rehashRelease(utf8);
  rows.push(invalid("invalid-utf8", ["E_UTF8"], utf8));

  const base64 = mutableInput(minimalInput);
  (base64.release.entries[0] as { contentBase64: string }).contentBase64 = "YQ";
  rows.push(invalid("noncanonical-base64", ["E_BASE64"], base64));

  const contentDigest = mutableInput(minimalInput);
  (contentDigest.release.entries[0] as { contentSha256: string }).contentSha256 =
    "0".repeat(64);
  rehashRelease(contentDigest);
  rows.push(invalid("content-digest", ["E_CONTENT_DIGEST"], contentDigest));

  const payloadDigest = mutableInput(minimalInput);
  payloadDigest.release = {
    ...payloadDigest.release,
    payloadDigest: "0".repeat(64),
  };
  const { releaseDigest: _payloadReleaseDigest, ...payloadBody } = payloadDigest.release;
  payloadDigest.release = {
    ...payloadBody,
    releaseDigest: sha256CanonicalJson(payloadBody),
  };
  rows.push(invalid("payload-digest", ["E_PAYLOAD_DIGEST"], payloadDigest));

  const aggregateDigest = mutableInput(minimalInput);
  aggregateDigest.release = {
    ...aggregateDigest.release,
    releaseDigest: "0".repeat(64),
  };
  rows.push(invalid("aggregate-digest", ["E_RELEASE_DIGEST"], aggregateDigest));

  const migration = clone(minimalInput) as unknown as {
    release: { migrationRefs: string[] };
  };
  migration.release.migrationRefs = ["prior-generation"];
  rows.push(invalid("nonempty-migration-refs", ["E_COUNT"], migration));

  const missingDependency = mutableInput(multiInput);
  missingDependency.capabilities = registry(
    missingDependency.capabilities.bundles.filter((current) => current.id !== alpha.id),
  );
  rows.push(invalid("missing-dependency", ["E_BUNDLE_MISSING"], missingDependency));

  const missingArtifact = mutableInput(lintInput);
  missingArtifact.release = {
    ...missingArtifact.release,
    entries: missingArtifact.release.entries.filter(
      (current) => current.path !== "scripts/lint-user-surface-leaks.mjs",
    ),
  };
  rehashRelease(missingArtifact);
  rows.push(
    invalid(
      "missing-executable-artifact",
      ["E_BUNDLE_ARTIFACT_MISSING", "E_MODE_CLOSURE"],
      missingArtifact,
    ),
  );

  const missingFixture = mutableInput(lintInput);
  missingFixture.release = {
    ...missingFixture.release,
    entries: missingFixture.release.entries.filter(
      (current) => current.path !== lintFixtures[0],
    ),
  };
  rehashRelease(missingFixture);
  rows.push(
    invalid(
      "missing-fixture",
      ["E_BUNDLE_FIXTURE_MISSING", "E_MODE_CLOSURE"],
      missingFixture,
    ),
  );

  const selfClassified = mutableInput(lintInput);
  selfClassified.release = {
    ...selfClassified.release,
    entries: selfClassified.release.entries.filter(
      (current) => current.path !== lintFixtures[1],
    ),
  };
  rehashRelease(selfClassified);
  rows.push(
    invalid(
      "self-classified-mode-closure",
      ["E_BUNDLE_FIXTURE_MISSING", "E_MODE_CLOSURE"],
      selfClassified,
    ),
  );

  const missingGolden = mutableInput(multiInput);
  replaceBundle(missingGolden, beta.id, (current) =>
    rehashBundle(current, { goldens: ["golden/missing.json"] }),
  );
  rows.push(invalid("missing-golden", ["E_BUNDLE_GOLDEN_MISSING"], missingGolden));

  const missingMode = mutableInput(lintInput);
  replaceBundle(missingMode, lintId, (current) =>
    rehashBundle(current, {
      modes: current.modes.map((mode) =>
        mode.id === "self-test"
          ? {
              ...mode,
              requiredPaths: [...mode.requiredPaths, "tests/self-only.json"].sort(),
            }
          : mode,
      ),
    }),
  );
  rows.push(invalid("missing-mode-closure", ["E_MODE_CLOSURE"], missingMode));

  const unowned = mutableInput(multiInput);
  const betaEntry = unowned.release.entries.find((current) => current.path === "features/beta.txt");
  if (betaEntry === undefined) throw new Error("beta fixture entry missing");
  (betaEntry as { bundleId: string }).bundleId = "example/unknown";
  rehashRelease(unowned);
  rows.push(invalid("unowned-entry", ["E_UNOWNED_ENTRY"], unowned));

  const bareAdr = input(
    release([
      baseEntry,
      unrelatedAdr,
      textEntry(
        "docs/INCIDENTS.md",
        "# Incidents\n\nPer ADR-0003, JSONL is the incident authority.\n",
        "generic-base-text",
        null,
      ),
    ]),
    registry([]),
    [],
  );
  rows.push(invalid("bare-adr-authority", ["E_DOC_BARE_ADR"], bareAdr));

  const checkoutLink = input(
    release([
      baseEntry,
      textEntry(
        "docs/INCIDENTS.md",
        "# Incidents\n\nSee [fleet incidents](../../agent-orchestrator/docs/INCIDENTS.md).\n",
        "generic-base-text",
        null,
      ),
    ]),
    registry([]),
    [],
  );
  rows.push(invalid("checkout-depth-link", ["E_DOC_CHECKOUT_LINK"], checkoutLink));

  const missingLink = input(
    release([
      baseEntry,
      textEntry(
        "docs/README.md",
        "# Docs\n\nSee [missing](missing.md).\n",
        "generic-base-text",
        null,
      ),
    ]),
    registry([]),
    [],
  );
  rows.push(invalid("missing-relative-doc-link", ["E_DOC_LINK_MISSING"], missingLink));

  rows.push(
    ...[
      "targetRepository",
      "repositoryOwner",
      "origin",
      "defaultBranch",
      "checkoutPath",
      "github",
      "registry",
      "factory",
      "lifecycle",
      "schedule",
      "activation",
      "queue",
      "provider",
      "credential",
      "verificationCommand",
      "createdAt",
      "outputRoot",
      "effectInstruction",
    ].map(foreignFieldCase),
  );
  return rows;
}

const rfc8785Vectors = {
  vectors: [
    {
      name: "published primitives and number serialization",
      input: {
        numbers: [333333333.3333333, 1e30, 4.5, 0.002, 1e-27],
        string: "€$\u000f\nA'B\"\\\\\"/",
        literals: [null, true, false],
      },
      canonical:
        "{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\\\\\"/\"}",
    },
    {
      name: "UTF-16 key ordering",
      input: {
        "€": "Euro Sign",
        "\r": "Carriage Return",
        "דּ": "Hebrew Letter Dalet With Dagesh",
        "1": "One",
        "😀": "Emoji: Grinning Face",
        "\u0080": "Control",
        "ö": "Latin Small Letter O With Diaeresis",
      },
      canonical:
        "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u0080\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😀\":\"Emoji: Grinning Face\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}",
    },
  ],
};

export function generateContractFixtures(
  contractRoot: string,
  artifactDigest: string,
): void {
  const fixtureRoot = path.join(contractRoot, "fixtures");
  const goldenRoot = path.join(contractRoot, "golden");
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.rmSync(goldenRoot, { recursive: true, force: true });

  writeJson(path.join(fixtureRoot, "minimal-input.json"), minimalInput);
  writeJson(path.join(fixtureRoot, "minimal-input-shuffled-keys.json"), {
    conformance: minimalInput.conformance,
    requestedBundles: minimalInput.requestedBundles,
    capabilities: minimalInput.capabilities,
    release: minimalInput.release,
    contractId: minimalInput.contractId,
    schemaDigest: minimalInput.schemaDigest,
    schemaVersion: minimalInput.schemaVersion,
    schemaId: minimalInput.schemaId,
  });
  writeJson(path.join(fixtureRoot, "multi-bundle-input.json"), multiInput);
  writeJson(path.join(fixtureRoot, "portable-docs-input.json"), portableDocsInput);
  writeJson(path.join(fixtureRoot, "user-surface-lint-input.json"), lintInput);
  writeJson(path.join(fixtureRoot, "negative-inputs.json"), negativeFixtures());
  writeJson(path.join(contractRoot, "capability-bundle-registry.json"), lintRegistry);
  writeJson(path.join(goldenRoot, "rfc8785-vectors.json"), rfc8785Vectors);
  writeJson(path.join(goldenRoot, "user-surface-lint-modes.json"), {
    bundle: reference(lintBundle),
    modes: [
      {
        id: "config",
        invocation:
          "node scripts/lint-user-surface-leaks.mjs --config .user-surface-lint.json",
      },
      {
        id: "self-test",
        invocation: "node scripts/lint-user-surface-leaks.mjs --self-test",
      },
    ],
  });
  writeJson(path.join(goldenRoot, "digest-vectors.json"), {
    envelopeAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    canonical: canonicalizeJson({ b: 2, a: 1 }),
    canonicalSha256: sha256CanonicalJson({ b: 2, a: 1 }),
    payloadAlgorithm: PAYLOAD_DIGEST_ALGORITHM,
    payloadSha256: minimalInput.release.payloadDigest,
    firstEntryContentSha256: baseEntry.contentSha256,
  });

  const firstRun = materializeAdoptionShellV2(clone(minimalInput));
  const secondRun = materializeAdoptionShellV2(clone(minimalInput));
  if (canonicalizeJson(firstRun) !== canonicalizeJson(secondRun)) {
    throw new Error("independently reconstructed materializations diverged");
  }
  writeJson(path.join(goldenRoot, "minimal-output.json"), firstRun);
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
  } as const;
  writeJson(path.join(goldenRoot, "deterministic-receipt.json"), {
    ...receiptBody,
    receiptDigest: sha256CanonicalJson(receiptBody),
  });
}
