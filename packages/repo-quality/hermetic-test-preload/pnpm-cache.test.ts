import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildHermeticTestEnvironment } from "./env.ts";
import { captureHermeticPnpmStore, HERMETIC_OWNER_MARKER, removeOwnedHermeticRoot, restoreHermeticPnpmStore } from "./lifetime.ts";
import type { HermeticPnpmCacheBinding } from "./pnpm-cache.ts";
function binding(): HermeticPnpmCacheBinding {
  return { sourceInputsSha256: createHash("sha256").update("opaque cache control inputs").digest("hex"),
    packageManager: "pnpm@9.15.0", nodeVersion: process.version, platform: process.platform,
    architecture: process.arch, host: hostname() };
}
function store(root: string): string { return path.join(root, "agents-temp", "cache", "pnpm"); }

/** Opaque bytes exercise transfer mechanics; these are not a fabricated package or native proof. */
void test("cache bytes restore into the declared empty store without importing node_modules", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "rq-cache-control-"));
  const source = buildHermeticTestEnvironment({ tempParent: parent }), target = buildHermeticTestEnvironment({ tempParent: parent });
  try {
    writeFileSync(path.join(store(source.root), "opaque-cache-bytes"), "cache data control\n");
    const snapshot = captureHermeticPnpmStore(source.root, binding());
    restoreHermeticPnpmStore(target.root, snapshot, binding());
    assert.equal(readFileSync(path.join(store(target.root), "opaque-cache-bytes"), "utf8"), "cache data control\n");
    assert.equal(existsSync(path.join(target.root, "node_modules")), false);
    assert.equal(captureHermeticPnpmStore(source.root, binding()).sha256, snapshot.sha256);
    assert.equal(removeOwnedHermeticRoot(target.root), true);
    assert.equal(removeOwnedHermeticRoot(source.root), true);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

for (const failure of ["changed-source", "wrong-inputs", "nonempty-target", "source-link"] as const) {
  void test("cache transfer retains its target on " + failure, () => {
    const parent = mkdtempSync(path.join(tmpdir(), "rq-cache-refusal-"));
    const source = buildHermeticTestEnvironment({ tempParent: parent }), target = buildHermeticTestEnvironment({ tempParent: parent });
    try {
      writeFileSync(path.join(store(source.root), "opaque-cache-bytes"), "cache data control\n");
      const snapshot = captureHermeticPnpmStore(source.root, binding()), expected = binding();
      if (failure === "changed-source") writeFileSync(path.join(store(source.root), "opaque-cache-bytes"), "changed");
      if (failure === "wrong-inputs") expected.sourceInputsSha256 = "0".repeat(64);
      if (failure === "nonempty-target") writeFileSync(path.join(store(target.root), "existing"), "retain");
      if (failure === "source-link") {
        const external = path.join(parent, "external"); mkdirSync(external);
        symlinkSync(external, path.join(store(source.root), "link"), process.platform === "win32" ? "junction" : "dir");
      }
      assert.throws(() => { restoreHermeticPnpmStore(target.root, snapshot, expected); });
      const marker: unknown = JSON.parse(readFileSync(path.join(target.root, HERMETIC_OWNER_MARKER), "utf8"));
      assert.ok(marker && typeof marker === "object" && "retained" in marker && marker.retained === true);
      assert.equal(removeOwnedHermeticRoot(target.root), false);
      assert.ok(existsSync(store(source.root))); assert.ok(existsSync(store(target.root)));
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
}

void test("file length framing distinguishes a one-file payload from two old-format entries", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "rq-cache-framing-"));
  const one = buildHermeticTestEnvironment({ tempParent: parent }), two = buildHermeticTestEnvironment({ tempParent: parent });
  try {
    writeFileSync(path.join(store(two.root), "a"), "x");
    writeFileSync(path.join(store(two.root), "b"), "y");
    const mode = lstatSync(path.join(store(two.root), "a")).mode & 0o7777;
    assert.equal(lstatSync(path.join(store(two.root), "b")).mode & 0o7777, mode);
    const payload = Buffer.from("x\0b\0" + String(mode) + "\0Fy");
    writeFileSync(path.join(store(one.root), "a"), payload);
    const header = (name: string) => Buffer.from(name + "\0" + String(mode) + "\0");
    assert.deepEqual(Buffer.concat([header("a"), Buffer.from("F"), payload, Buffer.from("\0")]),
      Buffer.concat([header("a"), Buffer.from("Fx\0"), header("b"), Buffer.from("Fy\0")]),
      "the former unframed inventory stream had a real collision without breaking SHA");
    assert.notEqual(captureHermeticPnpmStore(one.root, binding()).sha256,
      captureHermeticPnpmStore(two.root, binding()).sha256);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
