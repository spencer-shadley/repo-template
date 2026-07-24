import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  materializeAdoptionShellV2,
  validateCapabilityBundleRegistryV2,
  type MaterializerInput,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../..",
);

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

test("issue #92 bundle materializes both advertised modes from exact closure", async () => {
  const input = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/user-surface-lint-input.json",
  );
  assert.equal(validateCapabilityBundleRegistryV2(input.capabilities).ok, true);
  const result = materializeAdoptionShellV2(input);
  const expectedPaths = new Set(result.entries.map((entry) => entry.path));
  const bundle = input.capabilities.bundles[0];
  assert.ok(bundle);
  for (const mode of bundle.modes) {
    assert.ok(expectedPaths.has(mode.entrypoint), mode.id);
    assert.ok(mode.requiredPaths.every((entry) => expectedPaths.has(entry)), mode.id);
  }

  const ownedTemp = fs.mkdtempSync(
    path.join(os.tmpdir(), "repo-template-user-surface-lint-"),
  );
  try {
    for (const entry of result.entries) {
      const destination = path.join(ownedTemp, ...entry.path.split("/"));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, Buffer.from(entry.contentBase64, "base64"));
    }
    const scriptUrl = pathToFileURL(
      path.join(ownedTemp, "scripts", "lint-user-surface-leaks.mjs"),
    ).href;
    const lintModule = (await import(scriptUrl)) as {
      readonly runLint: (options: {
        readonly root: string;
        readonly configPath: string;
        readonly stdout: (line: string) => void;
        readonly stderr: (line: string) => void;
      }) => number;
      readonly selfTest: (
        fixtureRoot?: string,
        stdout?: (line: string) => void,
      ) => void;
    };
    const configOutput: string[] = [];
    assert.equal(
      lintModule.runLint({
        root: ownedTemp,
        configPath: ".user-surface-lint.json",
        stdout: (line) => configOutput.push(line),
        stderr: (line) => configOutput.push(line),
      }),
      0,
    );
    assert.ok(configOutput.join("\n").includes("no user surface configured"));
    const selfTestOutput: string[] = [];
    lintModule.selfTest(ownedTemp, (line) => selfTestOutput.push(line));
    assert.deepEqual(selfTestOutput, ["user-surface-lint: self-test passed"]);
  } finally {
    fs.rmSync(ownedTemp, { recursive: true, force: true });
  }
});

test("issue #92 closure is copy-classified and invocation goldens are exact", () => {
  const templateManifest = readJson<Record<string, string>>("template-manifest.json");
  const input = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/user-surface-lint-input.json",
  );
  for (const entry of input.release.entries.filter((row) => row.bundleId !== null)) {
    assert.equal(templateManifest[entry.path], "copy", entry.path);
  }
  const modes = readJson<{
    readonly modes: readonly { readonly id: string; readonly invocation: string }[];
  }>("contracts/adoption-shell-v2/golden/user-surface-lint-modes.json");
  assert.deepEqual(modes.modes, [
    {
      id: "config",
      invocation:
        "node scripts/lint-user-surface-leaks.mjs --config .user-surface-lint.json",
    },
    {
      id: "self-test",
      invocation: "node scripts/lint-user-surface-leaks.mjs --self-test",
    },
  ]);
});

test("issue #93 portable docs bind exact titles despite an unrelated local ADR", () => {
  const input = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/portable-docs-input.json",
  );
  const result = materializeAdoptionShellV2(input);
  const paths = new Set(result.entries.map((entry) => entry.path));
  assert.ok(paths.has("docs/adr/0003-unrelated-local-decision.md"));
  assert.ok(paths.has("docs/adr/template-file-format-selection.md"));
  assert.ok(paths.has("docs/INCIDENTS.md"));

  const incidents = fs.readFileSync(path.join(root, "docs", "INCIDENTS.md"), "utf8");
  assert.doesNotMatch(incidents, /(?:\.\.\/)+agent-orchestrator\//);
  assert.match(incidents, /https:\/\/github\.com\/[^)]+\/agent-orchestrator\//);
  assert.match(
    incidents,
    /\[ADR-0003: File-format selection \(md \/ json \/ jsonl \/ tsv \/ csv\)\]/,
  );
  const migration = fs.readFileSync(path.join(root, "docs", "MIGRATION.md"), "utf8");
  assert.match(migration, /Copied template ADRs retain their original identity/);
  assert.match(migration, /explicitly supersedes the inherited decision by exact title/);
});

test("synthetic v2 payloads contain no local intake override or pre-custody workflow", () => {
  for (const name of [
    "minimal-input.json",
    "multi-bundle-input.json",
    "portable-docs-input.json",
    "user-surface-lint-input.json",
  ]) {
    const input = readJson<MaterializerInput>(
      `contracts/adoption-shell-v2/fixtures/${name}`,
    );
    assert.ok(
      input.release.entries.every(
        (entry) =>
          !entry.path.toLowerCase().startsWith(".github/issue_template/"),
      ),
      name,
    );
    assert.equal(input.conformance.noPreCustodyWorkflows, true, name);
    assert.ok(
      input.release.entries.every(
        (entry) =>
          !entry.path.toLowerCase().startsWith(".github/workflows/"),
      ),
      name,
    );
  }
});
