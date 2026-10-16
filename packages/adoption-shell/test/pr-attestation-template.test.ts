import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderPortablePrTemplate, checkPortablePrTemplate, writePortablePrTemplate } from "../../../tools/pr-attestation-template.ts";
import { constructReleasePayloadAt, WORKTREE_REF, assertPrTemplateProjection } from "../../../tools/release-payload.ts";
import { materializeAdoptionShellV2, validateCapabilityBundleRegistryV2, validateMaterializerInputV2 } from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function fakeProducer(base: string, revision: string): string {
  const code = path.join(base, revision); fs.mkdirSync(path.join(code, "contracts"), { recursive: true });
  const contract = { fixtureOnly: true, revision };
  fs.writeFileSync(path.join(code, "contracts/pr-attestation.v1.json"), JSON.stringify(contract));
  const digest = `sha256:${createHash("sha256").update(JSON.stringify(contract)).digest("hex")}`;
  fs.writeFileSync(path.join(code, "contracts/pr-attestation.ts"),
    `export const PR_ATTESTATION_CONTRACT_DIGEST=${JSON.stringify(digest)};\n` +
    `export function renderPrTemplate(){return ${JSON.stringify(`<!-- governed-pr-attestation:v1 -->\nFIXTURE-${revision}\n<!-- /governed-pr-attestation:v1 -->`)};}\n`);
  return code;
}

void test("projection uses the producer verbatim, detects a future revision and permits intentional adoption", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt460-projection-"));
  try {
    const first = fakeProducer(dir, "first"); const next = fakeProducer(dir, "next");
    const template = path.join(dir, "template.md");
    fs.writeFileSync(template, await renderPortablePrTemplate(first));
    fs.appendFileSync(template, "\n## Repository context\nLocal commands and evidence.\n");
    assert.equal(await checkPortablePrTemplate(first, template), true);
    assert.equal(await checkPortablePrTemplate(next, template), false);
    await writePortablePrTemplate(next, template);
    assert.equal(await checkPortablePrTemplate(next, template), true);
    assert.match(fs.readFileSync(template, "utf8"), /FIXTURE-next/);
    assert.match(fs.readFileSync(template, "utf8"), /## Repository context/);
    assert.equal(fs.readFileSync(template, "utf8").includes("FIXTURE-first"), false);
    await assert.rejects(renderPortablePrTemplate(path.join(dir, "absent")));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

void test("normal materialization preserves the exact generated template bytes", () => {
  const read = (relative: string): unknown => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  const capabilities = validateCapabilityBundleRegistryV2(read("contracts/adoption-shell-v2/capability-bundle-registry.json"));
  const input = validateMaterializerInputV2(read("contracts/adoption-shell-v2/fixtures/minimal-input.json"));
  if (!capabilities.ok || !input.ok) throw new Error("normal materializer fixtures must validate");
  const generated = constructReleasePayloadAt(WORKTREE_REF);
  const result = materializeAdoptionShellV2({ ...input.value, release: generated.payload, capabilities: capabilities.value, requestedBundles: [] });
  const entry = result.entries.find((item) => item.path === ".github/pull_request_template.md");
  if (!entry) throw new Error("normal materializer must include the PR template");
  const actual = Buffer.from(entry.contentBase64, "base64").toString("utf8");
  assert.equal(actual, fs.readFileSync(path.join(root, ".github/pull_request_template.md"), "utf8"));
  assert.equal((actual.match(/<!-- governed-pr-attestation:v1 -->/g) ?? []).length, 1);
  assert.match(actual, /Generation: PENDING/);
  assert.equal((actual.match(/— PENDING —/g) ?? []).length, 3);
  assert.match(actual, /## Suggested review prompts/);
});

void test("release projection refuses missing, duplicate and unbound generic template blocks", () => {
  const text = fs.readFileSync(path.join(root, ".github/pull_request_template.md"), "utf8");
  assert.doesNotThrow(() => { assertPrTemplateProjection(text); });
  assert.throws(() => { assertPrTemplateProjection("## Handwritten rubric"); });
  assert.throws(() => { assertPrTemplateProjection(text + "<!-- governed-pr-attestation:v1 -->"); });
  assert.throws(() => { assertPrTemplateProjection(text.replace(/Consumed contract: sha256:[a-f0-9]{64}/, "")); });
});
