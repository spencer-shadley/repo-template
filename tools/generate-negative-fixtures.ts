import {
  type MaterializerInput,
  type PayloadEntry,
  sha256Bytes,
  sha256CanonicalJson,
} from "../packages/adoption-shell/src/index.ts";
import {
  alpha,
  baseEntry,
  beta,
  clone,
  input,
  invalid,
  lintFixtures,
  lintId,
  lintInput,
  minimalInput,
  multiInput,
  mutableInput,
  type NegativeFixture,
  registry,
  rehashBundle,
  rehashRelease,
  release,
  replaceBundle,
  textEntry,
  unrelatedAdr,
} from "./generate-contract-fixtures.ts";

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

function buildPathCases(): NegativeFixture[] {
  return [
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
}

function buildIssueTemplateCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  for (const [name, issuePath] of [
    ["issue-template", ".github/ISSUE_TEMPLATE/task.md"],
    ["issue-template-case-root", ".GITHUB/issue_template/task.md"],
    ["issue-template-case-leaf", ".github/Issue_Template/task.md"],
  ] as const) {
    const value = mutableInput(minimalInput);
    (value.release.entries[0] as { path: string }).path = issuePath;
    rows.push(invalid(name, ["E_PATH_ISSUE_TEMPLATE"], value));
  }
  return rows;
}

function buildPreCustodyCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  for (const [name, workflowPath] of [
    ["pre-custody-workflow", ".github/workflows/ci.yml"],
    ["pre-custody-workflow-case", ".GITHUB/WORKFLOWS/ci.yml"],
  ] as const) {
    const value = mutableInput(minimalInput);
    (value.release.entries[0] as { path: string }).path = workflowPath;
    rows.push(invalid(name, ["E_PATH_PRE_CUSTODY_WORKFLOW"], value));
  }
  return rows;
}

function buildStructureCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  const duplicate = mutableInput(minimalInput);
  const duplicateEntry = firstEntryOf(duplicate);
  duplicate.release = { ...duplicate.release, entries: [clone(duplicateEntry), clone(duplicateEntry)] };
  rehashRelease(duplicate);
  rows.push(invalid("duplicate", ["E_DUPLICATE"], duplicate));

  const collision = mutableInput(minimalInput);
  const collisionEntry = firstEntryOf(collision);
  collision.release = { ...collision.release, entries: [...collision.release.entries, { ...clone(collisionEntry), path: "readme.md" }] };
  rehashRelease(collision);
  rows.push(invalid("case-fold-collision", ["E_PATH_CASE_COLLISION"], collision));

  for (const mode of ["0644", "100600"]) {
    const value = mutableInput(minimalInput);
    (value.release.entries[0] as { mode: string }).mode = mode;
    rehashRelease(value);
    rows.push(invalid(`mode-${mode}`, ["E_MODE"], value));
  }
  return rows;
}

function buildIntegrityCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  const encoding = mutableInput(minimalInput);
  (encoding.release.entries[0] as { encoding: string }).encoding = "binary";
  rows.push(invalid("encoding-role", ["E_ENCODING_ROLE"], encoding));

  const utf8 = mutableInput(minimalInput);
  const invalidUtf8 = Buffer.from([0xc3, 0x28]);
  const utf8Entry = utf8.release.entries[0] as { contentBase64: string; contentSha256: string };
  utf8Entry.contentBase64 = invalidUtf8.toString("base64");
  utf8Entry.contentSha256 = sha256Bytes(invalidUtf8);
  rehashRelease(utf8);
  rows.push(invalid("invalid-utf8", ["E_UTF8"], utf8));

  const base64 = mutableInput(minimalInput);
  (base64.release.entries[0] as { contentBase64: string }).contentBase64 = "YQ";
  rows.push(invalid("noncanonical-base64", ["E_BASE64"], base64));

  const contentDigest = mutableInput(minimalInput);
  (contentDigest.release.entries[0] as { contentSha256: string }).contentSha256 = "0".repeat(64);
  rehashRelease(contentDigest);
  rows.push(invalid("content-digest", ["E_CONTENT_DIGEST"], contentDigest));

  const payloadDigest = mutableInput(minimalInput);
  payloadDigest.release = { ...payloadDigest.release, payloadDigest: "0".repeat(64) };
  const { releaseDigest: _payloadReleaseDigest, ...payloadBody } = payloadDigest.release;
  payloadDigest.release = { ...payloadBody, releaseDigest: sha256CanonicalJson(payloadBody) };
  rows.push(invalid("payload-digest", ["E_PAYLOAD_DIGEST"], payloadDigest));

  const aggregateDigest = mutableInput(minimalInput);
  aggregateDigest.release = { ...aggregateDigest.release, releaseDigest: "0".repeat(64) };
  rows.push(invalid("aggregate-digest", ["E_RELEASE_DIGEST"], aggregateDigest));

  const migration = clone(minimalInput) as unknown as { release: { migrationRefs: string[] } };
  migration.release.migrationRefs = ["prior-generation"];
  rows.push(invalid("nonempty-migration-refs", ["E_COUNT"], migration));
  return rows;
}

function buildBundleCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  const missingDependency = mutableInput(multiInput);
  missingDependency.capabilities = registry(
    missingDependency.capabilities.bundles.filter((current) => current.id !== alpha.id),
  );
  rows.push(invalid("missing-dependency", ["E_BUNDLE_MISSING"], missingDependency));

  const missingArtifact = mutableInput(lintInput);
  missingArtifact.release = {
    ...missingArtifact.release,
    entries: missingArtifact.release.entries.filter((current) => current.path !== "scripts/lint-user-surface-leaks.ts"),
  };
  rehashRelease(missingArtifact);
  rows.push(invalid("missing-executable-artifact", ["E_BUNDLE_ARTIFACT_MISSING", "E_MODE_CLOSURE"], missingArtifact));

  const missingFixture = mutableInput(lintInput);
  missingFixture.release = {
    ...missingFixture.release,
    entries: missingFixture.release.entries.filter((current) => current.path !== lintFixtures[0]),
  };
  rehashRelease(missingFixture);
  rows.push(invalid("missing-fixture", ["E_BUNDLE_FIXTURE_MISSING", "E_MODE_CLOSURE"], missingFixture));

  const selfClassified = mutableInput(lintInput);
  selfClassified.release = {
    ...selfClassified.release,
    entries: selfClassified.release.entries.filter((current) => current.path !== lintFixtures[1]),
  };
  rehashRelease(selfClassified);
  rows.push(invalid("self-classified-mode-closure", ["E_BUNDLE_FIXTURE_MISSING", "E_MODE_CLOSURE"], selfClassified));

  const missingGolden = mutableInput(multiInput);
  replaceBundle(missingGolden, beta.id, (current) => rehashBundle(current, { goldens: ["golden/missing.json"] }));
  rows.push(invalid("missing-golden", ["E_BUNDLE_GOLDEN_MISSING"], missingGolden));

  const missingMode = mutableInput(lintInput);
  replaceBundle(missingMode, lintId, (current) =>
    rehashBundle(current, {
      modes: current.modes.map((mode) =>
        mode.id === "self-test" ? { ...mode, requiredPaths: [...mode.requiredPaths, "tests/self-only.json"].sort() } : mode,
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
  return rows;
}

function buildDocCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  const bareAdr = input(
    release([
      baseEntry,
      unrelatedAdr,
      textEntry("docs/INCIDENTS.md", "# Incidents\n\nPer ADR-0003, JSONL is the incident authority.\n", "generic-base-text", null),
    ]),
    registry([]),
    [],
  );
  rows.push(invalid("bare-adr-authority", ["E_DOC_BARE_ADR"], bareAdr));

  const checkoutLink = input(
    release([
      baseEntry,
      textEntry("docs/INCIDENTS.md", "# Incidents\n\nSee [fleet incidents](../../agent-orchestrator/docs/INCIDENTS.md).\n", "generic-base-text", null),
    ]),
    registry([]),
    [],
  );
  rows.push(invalid("checkout-depth-link", ["E_DOC_CHECKOUT_LINK"], checkoutLink));

  const missingLink = input(
    release([baseEntry, textEntry("docs/README.md", "# Docs\n\nSee [missing](missing.md).\n", "generic-base-text", null)]),
    registry([]),
    [],
  );
  rows.push(invalid("missing-relative-doc-link", ["E_DOC_LINK_MISSING"], missingLink));
  return rows;
}

const FOREIGN_FIELDS = [
  "targetRepository", "repositoryOwner", "origin", "defaultBranch", "checkoutPath",
  "github", "registry", "factory", "lifecycle", "schedule", "activation", "queue",
  "provider", "credential", "verificationCommand", "createdAt", "outputRoot", "effectInstruction",
] as const;

export function negativeFixtures(): readonly NegativeFixture[] {
  return [
    ...buildPathCases(),
    ...buildIssueTemplateCases(),
    ...buildPreCustodyCases(),
    ...buildStructureCases(),
    ...buildIntegrityCases(),
    ...buildBundleCases(),
    ...buildDocCases(),
    ...FOREIGN_FIELDS.map(foreignFieldCase),
  ];
}