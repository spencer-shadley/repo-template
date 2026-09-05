import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const scriptPath = path.join(root, "scripts", "check-package-manager-store.ts");

void test("check-package-manager-store self-test passes", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--self-test"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `self-test failed: ${result.stderr || result.stdout}`);
  assert.match(result.stdout, /check-package-manager-store: self-test passed/);
});

void test("check-package-manager-store passes on clean repository", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `repo check failed: ${result.stderr || result.stdout}`);
  assert.match(result.stdout, /check-package-manager-store: ok/);
});

void test("no .pnpm-store directory exists inside checkout", () => {
  assert.equal(existsSync(path.join(root, ".pnpm-store")), false);
});

void test("active pnpm store resolves outside checkout", () => {
  const storePath = process.platform === "win32"
    ? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm", "store", "path"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()
    : execFileSync("pnpm", ["store", "path"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
  assert.ok(storePath.length > 0, "pnpm store path must not be empty");
  const rel = path.relative(path.resolve(root), path.resolve(storePath));
  const isInside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  assert.equal(isInside, false, `pnpm store path ${storePath} must resolve outside ${root}`);
});

void test("check-package-manager-store rejects directory containing .pnpm-store", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "rt-108-test-"));
  try {
    mkdirSync(path.join(tempDir, ".pnpm-store"), { recursive: true });
    const result = spawnSync(process.execPath, [scriptPath, tempDir], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Package manager cache directory '.pnpm-store' was found inside the repository checkout/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
