import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "template-manifest.json");
const enrollmentPath = path.join(root, "docs", "QUEUE-ENROLLMENT.md");

const requiredSkills = [
  {
    path: "skills/pr-validation/SKILL.md",
    name: "pr-validation",
    required: [
      /exact .*SHA/i,
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

function loadText(relativePath: string): string {
  const absolute = path.join(root, ...relativePath.split("/"));
  if (!fs.existsSync(absolute)) throw new Error(`missing required validation contract: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

function checkSkill(relativePath: string, name: string, required: readonly RegExp[]): string[] {
  const text = loadText(relativePath);
  const errors: string[] = [];
  if (!new RegExp(`^---\\n[\\s\\S]*?^name:\\s*${name}\\s*$[\\s\\S]*?^---$`, "m").test(text)) {
    errors.push(`${relativePath}: canonical frontmatter name must be ${name}`);
  }
  for (const pattern of required) {
    if (!pattern.test(text)) errors.push(`${relativePath}: missing required contract signal ${String(pattern)}`);
  }
  return errors;
}

function main(): void {
  const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!isRecord(parsed)) throw new Error("template-manifest.json must be an object");

  const errors: string[] = [];
  for (const skill of requiredSkills) {
    if (parsed[skill.path] !== "copy") {
      errors.push(`${skill.path}: template-manifest mode must be copy so new/adopted repos receive it`);
    }
    errors.push(...checkSkill(skill.path, skill.name, skill.required));
  }

  const enrollment = loadText(path.relative(root, enrollmentPath).replaceAll("\\", "/"));
  for (const skill of requiredSkills) {
    if (!enrollment.includes(`\`${skill.path}\``)) {
      errors.push(`docs/QUEUE-ENROLLMENT.md must require ${skill.path}`);
    }
  }
  if (!enrollment.includes("FleetRegistryReleaseV1")) {
    errors.push("docs/QUEUE-ENROLLMENT.md must point to FleetRegistryReleaseV1 as the fleet census");
  }

  if (errors.length > 0) {
    console.error("validation-contract skill check failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("validation-contract skills: portable pr/full contracts are copy-classified and enrollment-bound");
}

main();
