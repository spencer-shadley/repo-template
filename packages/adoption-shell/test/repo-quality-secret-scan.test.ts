import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scanner = resolve("packages/repo-quality/secret-scan.mjs");

function runScan(cwd: string) {
  return spawnSync(process.execPath, [scanner, "dir"], {
    cwd,
    encoding: "utf8",
  });
}

void test("the shared secret gate tolerates fuzzy fixtures but still rejects a high-confidence private key", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-quality-secret-scan-"));
  try {
    writeFileSync(
      join(root, "fixtures.test.ts"),
      [
        "const database = 'postgres://user:password@example.test/db';",
        "const POSTGRES_PASSWORD = 'password';",
      ].join("\n"),
    );
    const tolerated = runScan(root);
    assert.equal(tolerated.status, 0, `${tolerated.stdout}\n${tolerated.stderr}`);

    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    writeFileSync(join(root, "provider.test.ts"), privateKey);
    const blocked = runScan(root);
    assert.notEqual(blocked.status, 0, "a high-confidence private key must remain merge-blocking");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// repo-template#463 P1/P2: an old Betterleaks without --confidence must fail loudly, never scan unfiltered.
const kitRoot = resolve("packages/repo-quality");

function fakeBetterleaks(helpText: string): { dir: string; binary: string } {
  const dir = mkdtempSync(join(tmpdir(), "rq-secret-scan-"));
  if (process.platform === "win32") {
    const binary = join(dir, "betterleaks.cmd");
    const lines = helpText.split("\n").map((line) => `  echo ${line}`);
    writeFileSync(binary, ["@echo off", 'if "%2"=="--help" (', ...lines, "  exit /b 0", ")", "echo scanned %*", "exit /b 0", ""].join("\r\n"));
    return { dir, binary };
  }
  const binary = join(dir, "betterleaks");
  const help = helpText.split("\n").map((line) => `  echo '${line}'`).join("\n");
  writeFileSync(binary, `#!/bin/sh\nif [ "$2" = "--help" ]; then\n${help}\n  exit 0\nfi\necho "scanned $*"\nexit 0\n`);
  chmodSync(binary, 0o755);
  return { dir, binary };
}

function runScanWithFake(fakeDir: string) {
  const env: Record<string, string> = { PATH: fakeDir, HOME: fakeDir, USERPROFILE: fakeDir };
  for (const key of ["SystemRoot", "SYSTEMROOT", "ComSpec", "TEMP", "TMP"]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return spawnSync(process.execPath, [scanner, "dir"], { cwd: fakeDir, env, encoding: "utf8" });
}

void test("kit declares its Betterleaks minimum next to secret-scan", () => {
  const manifest = JSON.parse(readFileSync(join(kitRoot, "package.json"), "utf8")) as {
    fleetRequirements?: { betterleaks?: string };
  };
  assert.equal(manifest.fleetRequirements?.betterleaks, ">=1.8.0");
});

void test("Betterleaks without --confidence exits non-zero with the named message instead of scanning unfiltered", () => {
  const fake = fakeBetterleaks("Usage: betterleaks dir [flags]\n      --redact   redact secrets");
  try {
    const result = runScanWithFake(fake.dir);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /lacks --confidence; @spencer-shadley\/repo-quality requires betterleaks >=1\.8\.0/u);
    assert.match(result.stderr, /Bump the git-github-tooling Betterleaks pin to >=1\.8\.0/u);
    assert.doesNotMatch(result.stdout, /scanned/u, "must not run an unfiltered scan");
  } finally {
    rmSync(fake.dir, { recursive: true, force: true });
  }
});

void test("Betterleaks with --confidence scans with the high-confidence filter", () => {
  const fake = fakeBetterleaks("Usage: betterleaks dir [flags]\n      --confidence string   minimum confidence");
  try {
    const result = runScanWithFake(fake.dir);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /scanned .*--confidence.*high.*--redact.*--verbose/u);
  } finally {
    rmSync(fake.dir, { recursive: true, force: true });
  }
});