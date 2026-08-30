import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
