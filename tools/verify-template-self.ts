import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedModes = new Set(["copy", "merge", "self", "generated"]);
const portableModes = new Set(["copy", "merge"]);

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function git(...args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function isIgnored(relativePath: string): boolean {
  const result = spawnSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", "--", relativePath],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git check-ignore failed for ${relativePath}: ${result.stderr.trim()}`);
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
  return execFileSync("git", ["hash-object", "-t", "blob", "--stdin"], {
    cwd: root,
    encoding: "utf8",
    input: content,
  }).trim();
}

function portableManifestClosureErrors(
  candidateManifest: Readonly<Record<string, string>>,
  trackedFiles: readonly string[],
): string[] {
  const tracked = new Set(trackedFiles);
  return Object.entries(candidateManifest)
    .filter(([file, mode]) => portableModes.has(mode) && !tracked.has(file))
    .map(([file, mode]) => `${mode}:${file}`)
    .sort(compare);
}

function isConflictMarker(line: string): boolean {
  return /^(?:<{7}|={7}|>{7})/.test(line);
}

const textFileSelfTestErrors = ([
  ["UTF-8", Buffer.from("portable text", "utf8"), true],
  ["NUL byte", Buffer.from([0x61, 0x00]), false],
] as const)
  .filter(([, content, expected]) => {
    const isText = !content.includes(0);
    return isText !== expected;
  })
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
        conflicts.push(`${relativePath}:${String(index + 1)}:${line}`);
      }
    });
}

const manifest: unknown = JSON.parse(
  fs.readFileSync(path.join(root, "template-manifest.json"), "utf8"),
);
if (!isStringRecord(manifest)) throw new Error("template-manifest.json must map paths to strings");
const trackedFiles = git("ls-files", "-z")
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.replaceAll("\\", "/"));
const candidateFiles = git("ls-files", "--cached", "--others", "--exclude-standard")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((entry) => entry.replaceAll("\\", "/"));
const missing = candidateFiles.filter(
  (file) =>
    !file.startsWith(".ops/archive/") &&
    !file.startsWith(".ops/receipts/") &&
    !file.startsWith("plans/") &&
    manifest[file] === undefined,
);
const invalid = Object.entries(manifest)
  .filter(([, mode]) => !allowedModes.has(mode))
  .map(([file, mode]) => `${file}:${mode}`);
const portableManifestClosureSelfTestErrors = [
  portableManifestClosureErrors(
    {
      "copy.md": "copy",
      "merge.md": "merge",
      "self.md": "self",
      "generated.md": "generated",
    },
    ["copy.md", "merge.md"],
  ).length === 0
    ? undefined
    : "portable manifest closure self-test failed: complete portable tree was rejected",
  JSON.stringify(
    portableManifestClosureErrors(
      { "copy.md": "copy", "merge.md": "merge", "self.md": "self" },
      ["merge.md"],
    ),
  ) === JSON.stringify(["copy:copy.md"])
    ? undefined
    : "portable manifest closure self-test failed: orphan copy path was not rejected",
].filter((error): error is string => error !== undefined);
const portableManifestClosure = portableManifestClosureErrors(manifest, trackedFiles);
const opsReadme = fs.readFileSync(path.join(root, ".ops", "README.md"), "utf8");
const opsPolicyErrors = [
  isIgnored(".ops/README.md")
    ? ".ops/README.md must remain tracked and clone-deliverable"
    : undefined,
  isIgnored(".ops/incidents.jsonl")
    ? ".ops/incidents.jsonl must remain trackable under the binding AGENTS policy"
    : undefined,
  !isIgnored(".ops/concurrency-capture.jsonl")
    ? ".ops/concurrency-capture.jsonl must remain ignored as transient capture state"
    : undefined,
  !opsReadme.includes("../agent-orchestrator/lib/incident-log.mjs")
    ? ".ops/README.md must use the documented sibling incident-log helper path"
    : undefined,
].filter((error): error is string => error !== undefined);

const templateAgents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
const portableCharterHeadings = [
  "Mission",
  "Responsibilities",
  "Non-responsibilities",
  "Current status / readiness",
] as const;
const templateSelfEnd = "<!-- /TEMPLATE-SELF -->";

function validatePortableCharter(text: string): string[] {
  const marker = text.indexOf(templateSelfEnd);
  if (marker < 0) return ["portable charter: TEMPLATE-SELF end marker missing"];
  const payload = text.slice(marker + templateSelfEnd.length);
  const errors: string[] = [];
  let previous = -1;
  for (const heading of portableCharterHeadings) {
    const escaped = heading.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const matches = [...payload.matchAll(new RegExp(`^## ${escaped}$`, "gm"))];
    if (matches.length !== 1) {
      errors.push(`portable charter: expected exactly one ## ${heading}`);
      continue;
    }
    const current = matches[0]?.index ?? -1;
    if (current <= previous) errors.push(`portable charter: heading order invalid at ${heading}`);
    previous = current;
  }
  for (const placeholder of ["{{ONE_LINE_DESCRIPTION}}", "{{RESPONSIBILITIES}}", "{{NON_GOALS}}"] as const) {
    if (!payload.includes(placeholder)) errors.push(`portable charter: missing ${placeholder}`);
  }
  if (!payload.includes("[PRIORITIES.md](./PRIORITIES.md)")) {
    errors.push("portable charter: sibling PRIORITIES.md pointer missing");
  }
  return errors;
}

const portableCharterErrors = validatePortableCharter(templateAgents);
for (const heading of portableCharterHeadings) {
  const marker = templateAgents.indexOf(templateSelfEnd);
  const prefix = templateAgents.slice(0, marker + templateSelfEnd.length);
  const payload = templateAgents.slice(marker + templateSelfEnd.length);
  const damaged = `${prefix}${payload.replace(`## ${heading}`, `[removed ${heading}]`)}`;
  if (!validatePortableCharter(damaged).some((error) => error.includes(heading))) {
    portableCharterErrors.push(`portable charter removal check failed: ${heading}`);
  }
}
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
  const checkerPath = "scripts/lint-user-surface-leaks.ts";
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
  "scripts/lint-user-surface-leaks.ts": "copy",
};
const demotedCheckerManifest = {
  ...userSurfaceLintSyncedBaseline,
  "scripts/lint-user-surface-leaks.ts": "self",
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
  ...portableCharterErrors,
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
  const boundary: unknown = JSON.parse(raw);
  if (!isRecord(boundary)) throw new Error("model-boundary.json must be an object");
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
      if (!Array.isArray(paths[key])) {
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
if (gitBlobId(issueTemplate) !== "4240f23d7b73b35cd0bd92503d1f966d1c0f4a03") {
  boundaryErrors.push("predecessor issue template bytes changed");
}
const workingVersion = fs.readFileSync(path.join(root, "TEMPLATE_VERSION"), "utf8");
if (workingVersion.trim() !== "3.1.0") {
  boundaryErrors.push("TEMPLATE_VERSION must publish inert-seed closure release 3.1.0");
}

if (process.argv.includes("--portable-charter")) {
  if (portableCharterErrors.length > 0) {
    console.error("portable charter:", portableCharterErrors);
    process.exitCode = 1;
  } else {
    console.log(
      `portable charter: ${String(portableCharterHeadings.length)} headings, placeholders, priorities pointer, and removal checks passed`,
    );
  }
} else if (process.argv.includes("--direct-l0-defaults")) {
  if (directL0DefaultErrors.length > 0) {
    console.error("direct-L0 defaults:", directL0DefaultErrors);
    process.exitCode = 1;
  } else {
    console.log(
      `direct-L0 defaults: ${String(requiredDirectL0Defaults.length)} clauses and removal checks passed`,
    );
  }
} else if (
  conflicts.length > 0 ||
  missing.length > 0 ||
  invalid.length > 0 ||
  portableManifestClosureSelfTestErrors.length > 0 ||
  portableManifestClosure.length > 0 ||
  opsPolicyErrors.length > 0 ||
  boundaryErrors.length > 0
) {
  if (conflicts.length > 0) console.error("conflict markers:", conflicts);
  if (missing.length > 0) console.error("unmanifested:", missing);
  if (invalid.length > 0) console.error("invalid manifest modes:", invalid);
  if (portableManifestClosureSelfTestErrors.length > 0) {
    console.error("portable manifest closure self-test:", portableManifestClosureSelfTestErrors);
  }
  if (portableManifestClosure.length > 0) {
    console.error("portable manifest paths absent from tracked tree:", portableManifestClosure);
  }
  if (opsPolicyErrors.length > 0) console.error(".ops policy:", opsPolicyErrors);
  if (boundaryErrors.length > 0) console.error("template boundary:", boundaryErrors);
  process.exitCode = 1;
}
