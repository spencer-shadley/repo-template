import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ENVELOPE_DIGEST_ALGORITHM,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  sha256Bytes,
  sha256CanonicalJson,
  validateArtifactManifestV2,
  validateCapabilityBundleRegistryV2,
  validateMaterializerInputV2,
  validateMaterializerOutputManifestV2,
  validateVerificationReceiptV2,
  type ArtifactManifest,
  type FileClosureRow,
} from "../packages/adoption-shell/src/index.ts";
import { scanPublicCode } from "./artifact-policy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, "artifacts", "adoption-shell-v2");
const manifestPath = path.join(artifactRoot, "artifact-manifest.json");
const sourceRoot = path.join(root, "packages", "adoption-shell", "src");
const schemaRoot = path.join(root, "contracts", "adoption-shell-v2");
const SCHEMA_FILES = [
  "artifact-manifest.schema.json",
  "capability-bundle.schema.json",
  "materializer-input.schema.json",
  "materializer-output-manifest.schema.json",
  "release-payload-set.schema.json",
  "verification-receipt.schema.json",
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

function row(relativePath: string): FileClosureRow {
  const content = bytes(path.join(root, ...relativePath.split("/")));
  return {
    path: relativePath,
    kind: "file",
    mode: "100644",
    sha256: sha256Bytes(content),
    bytes: content.byteLength,
  };
}

function tempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "repo-template-adoption-shell-v2-"));
}

function compile(outDir: string): readonly string[] {
  const compiler = path.join(root, "node_modules", "typescript", "bin", "tsc");
  execFileSync(
    process.execPath,
    [
      compiler,
      "-p",
      path.join(root, "tsconfig.build.json"),
      "--outDir",
      outDir,
    ],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  return listFiles(outDir);
}

function compareEmitted(tempRoot: string, expected: readonly FileClosureRow[]): void {
  const actualPaths = listFiles(tempRoot);
  const expectedPaths = expected.map((entry) => entry.path);
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      `emitted path set mismatch\nexpected ${JSON.stringify(expectedPaths)}\nactual ${JSON.stringify(actualPaths)}`,
    );
  }
  for (const expectedRow of expected) {
    const actual = bytes(path.join(tempRoot, ...expectedRow.path.split("/")));
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

function verifyRows(rows: readonly FileClosureRow[]): void {
  for (const expected of rows) {
    const resolved = path.join(root, ...expected.path.split("/"));
    if (!fs.existsSync(resolved)) throw new Error(`closure path is missing: ${expected.path}`);
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
      for (const [key, child] of Object.entries(value)) visit(child, `${pointer}/${key}`);
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

function verifyJsonClosure(manifest: ArtifactManifest): void {
  for (const closureRow of [...manifest.schemas, ...manifest.fixtures, ...manifest.goldens]) {
    if (closureRow.path.endsWith(".json")) {
      JSON.parse(fs.readFileSync(path.join(root, ...closureRow.path.split("/")), "utf8"));
    }
  }
  const contract = path.join(root, "contracts", "adoption-shell-v2");
  const registry = JSON.parse(
    fs.readFileSync(path.join(contract, "capability-bundle-registry.json"), "utf8"),
  );
  if (!validateCapabilityBundleRegistryV2(registry).ok) {
    throw new Error("committed capability bundle registry is invalid");
  }
  for (const name of [
    "minimal-input.json",
    "multi-bundle-input.json",
    "portable-docs-input.json",
    "user-surface-lint-input.json",
  ]) {
    const value = JSON.parse(
      fs.readFileSync(path.join(contract, "fixtures", name), "utf8"),
    );
    if (!validateMaterializerInputV2(value).ok) {
      throw new Error(`${name} is not a valid materializer input`);
    }
  }
  const minimalOutput = JSON.parse(
    fs.readFileSync(path.join(contract, "golden", "minimal-output.json"), "utf8"),
  );
  if (!validateMaterializerOutputManifestV2(minimalOutput.manifest).ok) {
    throw new Error("minimal output golden has an invalid manifest");
  }
  const receipt = JSON.parse(
    fs.readFileSync(path.join(contract, "golden", "deterministic-receipt.json"), "utf8"),
  );
  if (!validateVerificationReceiptV2(receipt).ok) {
    throw new Error("deterministic verification receipt is invalid");
  }
}

function verifyPackage(): void {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const expectedDev = {
    "@types/node": "24.13.3",
    typescript: "7.0.2",
  };
  if (
    packageJson.private !== true ||
    packageJson.type !== "module" ||
    packageJson.packageManager !== "pnpm@11.17.0" ||
    packageJson.engines?.node !== ">=24.16.0 <25" ||
    packageJson.dependencies !== undefined ||
    JSON.stringify(packageJson.devDependencies) !== JSON.stringify(expectedDev)
  ) {
    throw new Error("package boundary does not match the exact v2 toolchain");
  }
  const npmrc = fs.readFileSync(path.join(root, ".npmrc"), "utf8");
  if (!npmrc.split(/\r?\n/).includes("ignore-scripts=true")) {
    throw new Error(".npmrc must disable install scripts");
  }
}

async function verifyArtifact(): Promise<void> {
  const manifest = loadManifest();
  verifyRows([
    ...manifest.sources,
    ...manifest.schemas,
    ...manifest.emitted,
    ...manifest.fixtures,
    ...manifest.goldens,
  ]);
  verifySchemas(manifest);
  verifyJsonClosure(manifest);
  verifyPackage();
  const expectedArtifactDigest = sha256CanonicalJson({ files: manifest.emitted });
  if (
    manifest.artifactDigestAlgorithm !== ENVELOPE_DIGEST_ALGORITHM ||
    manifest.artifactDigest !== expectedArtifactDigest
  ) {
    throw new Error("artifact aggregate digest mismatch");
  }
  const sourcePaths = manifest.sources.map((entry) => entry.path);
  const emittedPaths = manifest.emitted
    .map((entry) => entry.path)
    .filter((entry) => entry.endsWith(".js"));
  const policyFindings = [
    ...scanPublicCode(root, sourcePaths),
    ...scanPublicCode(path.join(root, "artifacts", "adoption-shell-v2"), emittedPaths),
  ];
  if (policyFindings.length > 0) throw new Error(policyFindings.join("\n"));
  for (const sourcePath of sourcePaths) {
    const lines = fs
      .readFileSync(path.join(root, ...sourcePath.split("/")), "utf8")
      .split(/\r?\n/).length;
    if (lines > 500) throw new Error(`${sourcePath} exceeds 500 lines`);
  }
  const moduleUrl = pathToFileURL(
    path.join(artifactRoot, ...manifest.entrypoint.split("/")),
  ).href;
  const artifact = await import(moduleUrl);
  if (typeof artifact[manifest.validatorExport] !== "function") {
    throw new Error("declared validator export is missing");
  }
}

function writeCommitted(tempRoot: string, emitted: readonly string[]): void {
  fs.mkdirSync(artifactRoot, { recursive: true });
  for (const relativePath of emitted) {
    const destination = path.join(artifactRoot, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(tempRoot, ...relativePath.split("/")), destination);
  }
}

async function main(): Promise<void> {
  const action = process.argv[2];
  if (!["write", "check", "verify"].includes(String(action))) {
    throw new Error("usage: node tools/artifact-build.ts <write|check|verify>");
  }
  if (action === "verify") {
    await verifyArtifact();
    return;
  }
  const ownedTemp = tempDirectory();
  try {
    const emitted = compile(ownedTemp);
    if (action === "write") writeCommitted(ownedTemp, emitted);
    else compareEmitted(ownedTemp, loadManifest().emitted);
  } finally {
    fs.rmSync(ownedTemp, { recursive: true, force: true });
  }
}

await main();
