import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  AdoptionShellValidationError,
  materializeAdoptionShellV2,
  validateCapabilityBundleRegistryV2,
  validateDocumentationLinks,
  type MaterializerInput,
  type PayloadEntry,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../..",
);

const FILE_FORMAT_TITLE =
  "ADR-0003: File-format selection (md / json / jsonl / tsv / csv)";
const UNRELATED_TITLE = "ADR-0003: Unrelated local decision";

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

function docEntry(filePath: string, text: string): PayloadEntry {
  return {
    path: filePath,
    kind: "file",
    mode: "100644",
    contentSha256: "0".repeat(64),
    role: "generic-base-text",
    encoding: "utf-8",
    bundleId: null,
    contentBase64: Buffer.from(text, "utf8").toString("base64"),
  };
}

function decodeEntry(
  entries: readonly { path: string; contentBase64: string }[],
  filePath: string,
): string {
  const entry = entries.find((row) => row.path === filePath);
  assert.ok(entry, `missing entry ${filePath}`);
  return Buffer.from(entry.contentBase64, "base64").toString("utf8");
}

/** Same strip as validate-documentation: headings and titled links may keep ADR-NNNN. */
function withoutAdrHeadingsOrLinks(text: string): string {
  return text
    .replace(/^# ADR-\d{4}:[^\n]*$/gm, "")
    .replace(/\[[^\]]*\bADR-\d{4}\b[^\]]*\]\([^)]*\)/g, "");
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
    assert.ok(
      /no user surface configured|explicitly declared none/.test(configOutput.join("\n")),
      configOutput.join("\n"),
    );
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

test("issue #93 fails before on bare ADR / checkout-depth links, passes after titled portable docs", () => {
  const unrelated = docEntry(
    "docs/adr/0003-unrelated-local-decision.md",
    `# ${UNRELATED_TITLE}\n\nThis local decision is intentionally unrelated.\n`,
  );
  const templateAdr = docEntry(
    "docs/adr/template-file-format-selection.md",
    `# ${FILE_FORMAT_TITLE}\n\nTemplate-owned decision.\n`,
  );

  // BEFORE: bare "Per ADR-0003" silently rebinds to any local ADR 0003 after adoption.
  const bareBefore = validateDocumentationLinks([
    docEntry(
      "docs/INCIDENTS.md",
      "# Incidents\n\nPer ADR-0003, JSONL is the incident authority.\n",
    ),
    unrelated,
  ]);
  assert.ok(
    bareBefore.some((row) => row.code === "E_DOC_BARE_ADR"),
    `expected E_DOC_BARE_ADR, got ${JSON.stringify(bareBefore)}`,
  );

  // BEFORE: nested checkout at C:\\code\\repos\\<repo> makes ../../agent-orchestrator miss.
  const nestedCheckoutBefore = validateDocumentationLinks([
    docEntry(
      "docs/INCIDENTS.md",
      "# Incidents\n\nSee [fleet incidents](../../agent-orchestrator/docs/INCIDENTS.md).\n",
    ),
  ]);
  assert.ok(
    nestedCheckoutBefore.some((row) => row.code === "E_DOC_CHECKOUT_LINK"),
    `expected E_DOC_CHECKOUT_LINK, got ${JSON.stringify(nestedCheckoutBefore)}`,
  );

  // BEFORE: wrong linked title against the unrelated local ADR 0003 fails closed.
  const wrongTitleBefore = validateDocumentationLinks([
    docEntry(
      "docs/INCIDENTS.md",
      `# Incidents\n\nPer [${FILE_FORMAT_TITLE}](adr/0003-unrelated-local-decision.md), JSONL.\n`,
    ),
    unrelated,
  ]);
  assert.ok(
    wrongTitleBefore.some((row) => row.code === "E_DOC_ADR_TITLE"),
    `expected E_DOC_ADR_TITLE, got ${JSON.stringify(wrongTitleBefore)}`,
  );

  // AFTER: titled link + unrelated local ADR 0003 materializes without false attribution.
  const input = readJson<MaterializerInput>(
    "contracts/adoption-shell-v2/fixtures/portable-docs-input.json",
  );
  const result = materializeAdoptionShellV2(input);
  const paths = new Set(result.entries.map((entry) => entry.path));
  assert.ok(paths.has("docs/adr/0003-unrelated-local-decision.md"));
  assert.ok(paths.has("docs/adr/template-file-format-selection.md"));
  assert.ok(paths.has("docs/INCIDENTS.md"));

  const materializedIncidents = decodeEntry(result.entries, "docs/INCIDENTS.md");
  assert.match(
    materializedIncidents,
    /\[ADR-0003: File-format selection \(md \/ json \/ jsonl \/ tsv \/ csv\)\]\(adr\/template-file-format-selection\.md\)/,
  );
  assert.doesNotMatch(materializedIncidents, /\bPer ADR-\d{4}\b/);
  assert.doesNotMatch(materializedIncidents, /(?:\.\.\/)+agent-orchestrator\//);
  assert.doesNotMatch(materializedIncidents, /Unrelated local decision/);
  assert.deepEqual(
    validateDocumentationLinks(result.entries.filter((entry) => entry.path.endsWith(".md"))),
    [],
  );

  // Committed negative fixtures: materialize fails before with the exact class codes.
  const negatives = readJson<
    readonly {
      readonly name: string;
      readonly expectedCodes: readonly string[];
      readonly input: MaterializerInput;
    }[]
  >("contracts/adoption-shell-v2/fixtures/negative-inputs.json");
  for (const [name, code] of [
    ["bare-adr-authority", "E_DOC_BARE_ADR"],
    ["checkout-depth-link", "E_DOC_CHECKOUT_LINK"],
  ] as const) {
    const fixture = negatives.find((row) => row.name === name);
    assert.ok(fixture, name);
    assert.ok(fixture.expectedCodes.includes(code), name);
    try {
      materializeAdoptionShellV2(fixture.input);
      assert.fail(`${name} unexpectedly materialized`);
    } catch (error) {
      assert.ok(error instanceof AdoptionShellValidationError, name);
      assert.ok(
        error.diagnostics.some((row) => row.code === code),
        `${name} missing ${code}: ${JSON.stringify(error.diagnostics)}`,
      );
    }
  }

  // Live template docs keep the portable class (no bare ADR authority, no depth-relative fleet path).
  const incidents = fs.readFileSync(path.join(root, "docs", "INCIDENTS.md"), "utf8");
  assert.doesNotMatch(incidents, /(?:\.\.\/)+agent-orchestrator\//);
  assert.doesNotMatch(incidents, /\bPer ADR-\d{4}\b/);
  assert.doesNotMatch(withoutAdrHeadingsOrLinks(incidents), /\bADR-\d{4}\b/);
  assert.match(incidents, /https:\/\/github\.com\/[^)]+\/agent-orchestrator\//);
  assert.match(
    incidents,
    /\[ADR-0003: File-format selection \(md \/ json \/ jsonl \/ tsv \/ csv\)\]/,
  );
  const storage = fs.readFileSync(
    path.join(root, "docs", "adr", "0004-when-to-use-a-real-database.md"),
    "utf8",
  );
  assert.doesNotMatch(withoutAdrHeadingsOrLinks(storage), /\bADR-\d{4}\b/);
  const migration = fs.readFileSync(path.join(root, "docs", "MIGRATION.md"), "utf8");
  assert.match(migration, /Copied template ADRs retain their original identity/);
  assert.match(migration, /explicitly supersedes the inherited decision by exact title/);

  // Title-link validator accepts the correct after-fix binding used by the fixture.
  assert.deepEqual(
    validateDocumentationLinks([
      docEntry(
        "docs/INCIDENTS.md",
        `# Incidents\n\nPer [${FILE_FORMAT_TITLE}](adr/template-file-format-selection.md), JSONL.\nSee [fleet](https://github.com/spencer-shadley/agent-orchestrator/blob/master/docs/INCIDENTS.md).\n`,
      ),
      unrelated,
      templateAdr,
    ]),
    [],
  );
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
