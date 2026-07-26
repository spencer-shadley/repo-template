import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedModes = new Set(["copy", "merge", "self", "generated"]);
const textExtensions = new Set([
  ".d.ts",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".ts",
  ".yaml",
  ".yml",
]);

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function git(...args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function listTextFiles(): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(resolved);
      else if (
        entry.isFile() &&
        (entry.name === "TEMPLATE_VERSION" ||
          [...textExtensions].some((extension) => entry.name.endsWith(extension)))
      ) {
        files.push(path.relative(root, resolved).split(path.sep).join("/"));
      }
    }
  };
  visit(root);
  return files.sort(compare);
}

function gitBlobId(content: Uint8Array): string {
  const header = Buffer.from(`blob ${content.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(content).digest("hex");
}

function isConflictMarker(line: string): boolean {
  return /^(?:<{7}|={7}|>{7})/.test(line);
}

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

const boundaryErrors: string[] = [
  ...directL0DefaultErrors,
  ...conflictMarkerSelfTestErrors,
];
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
const headVersion = git("show", "HEAD:TEMPLATE_VERSION");
const workingVersion = fs.readFileSync(path.join(root, "TEMPLATE_VERSION"), "utf8");
if (headVersion !== workingVersion) boundaryErrors.push("TEMPLATE_VERSION changed");

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
