import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildHermeticTestEnvironment, isHermeticStripKey } from "./env.ts";

void test("strips GIT_DIR and isolates config writes from a sentinel repo", () => {
  assert.equal(isHermeticStripKey("GIT_DIR"), true);
  const parent = mkdtempSync(path.join(tmpdir(), "rq-hermetic-"));
  const sentinel = path.join(parent, "sentinel");
  const fixture = path.join(parent, "fixture");
  try {
    mkdirSync(sentinel, { recursive: true });
    const baseEnv = { ...process.env };
    const init = spawnSync("git", ["init"], { cwd: sentinel, env: baseEnv, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const before = readFileSync(path.join(sentinel, ".git", "config"));
    const hermetic = buildHermeticTestEnvironment({
      prefix: "rq-ht-",
      env: {
        ...baseEnv,
        GIT_DIR: path.join(sentinel, ".git"),
        GIT_WORK_TREE: sentinel,
        GIT_INDEX_FILE: path.join(sentinel, ".git", "index"),
        GIT_COMMON_DIR: path.join(sentinel, ".git"),
      },
    });
    mkdirSync(fixture, { recursive: true });
    assert.equal(
      spawnSync("git", ["init"], { cwd: fixture, env: hermetic.env, encoding: "utf8" }).status,
      0,
    );
    assert.equal(
      spawnSync("git", ["config", "user.email", "x@example.com"], {
        cwd: fixture,
        env: hermetic.env,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.deepEqual(readFileSync(path.join(sentinel, ".git", "config")), before);
    assert.equal(hermetic.env.GIT_DIR, undefined);
    assert.equal(hermetic.env.GIT_CONFIG_NOSYSTEM, "1");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
