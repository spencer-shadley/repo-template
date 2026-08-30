import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeRepoQualityCommit } from "./build-repo-quality-npm.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratchRoot = mkdtempSync(join(tmpdir(), "repo-quality-npm-conformance-"));
const consumerRoot = join(scratchRoot, "consumer");
const packageName = "@spencer-shadley/repo-quality";
const packageVersion = "1.8.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be a JSON object`);
  return value;
}

function readPackageJson(path: string): Record<string, unknown> {
  return readRecord(JSON.parse(readFileSync(path, "utf8")) as unknown, path);
}

function npmCommand(args: string[], stdio: "inherit" | "pipe"): string {
  const windows = process.platform === "win32";
  const executable = windows ? (process.env["ComSpec"] ?? "cmd.exe") : "npm";
  const executableArgs = windows ? ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`] : args;
  return execFileSync(executable, executableArgs, {
    cwd: consumerRoot,
    env: {
      ...process.env,
      npm_config_allow_git: "root",
      npm_config_cache: join(scratchRoot, ".npm-cache"),
    },
    stdio,
    encoding: "utf8",
  });
}

try {
  const artifactCommit = materializeRepoQualityCommit("HEAD");
  const gitUrl = `github:spencer-shadley/repo-template#${artifactCommit}`;

  writeFileSync(
    join(scratchRoot, "artifact-receipt.json"),
    `${JSON.stringify({ packageName, packageVersion, artifactCommit, gitUrl }, null, 2)}\n`,
  );
  mkdirSync(consumerRoot, { recursive: true });
  writeFileSync(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({
      name: "repo-quality-npm-consumer-conformance",
      version: "1.0.0",
      private: true,
      dependencies: { [packageName]: gitUrl },
    }, null, 2)}\n`,
  );

  npmCommand(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], "inherit");
  const lock = readPackageJson(join(consumerRoot, "package-lock.json"));
  const lockPackages = readRecord(lock["packages"], "package-lock packages");
  const lockPackage = readRecord(lockPackages[`node_modules/${packageName}`], `package-lock ${packageName}`);
  if (typeof lockPackage["resolved"] !== "string" || !lockPackage["resolved"].endsWith(`#${artifactCommit}`)) {
    throw new TypeError(`package-lock did not resolve the exact artifact commit ${artifactCommit}`);
  }
  npmCommand(["ci", "--ignore-scripts", "--no-audit", "--no-fund"], "inherit");

  const installedPackagePath = join(consumerRoot, "node_modules", ...packageName.split("/"));
  const installedManifestPath = join(installedPackagePath, "package.json");
  if (!existsSync(installedManifestPath)) throw new TypeError(`npm install omitted ${installedManifestPath}`);
  const installedPackage = readPackageJson(installedManifestPath);
  if (installedPackage["name"] !== packageName || installedPackage["version"] !== packageVersion) {
    throw new TypeError(
      `installed identity mismatch: expected ${packageName}@${packageVersion}, got ${String(installedPackage["name"])}@${String(installedPackage["version"])}`,
    );
  }
  const exports = readRecord(installedPackage["exports"], `${packageName} exports`);
  for (const requiredExport of [".", "./knip.mjs", "./jscpd.mjs", "./secret-scan.mjs"]) {
    if (!(requiredExport in exports)) throw new TypeError(`${packageName} is missing export ${requiredExport}`);
  }

  writeFileSync(
    join(consumerRoot, "verify-import.mjs"),
    `const kit = await import(${JSON.stringify(packageName)});\n`
      + `if (!kit.qualityRules) throw new TypeError("qualityRules export missing");\n`,
  );
  execFileSync(process.execPath, [join(consumerRoot, "verify-import.mjs")], { cwd: consumerRoot, stdio: "inherit" });

  const dependencyTree = readRecord(
    JSON.parse(npmCommand(["ls", "--all", "--json"], "pipe")) as unknown,
    "npm ls dependency tree",
  );
  if (Array.isArray(dependencyTree["problems"]) && dependencyTree["problems"].length > 0) {
    throw new TypeError(`npm ls reported problems: ${JSON.stringify(dependencyTree["problems"])}`);
  }

  console.log(`repo-quality npm Git artifact conformance passed (${packageName}@${packageVersion} ${artifactCommit})`);
} finally {
  rmSync(scratchRoot, { recursive: true, force: true });
}
