import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageName = "@spencer-shadley/repo-quality";
const packageVersion = "1.8.0";
const deterministicIdentity = {
  GIT_AUTHOR_NAME: "repo-template package materializer",
  GIT_AUTHOR_EMAIL: "repo-template-package@invalid.example",
  GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "repo-template package materializer",
  GIT_COMMITTER_EMAIL: "repo-template-package@invalid.example",
  GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function git(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync("git", args, { cwd: root, env, encoding: "utf8" }).trim();
}

export function materializeRepoQualityCommit(sourceCommit = "HEAD"): string {
  const tree = git(["rev-parse", `${sourceCommit}:packages/repo-quality`]);
  const manifest: unknown = JSON.parse(git(["show", `${sourceCommit}:packages/repo-quality/package.json`]));
  if (!isRecord(manifest)) throw new TypeError("repo-quality source manifest must be a JSON object");
  if (manifest["name"] !== packageName || manifest["version"] !== packageVersion) {
    throw new TypeError(
      `repo-quality source identity mismatch: expected ${packageName}@${packageVersion}, got ${String(manifest["name"])}@${String(manifest["version"])}`,
    );
  }
  const commit = git(
    ["commit-tree", tree, "-m", `${packageName}@${packageVersion}`],
    { ...process.env, ...deterministicIdentity },
  );
  const commitRecord = git(["cat-file", "-p", commit]);
  if (!commitRecord.startsWith(`tree ${tree}\n`) || commitRecord.includes("\nparent ")) {
    throw new TypeError("materialized repo-quality commit must contain the exact package tree with no parent");
  }
  return commit;
}

if (import.meta.main) {
  const [mode, sourceCommit = "HEAD", targetRef = "refs/tags/repo-quality-v1.8.0"] = process.argv.slice(2);
  if (mode !== "print" && mode !== "publish") {
    throw new TypeError("usage: build-repo-quality-npm.ts <print|publish> [source-commit] [target-ref]");
  }
  const artifactCommit = materializeRepoQualityCommit(sourceCommit);
  if (mode === "publish") {
    execFileSync("git", ["push", "origin", `${artifactCommit}:${targetRef}`], { cwd: root, stdio: "inherit" });
  }
  console.log(JSON.stringify({ packageName, packageVersion, sourceCommit, artifactCommit, ...(mode === "publish" && { targetRef }) }));
}
