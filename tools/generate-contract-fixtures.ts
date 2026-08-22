import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTIFACT_MANIFEST_PATH,
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  RELEASE_PAYLOAD_MANIFEST_PATH,
  RELEASE_RECEIPT_KIND,
  REPO_TEMPLATE_ORIGIN,
  REPO_TEMPLATE_REPOSITORY,
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
  type TemplateReleaseReceipt,
} from "../packages/adoption-shell/src/index.ts";
import {
  baseEntry,
  deliveryDeclarationFixture,
  deliveryEventFixture,
  lintBundle,
  lintInput,
  multiInput,
  portableCapabilityRegistry,
} from "./contract-fixtures-data.ts";
import { negativeFixtures } from "./generate-negative-fixtures.ts";

function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

const root = projectRoot();

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export type MutableMaterializerInput = {
  -readonly [Key in keyof MaterializerInput]: MaterializerInput[Key];
};

export function mutableInput(value: MaterializerInput): MutableMaterializerInput {
  return clone(value);
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

export function textEntry(
  portablePath: string,
  text: string,
  role: EntryRole,
  bundleId: string | null,
  mode: "100644" | "100755" = "100644",
): PayloadEntry {
  return entry(portablePath, Buffer.from(text, "utf8"), role, bundleId, mode);
}

export function fileEntry(
  portablePath: string,
  role: EntryRole,
  bundleId: string,
): PayloadEntry {
  return entry(
    portablePath,
    fs.readFileSync(path.join(projectRoot(), ...portablePath.split("/"))),
    role,
    bundleId,
    "100644",
  );
}

export function release(entriesInput: readonly PayloadEntry[]): ReleasePayloadSet {
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

export function bundle(
  input: Omit<CapabilityBundle, "digest" | "digestAlgorithm">,
): CapabilityBundle {
  const body = { ...input, digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM };
  return { ...body, digest: sha256CanonicalJson(body) };
}

export function registry(bundlesInput: readonly CapabilityBundle[]): CapabilityBundleRegistry {
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

export function reference(value: CapabilityBundle): BundleReference {
  return { id: value.id, version: value.version, digest: value.digest };
}

export function input(
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

export function rehashRelease(value: MutableMaterializerInput): void {
  const entries = [...value.release.entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const payloadDigest = sha256PayloadEntries(entries);
  const { releaseDigest: _releaseDigest, ...oldBody } = value.release;
  const body = { ...oldBody, payloadDigest, entryCount: entries.length, entries };
  value.release = { ...body, releaseDigest: sha256CanonicalJson(body) };
}

export function replaceBundle(
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

export function rehashBundle(
  value: CapabilityBundle,
  changes: Partial<Omit<CapabilityBundle, "digest">>,
): CapabilityBundle {
  const { digest: _digest, ...oldBody } = value;
  return bundle({ ...oldBody, ...changes });
}

export interface NegativeFixture {
  readonly name: string;
  readonly expectedCodes: readonly string[];
  readonly input: unknown;
}

export function invalid(
  name: string,
  expectedCodes: readonly string[],
  value: unknown,
): NegativeFixture {
  return { name, expectedCodes, input: value };
}

export const minimalInput = input(release([baseEntry]), registry([]), []);

function receiptEvidenceFixture() {
  return {
    review: {
      subject: "producer-commit",
      url: "https://github.com/spencer-shadley/repo-template/pull/111#pullrequestreview-4815250857",
      result: "approved",
    },
    canaryReceipts: {
      "model-gateway-v1": {
        url: "https://github.com/spencer-shadley/model-gateway/issues/21#issuecomment-5120000001",
        receiptSha256: "a".repeat(64),
      },
      "repo-factory-v1": {
        url: "https://github.com/spencer-shadley/repo-factory/issues/1#issuecomment-5120000002",
        receiptSha256: "b".repeat(64),
      },
    },
    checks: {
      "repo-template-verify": {
        command: "corepack.cmd pnpm verify",
        result: "passed",
      },
    },
    publicationReadback: {
      kind: "producer-tag-ref/v1",
    },
    rollback: {
      disposition: "immutable-correct-forward",
      supersession: "new-semver-only",
    },
  } as const;
}

function templateReleaseReceiptFixture(): TemplateReleaseReceipt {
  const semver = "3.0.0";
  const tag = `v${semver}`;
  const body = {
    schemaId: SCHEMA_IDS.templateReleaseReceipt,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.templateReleaseReceipt,
    contractId: CONTRACT_ID,
    receiptKind: RELEASE_RECEIPT_KIND,
    publicationState: "candidate",
    releaseId: `${REPO_TEMPLATE_REPOSITORY}@${semver}`,
    receiptDigestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    producer: {
      repository: REPO_TEMPLATE_REPOSITORY,
      origin: REPO_TEMPLATE_ORIGIN,
      semver,
      tag,
      commit: "1".repeat(40),
      tree: "2".repeat(40),
    },
    receiptTransport: {
      kind: "annotated-git-tag-message/v1",
      tagName: tag,
      targetObjectType: "commit",
      bodyEncoding: "utf-8",
      bodyCanonicalization: "rfc8785",
    },
    payloadSet: {
      manifestPath: RELEASE_PAYLOAD_MANIFEST_PATH,
      schemaId: SCHEMA_IDS.releasePayloadSet,
      schemaVersion: CONTRACT_VERSION,
      schemaDigest: SCHEMA_DIGESTS.releasePayloadSet,
      manifestDigest: "3".repeat(64),
      payloadDigestAlgorithm: PAYLOAD_DIGEST_ALGORITHM,
      payloadDigest: "4".repeat(64),
      entryCount: 1,
    },
    capabilityBundles: [reference(lintBundle)],
    materializer: {
      contractId: CONTRACT_ID,
      contractVersion: CONTRACT_VERSION,
      artifactManifestPath: ARTIFACT_MANIFEST_PATH,
      artifactManifestSchemaId: SCHEMA_IDS.artifactManifest,
      artifactManifestSchemaVersion: CONTRACT_VERSION,
      artifactManifestSchemaDigest: SCHEMA_DIGESTS.artifactManifest,
      artifactManifestDigest: "5".repeat(64),
      artifactDigest: "6".repeat(64),
      entrypoint: "index.js",
      validatorExport: "validateMaterializerInputV2",
      runtimeCompatibility: ">=24.16.0 <25",
      compatibleReleaseReceiptKind: RELEASE_RECEIPT_KIND,
    },
    releaseEvidence: receiptEvidenceFixture(),
    migrationRefs: [] as const,
  } as const;
  return { ...body, receiptDigest: sha256CanonicalJson(body) };
}

const templateAdr = textEntry(
  "docs/adr/template-file-format-selection.md",
  "# ADR-0003: File-format selection (md / json / jsonl / tsv / csv)\n\nTemplate-owned decision.\n",
  "generic-base-text",
  null,
);
export const unrelatedAdr = textEntry(
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

const rfc8785Vectors = {
  vectors: [
    {
      name: "published primitives and number serialization",
      input: {
        numbers: [333333333.3333333, 1e30, 4.5, 0.002, 1e-27],
        string: "€$\u{000F}\nA'B\"\\\\\"/",
        literals: [null, true, false],
      },
      canonical:
        String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`,
    },
    {
      name: "UTF-16 key ordering",
      input: {
        "€": "Euro Sign",
        "\r": "Carriage Return",
        "דּ": "Hebrew Letter Dalet With Dagesh",
        "1": "One",
        "😀": "Emoji: Grinning Face",
        "\u{0080}": "Control",
        "ö": "Latin Small Letter O With Diaeresis",
      },
      canonical:
        "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u{0080}\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😀\":\"Emoji: Grinning Face\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}",
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
  writeJson(path.join(fixtureRoot, "delivery-declaration.json"), deliveryDeclarationFixture);
  writeJson(path.join(fixtureRoot, "delivery-event.json"), deliveryEventFixture);
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
  writeJson(
    path.join(fixtureRoot, "template-release-receipt.json"),
    templateReleaseReceiptFixture(),
  );
  writeJson(path.join(fixtureRoot, "negative-inputs.json"), negativeFixtures());
  writeJson(path.join(contractRoot, "capability-bundle-registry.json"), portableCapabilityRegistry);
  writeJson(path.join(goldenRoot, "rfc8785-vectors.json"), rfc8785Vectors);
  writeJson(path.join(goldenRoot, "user-surface-lint-modes.json"), {
    bundle: reference(lintBundle),
    modes: [
      {
        id: "config",
        invocation:
          "node scripts/lint-user-surface-leaks.ts --config .user-surface-lint.json",
      },
      {
        id: "self-test",
        invocation: "node scripts/lint-user-surface-leaks.ts --self-test",
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
