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

  const configuredRef = process.env["REPO_QUALITY_NPM_REF"] ?? process.env["GITHUB_HEAD_REF"];
  const branch = runGit(["branch", "--show-current"]);
  const ref = configuredRef ?? (branch || runGit(["rev-parse", "HEAD"]));
  return `github:spencer-shadley/repo-template#${ref}&path:${packagePath}`;
}

function readPackageJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
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

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["install", "--no-audit", "--no-fund"], {
    cwd: consumerRoot,
    encoding: "utf8",
    stdio: "inherit",
  });

  const installedPackagePath = join(consumerRoot, "node_modules", ...packageName.split("/"));
  const installedManifestPath = join(installedPackagePath, "package.json");
  if (!existsSync(installedManifestPath)) {
    throw new Error(`npm install completed without ${packageName}/package.json`);
  }
  const installedPackage = readPackageJson(installedManifestPath);
  if (installedPackage["name"] !== packageName) {
    throw new Error(`installed package name mismatch: ${String(installedPackage["name"])}`);
  }

  execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    `import { qualityRules } from ${JSON.stringify(packageName)}; if (typeof qualityRules !== "function") process.exit(1);`,
  ], { cwd: consumerRoot, stdio: "inherit" });

  console.log(`repo-quality npm conformance passed (${spec})`);
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}
