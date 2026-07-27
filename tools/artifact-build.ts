import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  RELEASE_RECEIPT_KIND,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  sha256Bytes,
  sha256CanonicalJson,
  validateArtifactManifestV2,
  validateCapabilityBundleRegistryV2,
  validateMaterializerInputV2,
  validateMaterializerOutputManifestV2,
  validateTemplateReleaseReceiptV1,
  validateVerificationReceiptV2,
  type ArtifactManifest,
  type FileClosureRow,
  type SchemaClosureRow,
} from "../packages/adoption-shell/src/index.ts";
import { scanPublicCode } from "./artifact-policy.ts";
import { generateContractFixtures } from "./generate-contract-fixtures.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, "artifacts", "adoption-shell-v2");
const manifestPath = path.join(artifactRoot, "artifact-manifest.json");
const buildConfigPath = path.join(root, ".adoption-shell-build.json");
const sourceRoot = path.join(root, "packages", "adoption-shell", "src");
const contractRoot = path.join(root, "contracts", "adoption-shell-v2");
const contractPrefix = "contracts/adoption-shell-v2";
const sourcePrefix = "packages/adoption-shell/src";
const SCHEMA_FILES = [
  "artifact-manifest.schema.json",
  "capability-bundle.schema.json",
  "delivery-declaration.schema.json",
  "delivery-event.schema.json",
  "materializer-input.schema.json",
  "materializer-output-manifest.schema.json",
  "release-payload-set.schema.json",
  "template-release-receipt.schema.json",
  "verification-receipt.schema.json",
] as const;
const PORTABLE_CAPABILITY_PATHS = [
  ".user-surface-lint.json",
  ".user-surface-lint.schema.json",
  "scripts/lint-user-surface-leaks.mjs",
  "tests/fixtures/user-surface-lint/allowlisted/config.json",
  "tests/fixtures/user-surface-lint/allowlisted/src/messages.js",
  "tests/fixtures/user-surface-lint/bad/config.json",
  "tests/fixtures/user-surface-lint/bad/src/messages.js",
  "tests/fixtures/user-surface-lint/declared-none/config.json",
  "tests/fixtures/user-surface-lint/empty/config.json",
  "tests/fixtures/user-surface-lint/error-codes/config.json",
  "tests/fixtures/user-surface-lint/error-codes/src/messages.js",
  "tests/fixtures/user-surface-lint/good/config.json",
  "tests/fixtures/user-surface-lint/good/src/messages.js",
  "tests/fixtures/user-surface-lint/regex-leak/config.json",
  "tests/fixtures/user-surface-lint/regex-leak/src/messages.js",
  "tests/fixtures/user-surface-lint/regex-safe/config.json",
  "tests/fixtures/user-surface-lint/regex-safe/src/messages.js",
  "tests/fixtures/user-surface-lint/source-leak/config.json",
  "tests/fixtures/user-surface-lint/source-leak/src/messages.js",
] as const;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function portable(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function listFiles(rootPath: string): readonly string[] {
  if (!fs.existsSync(rootPath)) return [];
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(resolved);
      else if (entry.isFile()) output.push(portable(rootPath, resolved));
    }
  };
  visit(rootPath);
  return output.sort(compare);
}

function bytes(filePath: string): Uint8Array {
  return fs.readFileSync(filePath);
}

function closureRow(
  contentRoot: string,
  relativePath: string,
  manifestPathValue = relativePath,
): FileClosureRow {
  const content = bytes(path.join(contentRoot, ...relativePath.split("/")));
  return {
    path: manifestPathValue,
    kind: "file",
    mode: "100644",
    sha256: sha256Bytes(content),
    bytes: content.byteLength,
  };
}

function tempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "repo-template-adoption-shell-v2-"));
}

function controlledBuildRootFromConfig(): string {
  const config = JSON.parse(
    fs.readFileSync(buildConfigPath, "utf8"),
  ) as Record<string, unknown>;
  const compilerOptions = config["compilerOptions"];
  const outDir =
    compilerOptions !== null &&
    typeof compilerOptions === "object" &&
    !Array.isArray(compilerOptions)
      ? (compilerOptions as Record<string, unknown>)["outDir"]
      : undefined;
  if (typeof outDir !== "string") {
    throw new Error("temporary build config has no outDir");
  }
  const emittedRoot = path.resolve(outDir);
  const ownedRoot = path.dirname(emittedRoot);
  const tempRoot = path.resolve(os.tmpdir());
  if (
    path.basename(emittedRoot) !== "emitted" ||
    !path.basename(ownedRoot).startsWith("repo-template-adoption-shell-v2-") ||
    path.dirname(ownedRoot) !== tempRoot
  ) {
    throw new Error("temporary build config points outside the owned OS-temp root");
  }
  return ownedRoot;
}

function cleanPreparedBuild(): void {
  if (!fs.existsSync(buildConfigPath)) return;
  const ownedRoot = controlledBuildRootFromConfig();
  fs.rmSync(ownedRoot, { recursive: true, force: true });
  fs.rmSync(buildConfigPath, { force: true });
}

function prepareBuild(): void {
  cleanPreparedBuild();
  const ownedRoot = tempDirectory();
  const emittedRoot = path.join(ownedRoot, "emitted");
  const config = {
    extends: "./tsconfig.build.json",
    compilerOptions: {
      outDir: emittedRoot.split(path.sep).join("/"),
    },
  };
  fs.writeFileSync(buildConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function emittedRows(emittedRoot: string): readonly FileClosureRow[] {
  return listFiles(emittedRoot).map((relativePath) =>
    closureRow(emittedRoot, relativePath),
  );
}

function sourceRows(): readonly FileClosureRow[] {
  return listFiles(sourceRoot).map((relativePath) =>
    closureRow(sourceRoot, relativePath, `${sourcePrefix}/${relativePath}`),
  );
}

function schemaRows(): readonly SchemaClosureRow[] {
  return SCHEMA_FILES.map((relativePath) => {
    const value = JSON.parse(
      fs.readFileSync(path.join(contractRoot, relativePath), "utf8"),
    ) as Record<string, unknown>;
    return {
      ...closureRow(
        contractRoot,
        relativePath,
        `${contractPrefix}/${relativePath}`,
      ),
      id: String(value["$id"]),
      version: CONTRACT_VERSION,
    };
  }).sort((left, right) => compare(left.path, right.path));
}

function generatedFixturePaths(generatedContractRoot: string): readonly string[] {
  return listFiles(generatedContractRoot)
    .filter(
      (relativePath) =>
        relativePath === "capability-bundle-registry.json" ||
        relativePath.startsWith("fixtures/"),
    )
    .sort(compare);
}

function fixtureRows(
  generatedContractRoot: string,
): readonly FileClosureRow[] {
  const generated = generatedFixturePaths(generatedContractRoot).map((relativePath) =>
    closureRow(
      generatedContractRoot,
      relativePath,
      `${contractPrefix}/${relativePath}`,
    ),
  );
  const portableClosure = PORTABLE_CAPABILITY_PATHS.map((relativePath) =>
    closureRow(root, relativePath),
  );
  return [...generated, ...portableClosure].sort((left, right) =>
    compare(left.path, right.path),
  );
}

function goldenRows(generatedContractRoot: string): readonly FileClosureRow[] {
  return listFiles(path.join(generatedContractRoot, "golden")).map((relativePath) =>
    closureRow(
      path.join(generatedContractRoot, "golden"),
      relativePath,
      `${contractPrefix}/golden/${relativePath}`,
    ),
  );
}

function constructManifest(
  emittedRoot: string,
  generatedContractRoot: string,
): ArtifactManifest {
  const emitted = emittedRows(emittedRoot);
  const artifactDigest = sha256CanonicalJson({ files: emitted });
  const body = {
    schemaId: SCHEMA_IDS.artifactManifest,
    schemaVersion: CONTRACT_VERSION,
    schemaDigest: SCHEMA_DIGESTS.artifactManifest,
    contractId: CONTRACT_ID,
    contractVersion: CONTRACT_VERSION,
    digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    artifactDigestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    artifactDigest,
    toolchain: {
      typescript: "7.0.2",
      nodeCompatibility: ">=24.16.0 <25",
      packageManager: "pnpm@11.17.0",
    },
    entrypoint: "index.js",
    validatorExport: "validateMaterializerInputV2",
    runtimeDependencyCount: 0,
    releaseReceiptKind: RELEASE_RECEIPT_KIND,
    sources: sourceRows(),
    schemas: schemaRows(),
    emitted,
    fixtures: fixtureRows(generatedContractRoot),
    goldens: goldenRows(generatedContractRoot),
  } as const;
  return { ...body, manifestDigest: sha256CanonicalJson(body) };
}

function manifestBytes(manifest: ArtifactManifest): Uint8Array {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function compareEmitted(
  emittedRoot: string,
  expected: readonly FileClosureRow[],
): void {
  const actualPaths = listFiles(emittedRoot);
  const expectedPaths = expected.map((entry) => entry.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      `emitted path set mismatch\nexpected ${JSON.stringify(expectedPaths)}\nactual ${JSON.stringify(actualPaths)}`,
    );
  }
  for (const expectedRow of expected) {
    const actual = bytes(path.join(emittedRoot, ...expectedRow.path.split("/")));
    const committed = bytes(path.join(artifactRoot, ...expectedRow.path.split("/")));
    if (!Buffer.from(actual).equals(committed)) {
      throw new Error(`emitted bytes differ for ${expectedRow.path}`);
    }
    if (
      sha256Bytes(actual) !== expectedRow.sha256 ||
      actual.byteLength !== expectedRow.bytes
    ) {
      throw new Error(`emitted manifest row differs for ${expectedRow.path}`);
    }
  }
}

function compareGeneratedContract(generatedContractRoot: string): void {
  const generatedPaths = listFiles(generatedContractRoot);
  const committedPaths = [
    "capability-bundle-registry.json",
    ...listFiles(path.join(contractRoot, "fixtures")).map(
      (relativePath) => `fixtures/${relativePath}`,
    ),
    ...listFiles(path.join(contractRoot, "golden")).map(
      (relativePath) => `golden/${relativePath}`,
    ),
  ].sort(compare);
  if (JSON.stringify(generatedPaths) !== JSON.stringify(committedPaths)) {
    throw new Error("generated fixture/golden path set differs from the committed closure");
  }
  for (const relativePath of generatedPaths) {
    const actual = bytes(path.join(generatedContractRoot, ...relativePath.split("/")));
    const committed = bytes(path.join(contractRoot, ...relativePath.split("/")));
    if (!Buffer.from(actual).equals(committed)) {
      throw new Error(`generated contract bytes differ for ${relativePath}`);
    }
  }
}

function loadManifest(): ArtifactManifest {
  const value: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const validation = validateArtifactManifestV2(value);
  if (!validation.ok) {
    throw new Error(
      validation.diagnostics
        .map((diagnostic) => `${diagnostic.code} ${diagnostic.pointer} ${diagnostic.message}`)
        .join("\n"),
    );
  }
  return validation.value;
}

function verifyRows(
  rows: readonly FileClosureRow[],
  contentRoot = root,
): void {
  for (const expected of rows) {
    const resolved = path.join(contentRoot, ...expected.path.split("/"));
    if (!fs.existsSync(resolved)) {
      throw new Error(`closure path is missing: ${expected.path}`);
    }
    const content = bytes(resolved);
    if (
      content.byteLength !== expected.bytes ||
      sha256Bytes(content) !== expected.sha256
    ) {
      throw new Error(`closure digest differs: ${expected.path}`);
    }
  }
}

function verifySchemas(manifest: ArtifactManifest): void {
  const ids = new Set<string>(Object.values(SCHEMA_IDS));
  for (const schemaRow of manifest.schemas) {
    const schema = JSON.parse(
      fs.readFileSync(path.join(root, ...schemaRow.path.split("/")), "utf8"),
    ) as Record<string, unknown>;
    if (schema["$schema"] !== "https://json-schema.org/draft/2020-12/schema") {
      throw new Error(`${schemaRow.path} does not declare Draft 2020-12`);
    }
    if (schema["$id"] !== schemaRow.id || !ids.has(schemaRow.id)) {
      throw new Error(`${schemaRow.path} has an unexpected schema ID`);
    }
    const visit = (value: unknown, pointer: string): void => {
      if (value === null || typeof value !== "object") return;
      if (
        (value as Record<string, unknown>)["type"] === "object" &&
        (value as Record<string, unknown>)["additionalProperties"] !== false
      ) {
        throw new Error(`${schemaRow.path}${pointer} is not closed`);
      }
      const reference = (value as Record<string, unknown>)["$ref"];
      if (
        typeof reference === "string" &&
        !reference.startsWith("#") &&
        !reference.startsWith("./")
      ) {
        throw new Error(`${schemaRow.path}${pointer} has a non-local reference`);
      }
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${pointer}/${key}`);
      }
    };
    visit(schema, "");
  }
  const expectedDigests = new Set<string>(Object.values(SCHEMA_DIGESTS));
  for (const schemaRow of manifest.schemas) {
    if (!expectedDigests.has(schemaRow.sha256)) {
      throw new Error(`${schemaRow.path} digest is not exported by the artifact`);
    }
  }
}

function requireValid(
  result: { readonly ok: boolean },
  name: string,
): void {
  if (!result.ok) throw new Error(`${name} is not valid`);
}

function verifyJsonClosure(manifest: ArtifactManifest): void {
  for (const closureRow of [...manifest.schemas, ...manifest.fixtures, ...manifest.goldens]) {
    if (closureRow.path.endsWith(".json")) {
      JSON.parse(fs.readFileSync(path.join(root, ...closureRow.path.split("/")), "utf8"));
    }
  }
  const registry = JSON.parse(
    fs.readFileSync(path.join(contractRoot, "capability-bundle-registry.json"), "utf8"),
  );
  requireValid(
    validateCapabilityBundleRegistryV2(registry),
    "committed capability bundle registry",
  );
  for (const name of [
    "minimal-input.json",
    "minimal-input-shuffled-keys.json",
    "multi-bundle-input.json",
    "portable-docs-input.json",
    "user-surface-lint-input.json",
  ]) {
    const value = JSON.parse(
      fs.readFileSync(path.join(contractRoot, "fixtures", name), "utf8"),
    );
    requireValid(validateMaterializerInputV2(value), name);
  }
  const minimalOutput = JSON.parse(
    fs.readFileSync(path.join(contractRoot, "golden", "minimal-output.json"), "utf8"),
  ) as Record<string, unknown>;
  requireValid(
    validateMaterializerOutputManifestV2(minimalOutput["manifest"]),
    "minimal output golden manifest",
  );
  const receipt = JSON.parse(
    fs.readFileSync(path.join(contractRoot, "golden", "deterministic-receipt.json"), "utf8"),
  );
  requireValid(validateVerificationReceiptV2(receipt), "deterministic receipt");
  const templateReleaseReceipt = JSON.parse(
    fs.readFileSync(
      path.join(contractRoot, "fixtures", "template-release-receipt.json"),
      "utf8",
    ),
  );
  requireValid(
    validateTemplateReleaseReceiptV1(templateReleaseReceipt),
    "template release receipt fixture",
  );
}

function verifyPackage(): void {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ) as Record<string, unknown>;
  const expectedDev = {
    "@types/node": "24.13.3",
    typescript: "7.0.2",
  };
  if (
    packageJson["private"] !== true ||
    packageJson["type"] !== "module" ||
    packageJson["packageManager"] !== "pnpm@11.17.0" ||
    (packageJson["engines"] as Record<string, unknown> | undefined)?.["node"] !==
      ">=24.16.0 <25" ||
    packageJson["dependencies"] !== undefined ||
    JSON.stringify(packageJson["devDependencies"]) !== JSON.stringify(expectedDev)
  ) {
    throw new Error("package boundary does not match the exact v2 toolchain");
  }
  const npmrc = fs.readFileSync(path.join(root, ".npmrc"), "utf8");
  if (!npmrc.split(/\r?\n/).includes("ignore-scripts=true")) {
    throw new Error(".npmrc must disable install scripts");
  }
  const lock = fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
  if (
    !lock.includes("lockfileVersion: '9.0'") ||
    !lock.includes("specifier: 7.0.2") ||
    !lock.includes("specifier: 24.13.3") ||
    /onlyBuiltDependencies|allowedDeprecatedVersions|patchedDependencies/.test(lock)
  ) {
    throw new Error("lockfile does not express the exact closed tooling dependency set");
  }
}

function verifyTemplateCapabilityClosure(): void {
  const templateManifest = JSON.parse(
    fs.readFileSync(path.join(root, "template-manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  for (const relativePath of PORTABLE_CAPABILITY_PATHS) {
    if (templateManifest[relativePath] !== "copy") {
      throw new Error(
        `user-surface-lint materialized closure must be copy: ${relativePath}`,
      );
    }
  }
}

async function smokeDeclaredClosure(manifest: ArtifactManifest): Promise<void> {
  const ownedTemp = tempDirectory();
  try {
    for (const emitted of manifest.emitted) {
      const destination = path.join(ownedTemp, ...emitted.path.split("/"));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(
        path.join(artifactRoot, ...emitted.path.split("/")),
        destination,
      );
    }
    const moduleUrl = pathToFileURL(
      path.join(ownedTemp, ...manifest.entrypoint.split("/")),
    ).href;
    const artifact = (await import(moduleUrl)) as Record<string, unknown>;
    if (typeof artifact[manifest.validatorExport] !== "function") {
      throw new Error("declared validator export is missing");
    }
    const fixture: unknown = JSON.parse(
      fs.readFileSync(
        path.join(contractRoot, "fixtures", "minimal-input.json"),
        "utf8",
      ),
    );
    const validate = artifact[manifest.validatorExport] as (value: unknown) => {
      readonly ok: boolean;
    };
    if (!validate(fixture).ok) {
      throw new Error("declared-closure consumer rejected the valid fixture");
    }
    const materialize = artifact["materializeAdoptionShellV2"] as
      | ((value: unknown) => unknown)
      | undefined;
    if (typeof materialize !== "function" || materialize(fixture) === undefined) {
      throw new Error("declared-closure consumer materialization smoke failed");
    }
  } finally {
    fs.rmSync(ownedTemp, { recursive: true, force: true });
  }
}

async function verifyArtifact(): Promise<void> {
  const manifest = loadManifest();
  verifyRows([
    ...manifest.sources,
    ...manifest.schemas,
    ...manifest.fixtures,
    ...manifest.goldens,
  ]);
  verifyRows(manifest.emitted, artifactRoot);
  verifySchemas(manifest);
  verifyJsonClosure(manifest);
  verifyPackage();
  verifyTemplateCapabilityClosure();
  const expectedArtifactDigest = sha256CanonicalJson({ files: manifest.emitted });
  if (
    manifest.artifactDigestAlgorithm !== ENVELOPE_DIGEST_ALGORITHM ||
    manifest.artifactDigest !== expectedArtifactDigest
  ) {
    throw new Error("artifact aggregate digest mismatch");
  }
  const actualSources = listFiles(sourceRoot).map(
    (relativePath) => `${sourcePrefix}/${relativePath}`,
  );
  if (
    JSON.stringify(actualSources) !==
    JSON.stringify(manifest.sources.map((entry) => entry.path))
  ) {
    throw new Error("artifact source closure is incomplete");
  }
  const sourcePaths = manifest.sources.map((entry) => entry.path);
  const emittedPaths = manifest.emitted
    .map((entry) => entry.path)
    .filter((entry) => entry.endsWith(".js"));
  const policyFindings = [
    ...scanPublicCode(root, sourcePaths),
    ...scanPublicCode(artifactRoot, emittedPaths),
  ];
  if (policyFindings.length > 0) throw new Error(policyFindings.join("\n"));
  for (const sourcePath of sourcePaths) {
    const lines = fs
      .readFileSync(path.join(root, ...sourcePath.split("/")), "utf8")
      .split(/\r?\n/).length;
    if (lines > 500) throw new Error(`${sourcePath} exceeds 500 lines`);
  }
  await smokeDeclaredClosure(manifest);
}

function writeCommitted(emittedRoot: string, emitted: readonly string[]): void {
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  fs.mkdirSync(artifactRoot, { recursive: true });
  for (const relativePath of emitted) {
    const destination = path.join(artifactRoot, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(emittedRoot, ...relativePath.split("/")), destination);
  }
}

async function main(): Promise<void> {
  const action = process.argv[2];
  if (!["prepare", "finish", "verify"].includes(String(action))) {
    throw new Error(
      "usage: node tools/artifact-build.ts <prepare|finish> <write|check> | verify",
    );
  }
  if (action === "verify") {
    await verifyArtifact();
    return;
  }
  const mode = process.argv[3];
  if (mode !== "write" && mode !== "check") {
    throw new Error("build mode must be write or check");
  }
  if (action === "prepare") {
    prepareBuild();
    return;
  }

  const ownedTemp = controlledBuildRootFromConfig();
  try {
    const emittedRoot = path.join(ownedTemp, "emitted");
    const generatedContractRoot =
      mode === "write" ? contractRoot : path.join(ownedTemp, "contract");
    const emitted = listFiles(emittedRoot);
    if (emitted.length === 0) throw new Error("TypeScript emitted no artifact files");
    const digest = sha256CanonicalJson({ files: emittedRows(emittedRoot) });
    if (mode === "write") writeCommitted(emittedRoot, emitted);
    generateContractFixtures(generatedContractRoot, digest);
    const expectedManifest = constructManifest(emittedRoot, generatedContractRoot);

    if (mode === "write") {
      fs.writeFileSync(manifestPath, manifestBytes(expectedManifest));
    } else {
      const committed = loadManifest();
      compareEmitted(emittedRoot, committed.emitted);
      compareGeneratedContract(generatedContractRoot);
      if (
        !Buffer.from(manifestBytes(expectedManifest)).equals(bytes(manifestPath))
      ) {
        throw new Error("artifact manifest is not reproducible from the declared closure");
      }
    }
  } finally {
    fs.rmSync(ownedTemp, { recursive: true, force: true });
    fs.rmSync(buildConfigPath, { force: true });
  }
}

await main();
