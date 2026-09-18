import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "template-manifest.json");
const inertSeedManifestPath = path.join(root, "release", "inert-seed-manifest.json");
const releasePayloadSetPath = path.join(root, "release", "release-payload-set.json");
const enrollmentPath = path.join(root, "docs", "QUEUE-ENROLLMENT.md");

interface RequiredSkill {
  readonly path: string;
  readonly name: string;
  readonly required: readonly RegExp[];
}

const requiredSkills: readonly RequiredSkill[] = [
  {
    path: "skills/pr-validation/SKILL.md",
    name: "pr-validation",
    required: [
      /exact .*SHA/is,
      /relevant|affected/i,
      /PASS.*FAIL.*UNABLE/is,
      /Do not automatically run the exhaustive `full-validation` suite before every merge/i,
    ],
  },
  {
    path: "skills/full-validation/SKILL.md",
    name: "full-validation",
    required: [
      /exact commit SHA/i,
      /PASS.*FAIL.*UNABLE/is,
      /older green receipt never proves a newer default tip green/i,
      /fleet routing|fleet routing\/execution|existing fleet routing/i,
    ],
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEntriesArray(manifest: Record<string, unknown>): readonly Record<string, unknown>[] {
  const entries = manifest["entries"];
  if (!Array.isArray(entries)) return [];
  return entries.filter(isRecord);
}

function sha256Bytes(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

interface SkillSourceFile {
  readonly path: string;
  readonly text: string;
  readonly bytes: Buffer;
  readonly sha256: string;
}

interface ValidationSkillsInput {
  readonly templateManifest: Record<string, unknown>;
  readonly inertSeedManifest: Record<string, unknown>;
  readonly releasePayloadSet: Record<string, unknown>;
  readonly enrollmentText: string;
  readonly skillFiles: ReadonlyMap<string, SkillSourceFile>;
}

function checkSkillContract(
  skillFile: SkillSourceFile,
  name: string,
  required: readonly RegExp[],
): string[] {
  const errors: string[] = [];
  const frontmatterPattern = new RegExp(
    String.raw`^---\n[\s\S]*?^name:\s*${name}\s*$[\s\S]*?^---$`,
    "m",
  );
  if (!frontmatterPattern.test(skillFile.text)) {
    errors.push(`${skillFile.path}: canonical frontmatter name must be ${name}`);
  }
  for (const pattern of required) {
    if (!pattern.test(skillFile.text)) {
      errors.push(`${skillFile.path}: missing required contract signal ${String(pattern)}`);
    }
  }
  return errors;
}

function checkSkillInertSeedEntry(
  skillPath: string,
  inertSeedManifest: Record<string, unknown>,
  expectedBytes: Buffer,
  expectedSha256: string,
): string[] {
  const errors: string[] = [];
  const entries = inertSeedManifest["entries"];
  if (!Array.isArray(entries)) {
    errors.push("release/inert-seed-manifest.json entries must be an array");
    return errors;
  }
  const entry = entries.find(
    (e: unknown): e is Record<string, unknown> => isRecord(e) && e["path"] === skillPath,
  );
  if (!entry) {
    errors.push(`${skillPath}: missing from release/inert-seed-manifest.json entries`);
    return errors;
  }
  if (entry["templateMode"] !== "copy") {
    errors.push(
      `${skillPath}: release/inert-seed-manifest.json templateMode must be copy, got ${String(entry["templateMode"])}`,
    );
  }
  if (entry["contentSha256"] !== expectedSha256) {
    errors.push(
      `${skillPath}: release/inert-seed-manifest.json contentSha256 mismatch (expected ${expectedSha256}, got ${String(entry["contentSha256"])})`,
    );
  }
  if (entry["bytes"] !== expectedBytes.byteLength) {
    errors.push(
      `${skillPath}: release/inert-seed-manifest.json byte length mismatch (expected ${String(expectedBytes.byteLength)}, got ${String(entry["bytes"])})`,
    );
  }
  return errors;
}

function checkSkillReleasePayloadEntry(
  skillPath: string,
  releasePayloadSet: Record<string, unknown>,
  expectedBytes: Buffer,
  expectedSha256: string,
): string[] {
  const errors: string[] = [];
  const entries = releasePayloadSet["entries"];
  if (!Array.isArray(entries)) {
    errors.push("release/release-payload-set.json entries must be an array");
    return errors;
  }
  const entry = entries.find(
    (e: unknown): e is Record<string, unknown> => isRecord(e) && e["path"] === skillPath,
  );
  if (!entry) {
    errors.push(`${skillPath}: missing from release/release-payload-set.json entries`);
    return errors;
  }
  if (entry["kind"] !== "file") {
    errors.push(
      `${skillPath}: release/release-payload-set.json kind must be file, got ${String(entry["kind"])}`,
    );
  }
  if (entry["mode"] !== "100644") {
    errors.push(
      `${skillPath}: release/release-payload-set.json mode must be 100644, got ${String(entry["mode"])}`,
    );
  }
  if (entry["contentSha256"] !== expectedSha256) {
    errors.push(
      `${skillPath}: release/release-payload-set.json contentSha256 mismatch (expected ${expectedSha256}, got ${String(entry["contentSha256"])})`,
    );
  }
  const rawBase64 = entry["contentBase64"];
  if (typeof rawBase64 !== "string") {
    errors.push(`${skillPath}: release/release-payload-set.json contentBase64 must be a string`);
  } else {
    const decoded = Buffer.from(rawBase64, "base64");
    if (!decoded.equals(expectedBytes)) {
      errors.push(
        `${skillPath}: release/release-payload-set.json contentBase64 decoded bytes differ from disk source`,
      );
    }
  }
  return errors;
}

function validateValidationContractSkills(input: ValidationSkillsInput): string[] {
  const errors: string[] = [];

  for (const skill of requiredSkills) {
    if (input.templateManifest[skill.path] !== "copy") {
      errors.push(`${skill.path}: template-manifest mode must be copy so new/adopted repos receive it`);
    }

    const skillFile = input.skillFiles.get(skill.path);
    if (!skillFile) {
      errors.push(`missing required validation contract source: ${skill.path}`);
      continue;
    }

    errors.push(
      ...checkSkillContract(skillFile, skill.name, skill.required),
      ...checkSkillInertSeedEntry(
        skill.path,
        input.inertSeedManifest,
        skillFile.bytes,
        skillFile.sha256,
      ),
      ...checkSkillReleasePayloadEntry(
        skill.path,
        input.releasePayloadSet,
        skillFile.bytes,
        skillFile.sha256,
      ),
    );
  }

  for (const skill of requiredSkills) {
    if (!input.enrollmentText.includes(`\`${skill.path}\``)) {
      errors.push(`docs/QUEUE-ENROLLMENT.md must require ${skill.path}`);
    }
  }
  if (!input.enrollmentText.includes("FleetRegistryReleaseV1")) {
    errors.push("docs/QUEUE-ENROLLMENT.md must point to FleetRegistryReleaseV1 as the fleet census");
  }

  return errors;
}

function loadRepositoryInput(repoRoot: string): ValidationSkillsInput {
  const manifestRaw = fs.readFileSync(path.join(repoRoot, "template-manifest.json"), "utf8");
  const templateManifest: unknown = JSON.parse(manifestRaw);
  if (!isRecord(templateManifest)) throw new Error("template-manifest.json must be an object");

  const inertSeedRaw = fs.readFileSync(path.join(repoRoot, "release", "inert-seed-manifest.json"), "utf8");
  const inertSeedManifest: unknown = JSON.parse(inertSeedRaw);
  if (!isRecord(inertSeedManifest)) throw new Error("release/inert-seed-manifest.json must be an object");

  const releasePayloadRaw = fs.readFileSync(path.join(repoRoot, "release", "release-payload-set.json"), "utf8");
  const releasePayloadSet: unknown = JSON.parse(releasePayloadRaw);
  if (!isRecord(releasePayloadSet)) throw new Error("release/release-payload-set.json must be an object");

  const enrollmentText = fs.readFileSync(path.join(repoRoot, "docs", "QUEUE-ENROLLMENT.md"), "utf8");

  const skillFiles = new Map<string, SkillSourceFile>();
  for (const skill of requiredSkills) {
    const fullPath = path.join(repoRoot, ...skill.path.split("/"));
    if (!fs.existsSync(fullPath)) {
      throw new Error(`missing required validation contract: ${skill.path}`);
    }
    const bytes = fs.readFileSync(fullPath);
    const text = bytes.toString("utf8");
    const sha256 = sha256Bytes(bytes);
    skillFiles.set(skill.path, { path: skill.path, text, bytes, sha256 });
  }

  return {
    templateManifest,
    inertSeedManifest,
    releasePayloadSet,
    enrollmentText,
    skillFiles,
  };
}

function testTemplateManifestRefusal(baseline: ValidationSkillsInput): void {
  const mutated: ValidationSkillsInput = {
    ...baseline,
    templateManifest: { ...baseline.templateManifest, "skills/pr-validation/SKILL.md": "self" },
  };
  const errors = validateValidationContractSkills(mutated);
  assert.ok(
    errors.some((e) => e.includes("skills/pr-validation/SKILL.md: template-manifest mode must be copy")),
    "must refuse non-copy template-manifest mode",
  );
}

function testInertSeedRefusal(baseline: ValidationSkillsInput): void {
  const existingEntries = getEntriesArray(baseline.inertSeedManifest);
  const withoutFull = existingEntries.filter((e) => e["path"] !== "skills/full-validation/SKILL.md");
  const missingErrors = validateValidationContractSkills({
    ...baseline,
    inertSeedManifest: { ...baseline.inertSeedManifest, entries: withoutFull },
  });
  assert.ok(
    missingErrors.some((e) => e.includes("skills/full-validation/SKILL.md: missing from release/inert-seed-manifest.json")),
    "must refuse missing skill from inert-seed-manifest",
  );

  const corruptedSha = existingEntries.map((e) =>
    e["path"] === "skills/pr-validation/SKILL.md" ? { ...e, contentSha256: "0".repeat(64) } : e,
  );
  const shaErrors = validateValidationContractSkills({
    ...baseline,
    inertSeedManifest: { ...baseline.inertSeedManifest, entries: corruptedSha },
  });
  assert.ok(
    shaErrors.some((e) => e.includes("skills/pr-validation/SKILL.md: release/inert-seed-manifest.json contentSha256 mismatch")),
    "must refuse contentSha256 mismatch in inert-seed-manifest",
  );

  const corruptedBytes = existingEntries.map((e) =>
    e["path"] === "skills/pr-validation/SKILL.md" ? { ...e, bytes: 999999 } : e,
  );
  const bytesErrors = validateValidationContractSkills({
    ...baseline,
    inertSeedManifest: { ...baseline.inertSeedManifest, entries: corruptedBytes },
  });
  assert.ok(
    bytesErrors.some((e) => e.includes("skills/pr-validation/SKILL.md: release/inert-seed-manifest.json byte length mismatch")),
    "must refuse byte length mismatch in inert-seed-manifest",
  );
}

function testReleasePayloadRefusal(baseline: ValidationSkillsInput): void {
  const existingEntries = getEntriesArray(baseline.releasePayloadSet);
  const withoutFull = existingEntries.filter((e) => e["path"] !== "skills/full-validation/SKILL.md");
  const missingErrors = validateValidationContractSkills({
    ...baseline,
    releasePayloadSet: { ...baseline.releasePayloadSet, entries: withoutFull },
  });
  assert.ok(
    missingErrors.some((e) => e.includes("skills/full-validation/SKILL.md: missing from release/release-payload-set.json")),
    "must refuse missing skill from release-payload-set",
  );

  const corruptedSha = existingEntries.map((e) =>
    e["path"] === "skills/pr-validation/SKILL.md" ? { ...e, contentSha256: "0".repeat(64) } : e,
  );
  const shaErrors = validateValidationContractSkills({
    ...baseline,
    releasePayloadSet: { ...baseline.releasePayloadSet, entries: corruptedSha },
  });
  assert.ok(
    shaErrors.some((e) => e.includes("skills/pr-validation/SKILL.md: release/release-payload-set.json contentSha256 mismatch")),
    "must refuse contentSha256 mismatch in release-payload-set",
  );

  const corruptedBase64 = existingEntries.map((e) =>
    e["path"] === "skills/pr-validation/SKILL.md"
      ? { ...e, contentBase64: Buffer.from("corrupted bytes").toString("base64") }
      : e,
  );
  const base64Errors = validateValidationContractSkills({
    ...baseline,
    releasePayloadSet: { ...baseline.releasePayloadSet, entries: corruptedBase64 },
  });
  assert.ok(
    base64Errors.some((e) => e.includes("skills/pr-validation/SKILL.md: release/release-payload-set.json contentBase64 decoded bytes differ")),
    "must refuse contentBase64 decoded byte mismatch in release-payload-set",
  );
}

function testContractContentRefusal(baseline: ValidationSkillsInput): void {
  const originalFile = baseline.skillFiles.get("skills/pr-validation/SKILL.md");
  if (!originalFile) throw new Error("baseline missing pr-validation file");
  const mutatedSkillFiles = new Map(baseline.skillFiles);
  const text = originalFile.text.replace("name: pr-validation", "name: wrong-name");
  const bytes = Buffer.from(text, "utf8");
  mutatedSkillFiles.set("skills/pr-validation/SKILL.md", {
    path: "skills/pr-validation/SKILL.md",
    text,
    bytes,
    sha256: sha256Bytes(bytes),
  });
  const mutated: ValidationSkillsInput = {
    ...baseline,
    skillFiles: mutatedSkillFiles,
  };
  const errors = validateValidationContractSkills(mutated);
  assert.ok(
    errors.some((e) => e.includes("skills/pr-validation/SKILL.md: canonical frontmatter name must be pr-validation")),
    "must refuse frontmatter name mismatch",
  );
}

function testEnrollmentRefusal(baseline: ValidationSkillsInput): void {
  const mutated: ValidationSkillsInput = {
    ...baseline,
    enrollmentText: baseline.enrollmentText.replaceAll("`skills/full-validation/SKILL.md`", "`skills/other/SKILL.md`"),
  };
  const errors = validateValidationContractSkills(mutated);
  assert.ok(
    errors.some((e) => e.includes("docs/QUEUE-ENROLLMENT.md must require skills/full-validation/SKILL.md")),
    "must refuse missing queue enrollment reference",
  );
}

function selfTest(): void {
  const baseline = loadRepositoryInput(root);
  const baselineErrors = validateValidationContractSkills(baseline);
  assert.equal(
    baselineErrors.length,
    0,
    `baseline must have 0 errors, got: ${baselineErrors.join(", ")}`,
  );

  testTemplateManifestRefusal(baseline);
  testInertSeedRefusal(baseline);
  testReleasePayloadRefusal(baseline);
  testContractContentRefusal(baseline);
  testEnrollmentRefusal(baseline);

  console.log("validation-contract skills: self-tests passed (9 negative controls refused)");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  selfTest();

  const repoInput = loadRepositoryInput(root);
  const errors = validateValidationContractSkills(repoInput);

  if (errors.length > 0) {
    console.error("validation-contract skill check failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(
    "validation-contract skills: portable pr/full contracts are copy-classified, enrollment-bound, and released in inert-seed payload with matching content identity",
  );
}

main();
