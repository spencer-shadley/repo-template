import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedModes = new Set(["copy", "merge", "self", "generated"]);

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function git(...args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function listTextFiles(): readonly string[] {
  return git("ls-files", "-z")
    .split("\0")
    .filter(Boolean)
    .filter((relativePath) =>
      !fs.readFileSync(path.join(root, ...relativePath.split("/"))).includes(0),
    )
    .sort(compare);
}

function gitBlobId(content: Uint8Array): string {
  const header = Buffer.from(`blob ${content.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(content).digest("hex");
}

function isConflictMarker(line: string): boolean {
  return /^(?:<{7}|={7}|>{7})/.test(line);
}

const textFileSelfTestErrors = ([
  ["UTF-8", Buffer.from("portable text", "utf8"), true],
  ["NUL byte", Buffer.from([0x61, 0x00]), false],
] as const)
  .filter(([, content, expected]) => !content.includes(0) !== expected)
  .map(([label]) => `text-file self-test failed: ${label}`);

const conflictMarkerSelfTestErrors = ([
  ["opening", "<<<<<<< HEAD", true],
  ["separator", "=======", true],
  ["closing", ">>>>>>> feature", true],
  ["ordinary text", "no conflict here", false],
 ] as const)
  .filter(([, line, expected]) => isConflictMarker(line) !== expected)
  .map(([label]) => `conflict-marker self-test failed: ${label}`);

const conflicts: string[] = [];
for (const relativePath of listTextFiles()) {
  fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (isConflictMarker(line)) {
        conflicts.push(`${relativePath}:${index + 1}:${line}`);
      }
    });
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "template-manifest.json"), "utf8"),
) as Record<string, string>;
const candidateFiles = git("ls-files", "--cached", "--others", "--exclude-standard")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((entry) => entry.replaceAll("\\", "/"));
const missing = candidateFiles.filter(
  (file) =>
    !file.startsWith(".ops/archive/") &&
    !file.startsWith("plans/") &&
    manifest[file] === undefined,
);
const invalid = Object.entries(manifest)
  .filter(([, mode]) => !allowedModes.has(mode))
  .map(([file, mode]) => `${file}:${mode}`);

const templateAgents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
const requiredDirectL0Defaults = [
  [
    "persistent goals disabled pending native guards",
    /persistent goals are disabled for autonomous repo managers and coordinators[\s\S]{0,100}native\s+pre-injection guards exist/i,
  ],
  [
    "one finite heartbeat deliverable and terminal stop",
    /bounded heartbeat wakes exactly one finite deliverable[\s\S]{0,100}paused or\s+no-progress manager stops and never self-requeues/i,
  ],
  [
    "typed coordinator and independent overseer containment",
    /at every poll, the coordinator consumes AO's typed `GoalContinuationDecisionV1` contract[\s\S]{0,180}overseer independently consumes the same contract[\s\S]{0,100}corrects missed containment/i,
  ],
  [
    "Luna-low manager boundary and mechanical allowance",
    /Luna-low is excluded from repo-manager\/coordinator judgment[\s\S]{0,120}bounded mechanical substeps/i,
  ],
] as const;
function validateDirectL0Defaults(text: string): string[] {
  return requiredDirectL0Defaults
    .filter(([, pattern]) => !pattern.test(text))
    .map(([label]) => `missing required direct-L0 default: ${label}`);
}

const directL0DefaultErrors = validateDirectL0Defaults(templateAgents);
for (const [label, pattern] of requiredDirectL0Defaults) {
  const damaged = templateAgents.replace(pattern, `[removed ${label}]`);
  if (
    damaged === templateAgents ||
    !validateDirectL0Defaults(damaged).some((error) => error.includes(label))
  ) {
    directL0DefaultErrors.push(`direct-L0 removal check failed: ${label}`);
  }
}

// Guard against config-without-checker drift (incident: repo-factory received
// .user-surface-lint.json + .user-surface-lint.schema.json via sync but never
// received scripts/lint-user-surface-leaks.mjs, so the config traveled as
// inert configuration with no way to run it). A synced consumer-facing config
// is meaningless without its consuming tool synced alongside it, and a synced
// tool is meaningless without the config it reads. Both directions must be
// declared "copy" together, or neither.
function userSurfaceLintSyncErrors(m: Record<string, string>): string[] {
  const configPaths = [".user-surface-lint.json", ".user-surface-lint.schema.json"];
  const checkerPath = "scripts/lint-user-surface-leaks.mjs";
  const syncedConfigPaths = configPaths.filter((p) => m[p] === "copy");
  const checkerSynced = m[checkerPath] === "copy";
  const errors: string[] = [];
  if (syncedConfigPaths.length > 0 && !checkerSynced) {
    errors.push(
      `user-surface-lint config synced (${syncedConfigPaths.join(", ")}) but ` +
        `${checkerPath} is not manifest "copy" -- config would be orphaned in consuming repos`,
    );
  }
  if (checkerSynced && syncedConfigPaths.length === 0) {
    errors.push(
      `${checkerPath} is manifest "copy" but no user-surface-lint config path is -- ` +
        `checker would have nothing to read in consuming repos`,
    );
  }
  return errors;
}

const userSurfaceLintSyncErrors_ = userSurfaceLintSyncErrors(manifest);
// Self-test: prove the check above actually detects the drift it exists to catch.
// Built from a synthetic known-good baseline (never from the live `manifest`) so
// this self-test's own verdict cannot be corrupted by whatever state the real
// manifest happens to be in -- including the exact broken state it must detect.
const userSurfaceLintSyncedBaseline: Record<string, string> = {
  ".user-surface-lint.json": "copy",
  ".user-surface-lint.schema.json": "copy",
  "scripts/lint-user-surface-leaks.mjs": "copy",
};
const demotedCheckerManifest = {
  ...userSurfaceLintSyncedBaseline,
  "scripts/lint-user-surface-leaks.mjs": "self",
};
const droppedConfigManifest = {
  ...userSurfaceLintSyncedBaseline,
  ".user-surface-lint.json": "self",
  ".user-surface-lint.schema.json": "self",
};
if (userSurfaceLintSyncErrors(userSurfaceLintSyncedBaseline).length !== 0) {
  userSurfaceLintSyncErrors_.push(
    "user-surface-lint sync self-test failed: the synced baseline (config+checker both \"copy\") must not itself report an error",
  );
}
if (userSurfaceLintSyncErrors(demotedCheckerManifest).length === 0) {
  userSurfaceLintSyncErrors_.push(
    "user-surface-lint sync self-test failed: demoting the checker to \"self\" while config stays \"copy\" was not detected",
  );
}
if (userSurfaceLintSyncErrors(droppedConfigManifest).length === 0) {
  userSurfaceLintSyncErrors_.push(
    "user-surface-lint sync self-test failed: demoting the config to \"self\" while the checker stays \"copy\" was not detected",
  );
}

const boundaryErrors: string[] = [
  ...directL0DefaultErrors,
  ...textFileSelfTestErrors,
  ...conflictMarkerSelfTestErrors,
  ...userSurfaceLintSyncErrors_,
];
const planRecordManifestModes: Readonly<Record<string, string>> = {
  "PLAN_TEMPLATE.md": "copy",
  "contracts/plan-record/v1/fixtures/classification-cases.json": "self",
  "contracts/plan-record/v1/plan-record.example.json": "self",
  "contracts/plan-record/v1/plan-record.schema.json": "self",
  "contracts/plan-record/v1/work-migration-manifest.example.json": "self",
  "contracts/plan-record/v1/work-migration-manifest.schema.json": "self",
  "packages/adoption-shell/src/plan-record-v1.ts": "self",
  "packages/adoption-shell/src/work-migration-manifest-v1.ts": "self",
  "packages/adoption-shell/test/plan-record-v1.test.ts": "self",
};
for (const [file, mode] of Object.entries(planRecordManifestModes)) {
  if (manifest[file] !== mode) {
    boundaryErrors.push(`PlanRecordV1 manifest mode must be ${mode}: ${file}`);
  }
}
const planTemplate = fs.readFileSync(path.join(root, "PLAN_TEMPLATE.md"), "utf8");
for (const required of [
  "**Status:** `planned`",
  "**Issue:**",
  "**enqueuedAt:**",
  "**Tier:**",
  "PlanRecordV1 adapter mapping",
]) {
  if (!planTemplate.includes(required)) {
    boundaryErrors.push(`PLAN_TEMPLATE.md missing canonical adapter field: ${required}`);
  }
}
if (manifest["model-boundary.json"] !== "copy") {
  boundaryErrors.push("model-boundary.json must be manifest copy");
}
if (manifest["PRIORITIES.md"] !== "copy") {
  boundaryErrors.push("PRIORITIES.md must be manifest copy");
}
const priorities = fs.readFileSync(path.join(root, "PRIORITIES.md"), "utf8");
if (!priorities.startsWith("# {{NAME}} — priorities, SLI, SLO\n")) {
  boundaryErrors.push("PRIORITIES.md must retain the portable {{NAME}} heading");
}
try {
  const raw = fs.readFileSync(path.join(root, "model-boundary.json"), "utf8");
  if (/TODO\(setup!?\):|\{\{[A-Z0-9_]+\}\}/.test(raw)) {
    boundaryErrors.push("model-boundary.json has unresolved setup placeholders");
  }
  const boundary = JSON.parse(raw) as Record<string, unknown>;
  if (boundary["schemaVersion"] !== 1) boundaryErrors.push("schemaVersion must be 1");
  if (boundary["servesModelTasks"] !== false) {
    boundaryErrors.push("default servesModelTasks must be false");
  }
  if (boundary["directProviderInvocation"] !== "forbidden") {
    boundaryErrors.push("default directProviderInvocation must be forbidden");
  }
  if (boundary["servingProvenanceRequired"] !== true) {
    boundaryErrors.push("servingProvenanceRequired must be true");
  }
  if (
    typeof boundary["ownerRole"] !== "string" ||
    boundary["ownerRole"].trim().length === 0
  ) {
    boundaryErrors.push("ownerRole required");
  }
  const paths = boundary["allowedProviderSpecificPaths"];
  if (paths === null || typeof paths !== "object" || Array.isArray(paths)) {
    boundaryErrors.push("allowedProviderSpecificPaths required");
  } else {
    for (const key of ["adapters", "catalogs", "configuration", "fixtures", "history"]) {
      if (!Array.isArray((paths as Record<string, unknown>)[key])) {
        boundaryErrors.push(`allowedProviderSpecificPaths.${key} must be an array`);
      }
    }
  }
} catch (error) {
  boundaryErrors.push(
    `model-boundary.json parse failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}

const issueTemplate = fs.readFileSync(
  path.join(root, ".github", "ISSUE_TEMPLATE", "task.md"),
);
if (gitBlobId(issueTemplate) !== "1383ad89b6bdccc6369c490d27a8326fa05f49cc") {
  boundaryErrors.push("predecessor issue template bytes changed");
}
const workingVersion = fs.readFileSync(path.join(root, "TEMPLATE_VERSION"), "utf8");
if (workingVersion.trim() !== "3.0.1") {
  boundaryErrors.push("TEMPLATE_VERSION must publish corrected PlanRecordV1 structural release 3.0.1");
}

if (process.argv.includes("--direct-l0-defaults")) {
  if (directL0DefaultErrors.length > 0) {
    console.error("direct-L0 defaults:", directL0DefaultErrors);
    process.exitCode = 1;
  } else {
    console.log(
      `direct-L0 defaults: ${requiredDirectL0Defaults.length} clauses and removal checks passed`,
    );
  }
} else if (
  conflicts.length > 0 ||
  missing.length > 0 ||
  invalid.length > 0 ||
  boundaryErrors.length > 0
) {
  if (conflicts.length > 0) console.error("conflict markers:", conflicts);
  if (missing.length > 0) console.error("unmanifested:", missing);
  if (invalid.length > 0) console.error("invalid manifest modes:", invalid);
  if (boundaryErrors.length > 0) console.error("template boundary:", boundaryErrors);
  process.exitCode = 1;
}
