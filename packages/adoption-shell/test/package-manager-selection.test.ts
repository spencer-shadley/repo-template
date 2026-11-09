// @hermetic-boundary reason="Exercise the real Corepack dispatcher against private fake manager caches with network access disabled; no package install or shared cache is used."
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateLocalCiContractV3 } from "../src/local-ci-contract-v3.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const qualityRequire = createRequire(path.join(root, "packages/repo-quality/package.json"));
const selection = qualityRequire("@spencer-shadley/repo-quality/package-manager-selection.json") as {
  schema: string;
  dispatcher: string;
  manager: string;
  channel: string;
};

function corepackCli(): string | undefined {
  const explicit = process.env["REPO_TEMPLATE_COREPACK_CLI"];
  if (explicit) {
    assert.ok(path.isAbsolute(explicit) && existsSync(explicit), "explicit Corepack CLI must be an existing absolute path");
    return explicit;
  }
  const locations = [
    ...(process.env["COREPACK_ROOT"] ? [path.join(process.env["COREPACK_ROOT"], "dist/corepack.js")] : []),
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/corepack/dist/corepack.js"),
    path.resolve(path.dirname(process.execPath), "node_modules/corepack/dist/corepack.js"),
  ];
  return locations.find((candidate) => existsSync(candidate));
}

void test("the published package export carries one versionless fleet selection", () => {
  assert.deepEqual(selection, {
    schema: "FleetPackageManagerSelectionV1", dispatcher: "corepack", manager: "pnpm", channel: "latest",
  });
  const surface = JSON.parse(readFileSync(path.join(root, "packages/repo-quality/export-surface.json"), "utf8")) as {
    subpathExports: string[];
  };
  assert.ok(surface.subpathExports.includes("./package-manager-selection.json"));
  const manifest = JSON.parse(readFileSync(path.join(root, "template-manifest.json"), "utf8")) as Record<string, unknown>;
  assert.equal(manifest["packages/repo-quality/package-manager-selection.json"], "self",
    "adoption must reference the owner rather than copy a new local selection");
});

void test("released Corepack applies the versionless consumer contract", async (t) => {
  const cli = corepackCli();
  if (!cli) {
    t.skip("Corepack is unavailable; set REPO_TEMPLATE_COREPACK_CLI to the installed dispatcher JS entrypoint");
    return;
  }
  const fixture = mkdtempSync(path.join(tmpdir(), "template-corepack-selection-"));
  let settled = true;
  t.after(() => {
    if (settled) rmSync(fixture, { recursive: true, force: true });
    else t.diagnostic(`Unsettled dispatcher fixture retained at ${fixture}`);
  });
  const checkout = path.join(fixture, "checkout");
  mkdirSync(checkout);
  const manifestPath = path.join(checkout, "package.json");
  const legacyProfile = validateLocalCiContractV3(JSON.parse(
    readFileSync(path.join(root, "contracts/local-ci/v3/fixtures/valid-local-ci-v3.json"), "utf8"),
  ));
  assert.equal(legacyProfile.ok, true);
  const profile = validateLocalCiContractV3({ ...legacyProfile.value,
    environment: { ...legacyProfile.value.environment, packageManager: { name: selection.manager } } });
  assert.equal(profile.ok, true);
  assert.equal(Object.hasOwn(profile.value.environment.packageManager, "version"), false);
  const versionless = { name: "corepack-selection-fixture", private: true,
    devEngines: { packageManager: { ...profile.value.environment.packageManager, onFail: "error" } } };
  const writeManifest = (value: unknown) => writeFileSync(manifestPath, `${JSON.stringify(value, null, 2)}\n`);
  const home = path.join(fixture, "corepack-home");
  const alternateHome = path.join(fixture, "other-corepack-home");
  const fakeVersions = ["99.0.0", "99.1.0"] as const;
  function seedCache(cache: string, selected: string): void {
    for (const version of fakeVersions) {
      const folder = path.join(cache, "v1", selection.manager, version);
      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, ".corepack"), JSON.stringify({
        locator: { name: selection.manager, reference: version },
        bin: { [selection.manager]: "fixture.cjs" }, hash: `sha512.${"0".repeat(128)}`,
      }));
      writeFileSync(path.join(folder, "fixture.cjs"),
        `process.stdout.write(JSON.stringify({ fixtureVersion: ${JSON.stringify(version)}, args: process.argv.slice(2) }) + "\\n");\n`);
    }
    writeFileSync(path.join(cache, "lastKnownGood.json"), JSON.stringify({ [selection.manager]: selected }));
  }
  seedCache(home, fakeVersions[0]);
  seedCache(alternateHome, fakeVersions[1]);
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(?:COREPACK_|npm_config_|pnpm_config_|NODE_OPTIONS$|NODE_PATH$)/iu.test(key)));
  function run(args: string[], cache = home) {
    const result = spawnSync(process.execPath, [cli!, ...args], {
      cwd: checkout, encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024,
      env: { ...env, HOME: fixture, USERPROFILE: fixture, COREPACK_HOME: cache,
        COREPACK_ENABLE_NETWORK: "0", COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", COREPACK_ENV_FILE: "0",
        COREPACK_ENABLE_AUTO_PIN: "0", COREPACK_ENABLE_PROJECT_SPEC: "1", COREPACK_ENABLE_STRICT: "1",
        COREPACK_DEFAULT_TO_LATEST: "0" },
    });
    if (result.error || result.signal || result.status === null) settled = false;
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, null);
    return result;
  }
  function selectedVersion(cache = home): string {
    const result = run([selection.manager, "--version"], cache);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const observed = JSON.parse(result.stdout) as { fixtureVersion: string; args: string[] };
    assert.deepEqual(observed.args, ["--version"]);
    return observed.fixtureVersion;
  }
  const version = run(["--version"]);
  assert.equal(version.status, 0, version.stderr);
  t.diagnostic(`Actual Corepack dispatcher: ${version.stdout.trim()}; manager binaries are explicit private fakes`);

  await t.test("name-only consumers follow Known Good changes without writing a project pin", () => {
    writeManifest(versionless);
    const before = readFileSync(manifestPath, "utf8");
    assert.equal(selectedVersion(), fakeVersions[0]);
    writeFileSync(path.join(home, "lastKnownGood.json"), JSON.stringify({ [selection.manager]: fakeVersions[1] }));
    assert.equal(selectedVersion(), fakeVersions[1]);
    assert.equal(readFileSync(manifestPath, "utf8"), before);
  });
  await t.test("different Corepack homes are distinct selections", () => {
    writeManifest(versionless);
    writeFileSync(path.join(home, "lastKnownGood.json"), JSON.stringify({ [selection.manager]: fakeVersions[0] }));
    assert.equal(selectedVersion(), fakeVersions[0]);
    assert.equal(selectedVersion(alternateHome), fakeVersions[1]);
  });
  await t.test("existing exact pins remain enforced until their owner migrates them", () => {
    writeManifest({ ...versionless, packageManager: `${selection.manager}@${fakeVersions[0]}` });
    assert.equal(selectedVersion(alternateHome), fakeVersions[0]);
  });
  await t.test("manager mismatch and latest-as-an-exact-pin are rejected", () => {
    writeManifest({ ...versionless, devEngines: { packageManager: { name: "yarn", onFail: "error" } } });
    assert.notEqual(run([selection.manager, "install"]).status, 0);
    writeManifest({ ...versionless, packageManager: `${selection.manager}@${selection.channel}` });
    assert.notEqual(run([selection.manager, "install"]).status, 0);
  });
  await t.test("bare corepack install is not a name-only repository readiness command", () => {
    writeManifest(versionless);
    const result = run(["install"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /doesn't feature a 'packageManager' field/u);
  });
});
