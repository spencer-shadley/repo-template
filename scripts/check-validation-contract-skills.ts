import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { constructReleasePayloadAt, WORKTREE_REF } from "../tools/release-payload.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const removedSkills = ["skills/pr-validation/SKILL.md", "skills/full-validation/SKILL.md"];
const canonicalProtocol = "spencer-shadley/code:skills/validation-protocol/SKILL.md";
interface FileEntry { path: string; contentBase64?: string }
interface ValidationInput {
  manifest: Record<string, unknown>;
  sourcePaths: string[];
  selection: FileEntry[];
  payload: FileEntry[];
  enrollment: string;
}

function forbiddenPath(value: string): boolean {
  return removedSkills.includes(value) || value.startsWith("vendor/code-validation-protocol/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasProtocolPin(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasProtocolPin);
  if (!isRecord(value)) return false;
  const record = value;
  const identifiesProtocol = Object.values(record).some((entry) =>
    typeof entry === "string" && /validation-protocol/.test(entry),
  );
  if (identifiesProtocol && ("commit" in record || "sha256" in record)) return true;
  return Object.values(record).some(hasProtocolPin);
}

function validate(input: ValidationInput): string[] {
  const errors: string[] = [];
  for (const [surface, paths] of [
    ["manifest", Object.keys(input.manifest)],
    ["source", input.sourcePaths],
    ["selection", input.selection.map((entry) => entry.path)],
    ["payload", input.payload.map((entry) => entry.path)],
  ] as const) {
    for (const entry of paths) if (forbiddenPath(entry)) errors.push(`${surface}: generic validation copy ${entry}`);
  }
  errors.push(...protocolPinErrors(input.payload));
  if (!input.enrollment.includes(canonicalProtocol)) errors.push("enrollment must name the canonical Code validation protocol");
  if (!input.enrollment.includes("repository-owned validation profile")) errors.push("enrollment must preserve the repository-owned validation profile");
  if (!input.enrollment.includes("FleetRegistryReleaseV1")) errors.push("enrollment must name the fleet census");
  return errors;
}

function protocolPinErrors(entries: FileEntry[]): string[] {
  const errors: string[] = [];
  for (const entry of entries) {
    if (!entry.path.endsWith(".json") || !entry.contentBase64) continue;
    let value: unknown;
    try { value = JSON.parse(Buffer.from(entry.contentBase64, "base64").toString("utf8")); }
    catch { continue; }
    if (hasProtocolPin(value)) errors.push(`${entry.path}: validation protocol pin must not be shipped`);
  }
  return errors;
}

function selectionEntries(value: unknown): FileEntry[] {
  if (!Array.isArray(value)) throw new Error("release selection entries must be an array");
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("path" in entry) || typeof entry.path !== "string") {
      throw new Error("release selection entry must name a path");
    }
    return { path: entry.path };
  });
}

function loadInput(): ValidationInput {
  const generated = constructReleasePayloadAt(WORKTREE_REF);
  const manifest: unknown = JSON.parse(fs.readFileSync(path.join(root, "template-manifest.json"), "utf8"));
  if (!isRecord(manifest)) throw new Error("template manifest must be an object");
  const sourcePaths = removedSkills.filter((entry) => fs.existsSync(path.join(root, entry)));
  const vendor = path.join(root, "vendor/code-validation-protocol");
  if (fs.existsSync(vendor)) sourcePaths.push("vendor/code-validation-protocol/");
  return {
    manifest,
    sourcePaths,
    selection: selectionEntries(generated.selection["entries"]),
    payload: [...generated.payload.entries],
    enrollment: fs.readFileSync(path.join(root, "docs/QUEUE-ENROLLMENT.md"), "utf8"),
  };
}

function selfTest(): void {
  const base = loadInput();
  assert.deepEqual(validate(base), []);
  for (const skill of removedSkills) {
    const manifest = structuredClone(base); manifest.manifest[skill] = "copy";
    assert.ok(validate(manifest).some((error) => error.startsWith("manifest:")));
    const source = structuredClone(base); source.sourcePaths.push(skill);
    assert.ok(validate(source).some((error) => error.startsWith("source:")));
    const selection = structuredClone(base); selection.selection.push({ path: skill });
    assert.ok(validate(selection).some((error) => error.startsWith("selection:")));
    const payload = structuredClone(base); payload.payload.push({ path: skill });
    assert.ok(validate(payload).some((error) => error.startsWith("payload:")));
  }
  const vendor = structuredClone(base); vendor.sourcePaths.push("vendor/code-validation-protocol/SKILL.md");
  assert.ok(validate(vendor).length > 0);
  const pin = structuredClone(base);
  pin.payload.push({ path: "skills/composition.json", contentBase64: Buffer.from(JSON.stringify({
    validation: { projectionOf: "validation-protocol", projectionSource: {
      repository: "spencer-shadley/code", path: "skills/validation-protocol/SKILL.md", commit: "a".repeat(40), sha256: "b".repeat(64),
    } },
  })).toString("base64") });
  assert.ok(validate(pin).some((error) => error.includes("protocol pin")));
  const local = structuredClone(base);
  local.payload.push({ path: "contracts/repository-validation.json", contentBase64: Buffer.from(JSON.stringify({
    protocol: canonicalProtocol, commands: ["npm test"], receiptExtras: ["localSuite"],
  })).toString("base64") });
  assert.deepEqual(validate(local), []);
  console.log("validation-contract skills: anti-copy/pin controls and local-profile conservation passed");
}

selfTest();
if (!process.argv.includes("--self-test")) {
  const errors = validate(loadInput());
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("validation-contract skills: source and generated payload do not ship validation protocol copies or pins");
}
