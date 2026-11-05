// @hermetic-boundary reason="creates the sentinel repo with the ambient env on purpose, to prove the hermetic env leaves it unchanged"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { applyHermeticTestEnvironment, buildHermeticTestEnvironment, HERMETIC_OWNER_MARKER, HERMETIC_SWEEP_MIN_AGE_MS, isHermeticOwner, isHermeticStripKey, sweepDeadHermeticRoots } from "./env.ts";

const agentStorageKeys = ["FLEET_AGENTS_ROOT", "FLEET_AGENTS_TEMP", "AO_WORKTREES_ROOT", "ORCH_WORKTREE_ROOT",
  "npm_config_store_dir", "pnpm_config_store_dir", "npm_config_cache", "npm_config_cache_dir", "pnpm_config_cache_dir"] as const;

void test("explicit and legacy state paths cannot escape the private test homes", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "rq-state-homes-"));
  const sentinel = path.join(parent, "caller-state");
  const homes = ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "APPDATA", "LOCALAPPDATA", "XDG_STATE_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"];
  const overrides = ["FLEET_STATE_ROOT", "CLI_WRAPPERS_STATE_ROOT", "CLI_WRAPPERS_STATE_DIR"];
  try {
    mkdirSync(sentinel);
    writeFileSync(path.join(sentinel, "keep.txt"), "caller state must not change\n");
    const source: NodeJS.ProcessEnv = {
      CODE_ROOT: path.join(parent, "declared-code"), FLEET_CODE_ROOT: path.join(parent, "declared-code"),
      CLAUDE_CODE_OAUTH_TOKEN: "fixture-auth-value", FIXTURE_UNRELATED: "kept",
    };
    for (const key of [...homes, ...overrides]) {
      source[key] = sentinel;
      source[key.toLowerCase()] = sentinel;
    }
    const before = { ...source };
    const built = buildHermeticTestEnvironment({ env: source, tempParent: parent });
    const applied = { ...source };
    const appliedRoot = applyHermeticTestEnvironment({ tempParent: parent }, applied);
    assert.deepEqual(source, before);
    for (const [env, root] of [[built.env, built.root], [applied, appliedRoot]] as const) {
      for (const key of homes) {
        const directory = env[key];
        assert.ok(directory && path.relative(root, directory) && !path.relative(root, directory).startsWith(".."), key);
        assert.ok(statSync(directory).isDirectory(), key);
        assert.deepEqual(Object.keys(env).filter((candidate) => candidate.toUpperCase() === key), [key]);
      }
      for (const key of overrides) {
        assert.equal(isHermeticStripKey(key.toLowerCase()), true);
        assert.deepEqual(Object.keys(env).filter((candidate) => candidate.toUpperCase() === key), []);
      }
      for (const key of ["CODE_ROOT", "FLEET_CODE_ROOT", "CLAUDE_CODE_OAUTH_TOKEN", "FIXTURE_UNRELATED"]) {
        assert.equal(env[key], source[key], key);
      }
    }
    const entry = new URL("../hermetic-test-preload.mjs", import.meta.url).href;
    const child = spawnSync(process.execPath, ["--import", entry, "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import path from "node:path";
      import { rmSync, writeFileSync } from "node:fs";
      const { HERMETIC_TEST_ROOT } = await import(${JSON.stringify(new URL("./preload.mjs", import.meta.url).href)});
      try {
        for (const key of ${JSON.stringify(homes)}) {
          const directory = process.env[key];
          assert.ok(directory && path.relative(HERMETIC_TEST_ROOT, directory) && !path.relative(HERMETIC_TEST_ROOT, directory).startsWith(".."), key);
          assert.deepEqual(Object.keys(process.env).filter((candidate) => candidate.toUpperCase() === key), [key]);
          writeFileSync(path.join(directory, key + ".txt"), "private child state");
        }
        for (const key of ${JSON.stringify(overrides)}) {
          assert.deepEqual(Object.keys(process.env).filter((candidate) => candidate.toUpperCase() === key), []);
        }
        assert.equal(process.env["CODE_ROOT"], ${JSON.stringify(source["CODE_ROOT"])});
        assert.equal(process.env["FLEET_CODE_ROOT"], process.env["CODE_ROOT"]);
        assert.equal(process.env["CLAUDE_CODE_OAUTH_TOKEN"], "fixture-auth-value");
        assert.equal(process.env["FIXTURE_UNRELATED"], "kept");
      } finally { rmSync(HERMETIC_TEST_ROOT, { recursive: true, force: true }); }
    `], { env: { PATH: process.env["PATH"], SystemRoot: process.env["SystemRoot"], TEMP: parent, TMP: parent, TMPDIR: parent, ...source },
      encoding: "utf8", timeout: 10_000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(readdirSync(sentinel), ["keep.txt"]);
    assert.equal(readFileSync(path.join(sentinel, "keep.txt"), "utf8"), "caller state must not change\n");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

void test("agent roots and package caches are private in the builder, in-place apply, and public child preload", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "rq-agent-storage-"));
  const sentinel = path.join(parent, "host-storage");
  try {
    mkdirSync(sentinel);
    const sentinelFile = path.join(sentinel, "keep.txt");
    writeFileSync(sentinelFile, "host storage must not change\n");
    const source: NodeJS.ProcessEnv = { FIXTURE_UNRELATED: "kept", FLEET_CENTRAL_DB_PATH: sentinelFile, fLeEt_CeNtRaL_dB_pAtH: sentinelFile };
    for (const key of agentStorageKeys) {
      source[key] = sentinel;
      source[key.toLowerCase() === key ? key.toUpperCase() : key.toLowerCase()] = sentinel;
      assert.equal(isHermeticStripKey(key), true);
      assert.equal(isHermeticStripKey(key.toLowerCase()), true);
    }
    const before = { ...source };
    const built = buildHermeticTestEnvironment({ env: source, tempParent: parent });
    assert.deepEqual(source, before);
    const applied = { ...source };
    const appliedRoot = applyHermeticTestEnvironment({ tempParent: parent }, applied);
    for (const [env, root] of [[built.env, built.root], [applied, appliedRoot]] as const) {
      for (const key of agentStorageKeys) {
        const value = env[key];
        assert.ok(value && path.relative(root, value) && !path.relative(root, value).startsWith(".."), key);
        assert.ok(statSync(value).isDirectory(), key);
        assert.deepEqual(Object.keys(env).filter((candidate) => candidate.toUpperCase() === key.toUpperCase()), [key]);
      }
      const agentsTemp = env["FLEET_AGENTS_TEMP"];
      assert.ok(agentsTemp);
      assert.equal(env["AO_WORKTREES_ROOT"], path.join(agentsTemp, "worktrees"));
      assert.equal(env["ORCH_WORKTREE_ROOT"], env["AO_WORKTREES_ROOT"]);
      assert.equal(env["FLEET_CENTRAL_DB_PATH"], path.join(root, "fleet-central.sqlite"));
      assert.deepEqual(Object.keys(env).filter((key) => key.toUpperCase() === "FLEET_CENTRAL_DB_PATH"), ["FLEET_CENTRAL_DB_PATH"]);
      assert.equal(env["FIXTURE_UNRELATED"], "kept");
    }
    const entry = new URL("../hermetic-test-preload.mjs", import.meta.url).href;
    const child = spawnSync(process.execPath, ["--import", entry, "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import path from "node:path";
      import { rmSync, statSync, writeFileSync } from "node:fs";
      const { HERMETIC_TEST_ROOT } = await import(${JSON.stringify(new URL("./preload.mjs", import.meta.url).href)});
      try {
        for (const key of ${JSON.stringify(agentStorageKeys)}) {
          const value = process.env[key];
          assert.ok(value && path.relative(HERMETIC_TEST_ROOT, value) && !path.relative(HERMETIC_TEST_ROOT, value).startsWith(".."), key);
          assert.ok(statSync(value).isDirectory(), key);
          assert.deepEqual(Object.keys(process.env).filter((candidate) => candidate.toUpperCase() === key.toUpperCase()), [key]);
        }
        assert.equal(process.env["AO_WORKTREES_ROOT"], path.join(process.env["FLEET_AGENTS_TEMP"], "worktrees"));
        assert.equal(process.env["FLEET_CENTRAL_DB_PATH"], path.join(HERMETIC_TEST_ROOT, "fleet-central.sqlite"));
        assert.deepEqual(Object.keys(process.env).filter((key) => key.toUpperCase() === "FLEET_CENTRAL_DB_PATH"), ["FLEET_CENTRAL_DB_PATH"]);
        writeFileSync(process.env["FLEET_CENTRAL_DB_PATH"], "private child database state");
        writeFileSync(path.join(process.env["pnpm_config_cache_dir"], "pnpm-cache-proof"), "private child package cache");
        assert.equal(process.env["FIXTURE_UNRELATED"], "kept");
      } finally { rmSync(HERMETIC_TEST_ROOT, { recursive: true, force: true }); }
    `], { env: { PATH: process.env["PATH"], SystemRoot: process.env["SystemRoot"], TEMP: parent, TMP: parent, TMPDIR: parent, ...source },
      encoding: "utf8", timeout: 10_000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(readFileSync(sentinelFile, "utf8"), "host storage must not change\n");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

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
    const entry = new URL("../hermetic-test-preload.mjs", import.meta.url).href;
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

void test("redirects TEMP/TMP/TMPDIR into the disposable root and strips harness identity", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "rq-temp-harness-"));
  const markers = {
    CLAUDECODE: "1",
    CLAUDE_CODE_ENTRYPOINT: "cli",
    COPILOT_HOOK_EVENT: "preToolUse",
    CURSOR_HOOK_EVENT: "beforeShellExecution",
    CURSOR_HOOK_FUTURE: "x",
    CODEX_THREAD_ID: "t",
  };
  const source = { TEMP: "/shared/a", TMP: "/shared/b", TMPDIR: "/shared/c", ...markers, FIXTURE_UNRELATED: "kept" };
  try {
    const built = buildHermeticTestEnvironment({ env: source, tempParent: parent });
    for (const key of ["TEMP", "TMP", "TMPDIR"]) {
      assert.equal(built.env[key], path.join(built.root, "tmp"));
    }
    assert.ok(statSync(path.join(built.root, "tmp")).isDirectory());
    for (const key of Object.keys(markers)) {
      assert.equal(isHermeticStripKey(key), true, key);
      assert.equal(built.env[key], undefined, key);
    }
    assert.equal(built.env["FIXTURE_UNRELATED"], "kept");
    assert.equal(isHermeticStripKey("CLAUDE_CODE_OAUTH_TOKEN"), false);

    const entry = new URL("../hermetic-test-preload.mjs", import.meta.url).href;
    const child = spawnSync(process.execPath, ["--import", entry, "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { tmpdir } from "node:os";
      import path from "node:path";
      import { rmSync } from "node:fs";
      const { HERMETIC_TEST_ROOT } = await import(${JSON.stringify(new URL("./preload.mjs", import.meta.url).href)});
      try {
        assert.equal(path.resolve(tmpdir()), path.resolve(HERMETIC_TEST_ROOT, "tmp"));
        for (const key of ["TEMP", "TMP", "TMPDIR"]) assert.equal(process.env[key], path.join(HERMETIC_TEST_ROOT, "tmp"));
        for (const key of ${JSON.stringify(Object.keys(markers))}) assert.equal(process.env[key], undefined, key);
        assert.equal(process.env["FIXTURE_UNRELATED"], "kept");
      } finally {
        rmSync(HERMETIC_TEST_ROOT, { recursive: true, force: true });
      }
    `], {
      env: { PATH: process.env["PATH"], SystemRoot: process.env["SystemRoot"], ...source, TMPDIR: parent, TEMP: parent, TMP: parent },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

for (const workerEnd of ["exit", "terminate"] as const) {
  void test(`code#13858: a worker-created root survives worker ${workerEnd} while its process remains live`, { timeout: 10_000 }, async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "rq-worker-dispose-"));
    let worker: Worker | undefined;
    try {
      worker = new Worker(`
        const { parentPort, workerData } = require("node:worker_threads");
        import(workerData.envModule).then(({ buildHermeticTestEnvironment }) => {
          const { root } = buildHermeticTestEnvironment({ tempParent: workerData.parent, prefix: "owned-" });
          parentPort.postMessage({ root, pid: process.pid });
          if (workerData.workerEnd === "terminate") setInterval(() => {}, 1_000);
        });
      `, { eval: true, execArgv: ["--experimental-strip-types"],
        workerData: { envModule: new URL("./env.ts", import.meta.url).href, parent, workerEnd } });
      const exited = once(worker, "exit");
      const [message] = await once(worker, "message") as [{ root: string; pid: number }];
      if (workerEnd === "terminate") await worker.terminate();
      const [status] = await exited;
      assert.equal(status, workerEnd === "exit" ? 0 : 1);
      assert.equal(message.pid, process.pid, "worker and main share the process whose lifetime owns the root");
      assert.ok(existsSync(message.root), "thread exit must not remove the live process's root");
      const marker: unknown = JSON.parse(readFileSync(path.join(message.root, HERMETIC_OWNER_MARKER), "utf8"));
      assert.ok(isHermeticOwner(marker));
      assert.equal(marker.pid, process.pid);
      const sentinel = path.join(message.root, "main-thread-still-uses-root.txt");
      writeFileSync(sentinel, "useful after worker exit");
      assert.equal(readFileSync(sentinel, "utf8"), "useful after worker exit");
    } finally {
      if (worker) await worker.terminate();
      rmSync(parent, { recursive: true, force: true });
    }
  });
}

void test("code#13858: a disposable root is removed at exit, and a killed owner's root by the next sweep", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "rq-dispose-"));
  try {
    const envModule = JSON.stringify(new URL("./env.ts", import.meta.url).href);
    const child = (tail: string) => spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e",
      `import { buildHermeticTestEnvironment } from ${envModule};
       const { root } = buildHermeticTestEnvironment({ tempParent: ${JSON.stringify(parent)}, prefix: "owned-" });
       process.stdout.write(root); ${tail}`], { encoding: "utf8" });

    const clean = child("");
    assert.equal(clean.status, 0, clean.stderr);
    assert.equal(existsSync(clean.stdout), false, "a normal exit removes its root");

    const killed = child("process.kill(process.pid, 'SIGKILL');");
    assert.ok(killed.stdout && existsSync(killed.stdout), "a killed process skips its exit hook");
    const marker: unknown = JSON.parse(readFileSync(path.join(killed.stdout, HERMETIC_OWNER_MARKER), "utf8"));
    assert.ok(isHermeticOwner(marker), "the marker names its owner");
    const later = marker.createdAt + HERMETIC_SWEEP_MIN_AGE_MS + 1;
    const plant = (name: string, owner: Record<string, unknown>) => {
      const dir = path.join(parent, name);
      mkdirSync(dir);
      writeFileSync(path.join(dir, HERMETIC_OWNER_MARKER), JSON.stringify({ ...marker, ...owner }));
      return dir;
    };
    const live = plant("owned-live", { pid: process.pid });
    const otherHost = plant("owned-other-host", { host: `${marker.host}-elsewhere` });
    const otherBoot = plant("owned-other-boot", { boot: `${marker.boot}-earlier` });
    const unmarked = path.join(parent, "owned-unmarked");
    mkdirSync(unmarked);

    assert.equal(sweepDeadHermeticRoots(parent, "owned-", marker.createdAt + 1_000), 0, "a young root may be another pid namespace's");
    assert.ok(existsSync(killed.stdout));
    writeFileSync(path.join(parent, "owned.sweep-stamp"), "0");
    utimesSync(path.join(parent, "owned.sweep-stamp"), new Date(later + 3_600_000), new Date(later + 3_600_000));
    assert.equal(sweepDeadHermeticRoots(parent, "owned-", later), 1, "a future-dated stamp is expired");
    assert.equal(existsSync(killed.stdout), false, "a dead owner's root is reclaimed");
    for (const kept of [live, otherHost, otherBoot, unmarked]) assert.ok(existsSync(kept), `${kept} is kept`);
    assert.equal(sweepDeadHermeticRoots(parent, "owned-", later + 1_000), 0, "the sweep is throttled");

    // Budgeted: each sweep examines a bounded slice and the next resumes after it.
    rmSync(path.join(parent, "owned.sweep-stamp"));
    const dead = ["owned-z1", "owned-z2", "owned-z3"].map((name) => plant(name, { pid: 999_999_999 }));
    let total = 0;
    for (let sweep = 0; sweep < 10 && dead.some((dir) => existsSync(dir)); sweep++) {
      total += sweepDeadHermeticRoots(parent, "owned-", later + (sweep + 1) * 3_600_000, 2);
    }
    assert.equal(total, 3, "every dead root is reached across budgeted sweeps");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
