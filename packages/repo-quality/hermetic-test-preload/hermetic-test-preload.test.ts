// @hermetic-boundary reason="creates the sentinel repo with the ambient env on purpose, to prove the hermetic env leaves it unchanged"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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
    assert.equal(hermetic.env["GIT_DIR"], undefined);
    assert.equal(hermetic.env["GIT_CONFIG_NOSYSTEM"], "1");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

void test("public preload strips inherited seat custody without dropping unrelated environment", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "rq-seat-custody-"));
  const source = {
    FLEET_SEAT_WORKTREE: path.join(parent, "foreign-worktree"),
    FLEET_SEAT_JOB_ID: "fixture-only-foreign-job",
    fLeEt_SeAt_JoB_Id: "fixture-only-mixed-case-job",
    FIXTURE_UNRELATED: "preserved",
  };
  try {
    const before = { ...source };
    const built = buildHermeticTestEnvironment({ env: source, tempParent: parent });
    assert.deepEqual(source, before);
    for (const key of ["FLEET_SEAT_WORKTREE", "FLEET_SEAT_JOB_ID", "fLeEt_SeAt_JoB_Id"]) {
      assert.equal(isHermeticStripKey(key), true);
      assert.equal(built.env[key], undefined);
    }
    assert.equal(built.env["FIXTURE_UNRELATED"], "preserved");
    assert.equal(isHermeticStripKey("FLEET_SEAT_JOB_ID_SUFFIX"), false);
    const entry = fileURLToPath(new URL("../hermetic-test-preload.mjs", import.meta.url));
    const child = spawnSync(process.execPath, ["--import", entry, "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { rmSync } from "node:fs";
      const { HERMETIC_TEST_ROOT } = await import(${JSON.stringify(new URL("./preload.mjs", import.meta.url).href)});
      try {
        assert.equal(process.env["FLEET_SEAT_WORKTREE"], undefined);
        assert.equal(process.env["FLEET_SEAT_JOB_ID"], undefined);
        assert.equal(process.env["fLeEt_SeAt_JoB_Id"], undefined);
        assert.equal(process.env["FIXTURE_UNRELATED"], "preserved");
      } finally {
        rmSync(HERMETIC_TEST_ROOT, { recursive: true, force: true });
      }
    `], {
      env: { PATH: process.env["PATH"], TMPDIR: parent, TEMP: parent, TMP: parent, ...source },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
