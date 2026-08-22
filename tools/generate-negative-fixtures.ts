import {
  type MaterializerInput,
  sha256Bytes,
  sha256CanonicalJson,
} from "../packages/adoption-shell/src/index.ts";
import {
  alpha,
  baseEntry,
  beta,
  lintFixtures,
  lintId,
  lintInput,
  multiInput,
} from "./contract-fixtures-data.ts";
import {
  clone,
  input,
  invalid,
  minimalInput,
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

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function withFirstEntry(
  value: MaterializerInput,
  changes: Readonly<Record<string, unknown>>,
): unknown {
  const [firstEntry, ...otherEntries] = value.release.entries;
  if (firstEntry === undefined) throw new Error("fixture release must contain an entry");
  const release = {
    ...value.release,
    entries: [{ ...firstEntry, ...changes }, ...otherEntries],
  };
  const { releaseDigest: _releaseDigest, ...body } = release;
  return {
    ...value,
    release: { ...body, releaseDigest: sha256CanonicalJson(body) },
  };
}

function pathCase(name: string, portablePath: string): NegativeFixture {
  return invalid(name, ["E_PATH_PORTABLE"], withFirstEntry(minimalInput, { path: portablePath }));
}

function kindCase(kind: string): NegativeFixture {
  return invalid(`kind-${kind}`, ["E_CONST"], withFirstEntry(minimalInput, { kind }));
}

function foreignFieldCase(field: string): NegativeFixture {
  return invalid(`foreign-${field}`, ["E_UNKNOWN_PROPERTY"], {
    ...clone(minimalInput),
    [field]: "foreign-authority",
  });
}

function buildPathCases(): NegativeFixture[] {
  return [
    pathCase("absolute-root", "/rooted"),
    pathCase("absolute-drive", "C:/rooted"),
    pathCase("absolute-unc", String.raw`\\server\share`),
    pathCase("traversal", "../escape"),
    pathCase("dot-segment", "docs/./file"),
    pathCase("control", "docs/\u0001file"),
    pathCase("trailing-dot", "docs/file."),
    pathCase("trailing-space", "docs/file "),
    pathCase("windows-reserved", "docs/CON.txt"),
    pathCase("backslash", String.raw`docs\file`),
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
    rows.push(invalid(name, ["E_PATH_ISSUE_TEMPLATE"], withFirstEntry(minimalInput, { path: issuePath })));
  }
  return rows;
}

function buildPreCustodyCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  for (const [name, workflowPath] of [
    ["pre-custody-workflow", ".github/workflows/ci.yml"],
    ["pre-custody-workflow-case", ".GITHUB/WORKFLOWS/ci.yml"],
  ] as const) {
    rows.push(invalid(name, ["E_PATH_PRE_CUSTODY_WORKFLOW"], withFirstEntry(minimalInput, { path: workflowPath })));
  }
  return rows;
}

function buildStructureCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  const duplicate = mutableInput(minimalInput);
  const duplicateEntry = duplicate.release.entries[0];
  if (duplicateEntry === undefined) throw new Error("fixture release must contain an entry");
  duplicate.release = { ...duplicate.release, entries: [clone(duplicateEntry), clone(duplicateEntry)] };
  rehashRelease(duplicate);
  rows.push(invalid("duplicate", ["E_DUPLICATE"], duplicate));

  const collision = mutableInput(minimalInput);
  const collisionEntry = collision.release.entries[0];
  if (collisionEntry === undefined) throw new Error("fixture release must contain an entry");
  collision.release = { ...collision.release, entries: [...collision.release.entries, { ...clone(collisionEntry), path: "readme.md" }] };
  rehashRelease(collision);
  rows.push(invalid("case-fold-collision", ["E_PATH_CASE_COLLISION"], collision));

  for (const mode of ["0644", "100600"]) {
    rows.push(invalid(`mode-${mode}`, ["E_MODE"], withFirstEntry(minimalInput, { mode })));
  }
  return rows;
}

function buildIntegrityCases(): NegativeFixture[] {
  const rows: NegativeFixture[] = [];
  const invalidUtf8 = Buffer.from([0xc3, 0x28]);
  rows.push(
    invalid("encoding-role", ["E_ENCODING_ROLE"], withFirstEntry(minimalInput, { encoding: "binary" })),
    invalid("invalid-utf8", ["E_UTF8"], withFirstEntry(minimalInput, {
      contentBase64: invalidUtf8.toString("base64"),
      contentSha256: sha256Bytes(invalidUtf8),
    })),
    invalid("noncanonical-base64", ["E_BASE64"], withFirstEntry(minimalInput, { contentBase64: "YQ" })),
    invalid("content-digest", ["E_CONTENT_DIGEST"], withFirstEntry(minimalInput, { contentSha256: "0".repeat(64) })),
  );

  const payloadDigest = mutableInput(minimalInput);
  payloadDigest.release = { ...payloadDigest.release, payloadDigest: "0".repeat(64) };
  const { releaseDigest: _payloadReleaseDigest, ...payloadBody } = payloadDigest.release;
  payloadDigest.release = { ...payloadBody, releaseDigest: sha256CanonicalJson(payloadBody) };
  const aggregateDigest = mutableInput(minimalInput);
  aggregateDigest.release = { ...aggregateDigest.release, releaseDigest: "0".repeat(64) };
  rows.push(
    invalid("payload-digest", ["E_PAYLOAD_DIGEST"], payloadDigest),
    invalid("aggregate-digest", ["E_RELEASE_DIGEST"], aggregateDigest),
    invalid("nonempty-migration-refs", ["E_COUNT"], {
      ...clone(minimalInput),
      release: { ...minimalInput.release, migrationRefs: ["prior-generation"] },
    }),
  );
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
        mode.id === "self-test" ? { ...mode, requiredPaths: [...mode.requiredPaths, "tests/self-only.json"].sort(compare) } : mode,
      ),
    }),
  );
  rows.push(invalid("missing-mode-closure", ["E_MODE_CLOSURE"], missingMode));

  const betaEntry = multiInput.release.entries.find((current) => current.path === "features/beta.txt");
  if (betaEntry === undefined) throw new Error("beta fixture entry missing");
  const unowned = {
    ...multiInput,
    release: {
      ...multiInput.release,
      entries: multiInput.release.entries.map((entry) =>
        entry === betaEntry ? { ...entry, bundleId: "example/unknown" } : entry,
      ),
    },
  };
  const { releaseDigest: _releaseDigest, ...unownedBody } = unowned.release;
  rows.push(invalid("unowned-entry", ["E_UNOWNED_ENTRY"], {
    ...unowned,
    release: { ...unownedBody, releaseDigest: sha256CanonicalJson(unownedBody) },
  }));
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
