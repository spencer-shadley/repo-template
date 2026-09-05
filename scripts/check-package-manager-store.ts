#!/usr/bin/env node
/**
 * Fail closed if package-manager cache state (such as .pnpm-store) is placed
 * inside the repository checkout, or if the active package manager store path
 * resolves within the repository root (Issue #108).
 *
 * Keeping package-manager cache state external prevents working tree dirt from
 * blocking autonomous queue reconciliation with (unknown-state).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

function isPathInside(parentDir: string, targetPath: string): boolean {
  let resolvedParent = normalize(resolve(parentDir));
  let resolvedTarget = normalize(resolve(targetPath));

  if (existsSync(resolvedParent)) {
    try {
      resolvedParent = realpathSync(resolvedParent);
    } catch {
      // fallback to resolvedParent
    }
  }
  if (existsSync(resolvedTarget)) {
    try {
      resolvedTarget = realpathSync(resolvedTarget);
    } catch {
      // fallback to resolvedTarget
    }
  }

  if (process.platform === "win32") {
    resolvedParent = resolvedParent.toLowerCase();
    resolvedTarget = resolvedTarget.toLowerCase();
  }

  const rel = relative(resolvedParent, resolvedTarget);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function detectInRepoStoreDirectories(repoRoot: string): string[] {
  const forbiddenStoreDirs = [".pnpm-store", ".npm-cache", ".yarn/cache"];
  const errors: string[] = [];
  for (const storeDirName of forbiddenStoreDirs) {
    const fullPath = join(repoRoot, storeDirName);
    if (existsSync(fullPath)) {
      errors.push(
        `Package manager cache directory '${storeDirName}' was found inside the repository checkout at ${fullPath}. Package manager cache state must remain external to the checkout to prevent working tree dirt and queue reconciliation refusals (unknown-state).`,
      );
    }
  }
  return errors;
}

function resolveActivePnpmStorePath(repoRoot: string): string {
  try {
    if (process.platform === "win32") {
      return execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm", "store", "path"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    }
    return execFileSync("pnpm", ["store", "path"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (error) {
    throw new Error(
      `Failed to resolve active pnpm store path: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function checkGitignoreStoreRules(repoRoot: string): string[] {
  const gitignorePath = join(repoRoot, ".gitignore");
  const errors: string[] = [];
  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, "utf8");
    const lines = gitignoreContent.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]?.trim();
      if (line === ".pnpm-store" || line === ".pnpm-store/") {
        errors.push(
          `.gitignore:${String(i + 1)} ignores '${line}'. Package-manager store state must be externalized rather than ignored in-repo (Issue #108). Blanket or unmonitored cache ignores risk hiding uncontrolled cache trees or source artifacts.`,
        );
      }
    }
  }
  return errors;
}

interface CheckStoreOptions {
  readonly repoRoot: string;
  readonly storePath?: string;
}

function checkStoreLocation({ repoRoot, storePath }: CheckStoreOptions): string[] {
  const resolvedRoot = resolve(repoRoot);
  const errors: string[] = [];

  errors.push(
    ...detectInRepoStoreDirectories(resolvedRoot),
    ...checkGitignoreStoreRules(resolvedRoot),
  );

  let activeStorePath = storePath;
  if (!activeStorePath) {
    try {
      activeStorePath = resolveActivePnpmStorePath(resolvedRoot);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (activeStorePath && isPathInside(resolvedRoot, activeStorePath)) {
    errors.push(
      `Active pnpm store path '${activeStorePath}' is inside repository checkout '${resolvedRoot}'. The package manager store must be externalized (e.g. in the user cache directory) to keep the canonical working tree clean.`,
    );
  }

  return errors;
}

function selfTest(): void {
  const tempDir = mkdtempSync(join(tmpdir(), "check-pnpm-store-test-"));
  try {
    const externalStore = join(tempDir, "external-store");
    mkdirSync(externalStore, { recursive: true });

    const fakeRepo = join(tempDir, "fake-repo");
    mkdirSync(fakeRepo, { recursive: true });

    // 1. External store passes
    const goodErrors = checkStoreLocation({
      repoRoot: fakeRepo,
      storePath: externalStore,
    });
    if (goodErrors.length !== 0) {
      throw new Error(`self-test failed: valid external store reported errors: ${JSON.stringify(goodErrors)}`);
    }

    // 2. In-repo store path is rejected
    const inRepoStore = join(fakeRepo, ".pnpm-store");
    const inRepoErrors = checkStoreLocation({
      repoRoot: fakeRepo,
      storePath: inRepoStore,
    });
    if (inRepoErrors.every((e) => !e.includes("is inside repository checkout"))) {
      throw new Error("self-test failed: in-repo store path was not rejected");
    }

    // 3. Repo root as store path is rejected
    const rootAsStoreErrors = checkStoreLocation({
      repoRoot: fakeRepo,
      storePath: fakeRepo,
    });
    if (rootAsStoreErrors.every((e) => !e.includes("is inside repository checkout"))) {
      throw new Error("self-test failed: repo root as store path was not rejected");
    }

    // 4. Physical in-repo .pnpm-store directory is detected and rejected
    mkdirSync(join(fakeRepo, ".pnpm-store"), { recursive: true });
    const dirErrors = checkStoreLocation({
      repoRoot: fakeRepo,
      storePath: externalStore,
    });
    if (dirErrors.every((e) => !e.includes("found inside the repository checkout"))) {
      throw new Error("self-test failed: existing in-repo .pnpm-store directory was not detected");
    }
    rmSync(join(fakeRepo, ".pnpm-store"), { recursive: true, force: true });

    // 5. In-repo .gitignore ignore for .pnpm-store is rejected
    writeFileSync(join(fakeRepo, ".gitignore"), ".pnpm-store/\n", "utf8");
    const gitignoreErrors = checkStoreLocation({
      repoRoot: fakeRepo,
      storePath: externalStore,
    });
    if (gitignoreErrors.every((e) => !e.includes(".gitignore"))) {
      throw new Error("self-test failed: .gitignore rule for .pnpm-store was not rejected");
    }
    rmSync(join(fakeRepo, ".gitignore"), { force: true });

    // 6. Negative fixture: planted unexpected source file fails git status check (fails closed)
    const gitInit = spawnSync("git", ["init", "--initial-branch=master"], { cwd: fakeRepo, encoding: "utf8" });
    if (gitInit.status === 0) {
      writeFileSync(join(fakeRepo, "planted-unexpected.ts"), "export const x = 1;\n", "utf8");
      const statusOut = spawnSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: fakeRepo, encoding: "utf8" });
      if (!statusOut.stdout.includes("planted-unexpected.ts")) {
        throw new Error("self-test failed: planted unexpected source file was unexpectedly hidden from git status");
      }
    }

    // 7. Real repository passes
    const realRepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const realErrors = checkStoreLocation({ repoRoot: realRepoRoot });
    if (realErrors.length !== 0) {
      throw new Error(`self-test failed: real repository reported errors: ${JSON.stringify(realErrors)}`);
    }

    console.log("check-package-manager-store: self-test passed");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url;

function runCheck(repoRoot: string): void {
  try {
    const errors = checkStoreLocation({ repoRoot });
    if (errors.length > 0) {
      console.error("check-package-manager-store: FAIL");
      for (const e of errors) console.error(`  - ${e}`);
      process.exitCode = 1;
    } else {
      console.log("check-package-manager-store: ok -- package-manager store is external and no in-repo cache exists");
    }
  } catch (error) {
    console.error(`check-package-manager-store: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    try {
      selfTest();
    } catch (error) {
      console.error(`check-package-manager-store: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    return;
  }
  const pathArg = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const repoRoot = pathArg
    ? resolve(process.cwd(), pathArg)
    : join(dirname(fileURLToPath(import.meta.url)), "..");
  runCheck(repoRoot);
}

if (invokedAsMain) {
  main();
}
