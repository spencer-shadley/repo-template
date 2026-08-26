import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const consumerRoot = mkdtempSync(join(tmpdir(), "repo-quality-npm-consumer-"));
const packageName = "@spencer-shadley/repo-quality";
const packagePath = "packages/repo-quality";

function runGit(args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function resolveGitSpec(): string {
  const explicitSpec = process.env["REPO_QUALITY_NPM_SPEC"];
  if (explicitSpec) return explicitSpec;

  return `github:spencer-shadley/repo-template#path:${packagePath}`;
}

function readPackageJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function runNpm(args: string[]): void {
  const windows = process.platform === "win32";
  const executable = windows ? (process.env["ComSpec"] ?? "cmd.exe") : "npm";
  const executableArgs = windows ? ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`] : args;
  execFileSync(executable, executableArgs, {
    cwd: consumerRoot,
    stdio: "inherit",
  });
}

const spec = resolveGitSpec();
try {
  writeFileSync(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({
      name: "repo-quality-npm-consumer-conformance",
      version: "1.0.0",
      private: true,
      dependencies: { [packageName]: spec },
    }, null, 2)}\n`,
  );

  runNpm(["install", "--package-lock-only", "--no-audit", "--no-fund"]);

  const lockPath = join(consumerRoot, "package-lock.json");
  const lock = readPackageJson(lockPath);
  const packages = readRecord(lock["packages"], "package-lock packages");
  const packageEntry = readRecord(
    packages[`node_modules/${packageName}`],
    `package-lock entry for ${packageName}`,
  );
  const commit = process.env["REPO_QUALITY_NPM_COMMIT"] ?? runGit(["rev-parse", "HEAD"]);
  packageEntry["resolved"] = `git+https://github.com/spencer-shadley/repo-template.git#${commit}`;
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  runNpm(["ci", "--no-audit", "--no-fund"]);

  const installedPackagePath = join(consumerRoot, "node_modules", ...packageName.split("/"));
  const installedManifestPath = join(installedPackagePath, "package.json");
  if (!existsSync(installedManifestPath)) {
    throw new Error(`npm install completed without ${packageName}/package.json`);
  }
  const installedPackage = readPackageJson(installedManifestPath);
  if (typeof installedPackage["name"] !== "string") {
    throw new Error(`installed ${packageName}/package.json has no package name`);
  }

  console.log(`repo-quality npm ci conformance passed (${spec})`);
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}
