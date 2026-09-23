import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  HERMETIC_GIT_ROUTING_VARIABLES,
  HERMETIC_MARKER_ENV,
  cleanGitEnvironment,
  getHermeticTempDir,
  hermeticGitEnv,
  isHermeticActive,
  sanitizedGitEnv,
} from "./hermetic-preload.ts";
import { hermeticGitSpawnRule } from "./hermetic-git-spawn-rule.ts";
import {
  checkHermeticGit,
  checkTestFileContent,
} from "./hermetic-git-check/index.ts";
import { RuleTester } from "./index.ts";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const preloadMjsPath = path.join(thisDir, "preload.mjs");
const preloadUrl = pathToFileURL(preloadMjsPath).href;
const hermeticPreloadMjsPath = path.join(thisDir, "hermetic-preload.mjs");
const hermeticPreloadUrl = pathToFileURL(hermeticPreloadMjsPath).href;

function computeDirFingerprint(targetDir: string): string {
  const hash = createHash("sha256");
  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(targetDir, full).replaceAll("\\", "/");
      hash.update(rel);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        hash.update(fs.readFileSync(full));
      }
    }
  }
  walk(targetDir);
  return hash.digest("hex");
}

function createSentinelRepository(label: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rq-sentinel-${label}-`));
  const gitEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: path.join(dir, ".initial-global"),
  };
  delete gitEnv["GIT_DIR"];
  delete gitEnv["GIT_WORK_TREE"];

  execFileSync("git", ["init", "--quiet", dir], { env: gitEnv });
  execFileSync("git", ["config", "user.name", "Sentinel Keeper"], { cwd: dir, env: gitEnv });
  execFileSync("git", ["config", "user.email", "sentinel@immutable.example"], { cwd: dir, env: gitEnv });
  execFileSync("git", ["config", "sentinel.canary", "immutable-canary-42"], { cwd: dir, env: gitEnv });
  execFileSync("git", ["config", "remote.origin.url", "git@github.com:sentinel/origin.git"], {
    cwd: dir,
    env: gitEnv,
  });

  fs.writeFileSync(path.join(dir, "sentinel-data.txt"), "sentinel data\n", "utf8");
  execFileSync("git", ["add", "sentinel-data.txt"], { cwd: dir, env: gitEnv });
  execFileSync("git", ["commit", "--quiet", "-m", "sentinel initial"], { cwd: dir, env: gitEnv });

  const configPath = path.join(dir, ".git", "config");
  const initialConfig = fs.readFileSync(configPath, "utf8");
  const initialFingerprint = computeDirFingerprint(dir);

  return { dir, configPath, initialConfig, initialFingerprint, gitEnv };
}

test("sentinel repository with GIT_DIR pointed at it stays byte-identical under the preload", () => {
  const sentinel = createSentinelRepository("preload-test");

  try {
    const maliciousScript = `
      const { execFileSync } = require("node:child_process");
      try { execFileSync("git", ["config", "user.name", "Hostile Mutation"]); } catch {}
      try { execFileSync("git", ["config", "user.email", "hostile@corrupted.example"]); } catch {}
      try { execFileSync("git", ["config", "sentinel.canary", "corrupted"]); } catch {}
      try { execFileSync("git", ["config", "remote.origin.url", "git@github.com:hostile/pwned.git"]); } catch {}
      try { execFileSync("git", ["config", "--global", "user.name", "Global Hostile"]); } catch {}
    `;

    const runnerDir = fs.mkdtempSync(path.join(os.tmpdir(), "rq-run-"));
    // Run child under preload with GIT_DIR and GIT_WORK_TREE pointed at sentinel
    const child = spawnSync(
      process.execPath,
      ["--import", preloadUrl, "-e", maliciousScript],
      {
        cwd: runnerDir,
        env: {
          ...process.env,
          GIT_DIR: path.join(sentinel.dir, ".git"),
          GIT_WORK_TREE: sentinel.dir,
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "hostile.count",
          GIT_CONFIG_VALUE_0: "corrupted",
        },
        encoding: "utf8",
      },
    );
    fs.rmSync(runnerDir, { recursive: true, force: true });

    assert.equal(child.status, 0, `Child exited with status ${String(child.status)}: ${child.stderr}`);

    // Verify sentinel .git/config is byte-identical
    const currentConfig = fs.readFileSync(sentinel.configPath, "utf8");
    assert.equal(
      currentConfig,
      sentinel.initialConfig,
      "Sentinel .git/config was modified despite preload",
    );

    // Verify full sentinel directory is byte-identical
    const currentFingerprint = computeDirFingerprint(sentinel.dir);
    assert.equal(
      currentFingerprint,
      sentinel.initialFingerprint,
      "Sentinel directory tree was modified despite preload",
    );

    // Verify git config readback from sentinel repository
    const canaryValue = execFileSync("git", ["config", "sentinel.canary"], {
      cwd: sentinel.dir,
      env: sentinel.gitEnv,
      encoding: "utf8",
    }).trim();
    assert.equal(canaryValue, "immutable-canary-42");

    const userName = execFileSync("git", ["config", "user.name"], {
      cwd: sentinel.dir,
      env: sentinel.gitEnv,
      encoding: "utf8",
    }).trim();
    assert.equal(userName, "Sentinel Keeper");
  } finally {
    fs.rmSync(sentinel.dir, { recursive: true, force: true });
  }
});

test("sentinel repository stays byte-identical under hermetic-preload.mjs direct import", () => {
  const sentinel = createSentinelRepository("direct-preload-test");

  try {
    const maliciousScript = `
      const { execFileSync } = require("node:child_process");
      try { execFileSync("git", ["config", "user.name", "Hostile Direct Mutation"]); } catch {}
    `;

    const runnerDir = fs.mkdtempSync(path.join(os.tmpdir(), "rq-run-direct-"));
    const child = spawnSync(
      process.execPath,
      ["--import", hermeticPreloadUrl, "-e", maliciousScript],
      {
        cwd: runnerDir,
        env: {
          ...process.env,
          GIT_DIR: path.join(sentinel.dir, ".git"),
          GIT_WORK_TREE: sentinel.dir,
        },
        encoding: "utf8",
      },
    );
    fs.rmSync(runnerDir, { recursive: true, force: true });

    assert.equal(child.status, 0);

    const currentConfig = fs.readFileSync(sentinel.configPath, "utf8");
    assert.equal(currentConfig, sentinel.initialConfig);

    const currentFingerprint = computeDirFingerprint(sentinel.dir);
    assert.equal(currentFingerprint, sentinel.initialFingerprint);
  } finally {
    fs.rmSync(sentinel.dir, { recursive: true, force: true });
  }
});

test("proof of detection: sentinel repository without preload WOULD be corrupted by inherited GIT_DIR", () => {
  const sentinel = createSentinelRepository("negative-control");

  try {
    const mutatingScript = `
      const { execFileSync } = require("node:child_process");
      execFileSync("git", ["config", "user.name", "Hostile Corruptor"]);
    `;

    // Run child WITHOUT preload
    const child = spawnSync(process.execPath, ["-e", mutatingScript], {
      env: {
        ...sentinel.gitEnv,
        GIT_DIR: path.join(sentinel.dir, ".git"),
        GIT_WORK_TREE: sentinel.dir,
      },
      encoding: "utf8",
    });

    assert.equal(child.status, 0);

    // Confirm that WITHOUT the preload, the sentinel WAS corrupted
    const corruptedConfig = fs.readFileSync(sentinel.configPath, "utf8");
    assert.notEqual(
      corruptedConfig,
      sentinel.initialConfig,
      "Negative control expected corruption without preload",
    );
    assert.match(corruptedConfig, /Hostile Corruptor/);
  } finally {
    fs.rmSync(sentinel.dir, { recursive: true, force: true });
  }
});

test("hermeticGitEnv helper strips routing and config injection and sets hermetic defaults", () => {
  const sentinel = createSentinelRepository("helper-test");

  try {
    const dirtyEnv: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_DIR: path.join(sentinel.dir, ".git"),
      GIT_WORK_TREE: sentinel.dir,
      GIT_INDEX_FILE: path.join(sentinel.dir, ".git", "index"),
      GIT_COMMON_DIR: path.join(sentinel.dir, ".git"),
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "user.name",
      GIT_CONFIG_VALUE_0: "Injected",
      GIT_CONFIG_KEY_1: "user.email",
      GIT_CONFIG_VALUE_1: "injected@evil.example",
      GIT_CONFIG_PARAMETERS: "'user.name=hacked'",
    };

    const clean = hermeticGitEnv(dirtyEnv);

    // Check all routing variables are removed
    for (const v of HERMETIC_GIT_ROUTING_VARIABLES) {
      assert.equal(clean[v], undefined, `Expected ${v} to be removed`);
    }

    // Check config injection removed
    assert.equal(clean["GIT_CONFIG_COUNT"], undefined);
    assert.equal(clean["GIT_CONFIG_KEY_0"], undefined);
    assert.equal(clean["GIT_CONFIG_VALUE_0"], undefined);
    assert.equal(clean["GIT_CONFIG_PARAMETERS"], undefined);

    // Check hermetic settings
    assert.equal(clean["GIT_CONFIG_NOSYSTEM"], "1");
    assert.ok(clean["GIT_CONFIG_GLOBAL"]?.endsWith(".gitconfig"));
    assert.ok(clean["HOME"] !== undefined && fs.existsSync(clean["HOME"]));
    assert.ok(clean["XDG_CONFIG_HOME"] !== undefined);
    assert.ok(clean["GIT_CEILING_DIRECTORIES"] !== undefined);
    assert.equal(clean[HERMETIC_MARKER_ENV], "1");

    // Explicit spawn with hermeticGitEnv does not touch sentinel
    const runnerDir = fs.mkdtempSync(path.join(os.tmpdir(), "rq-run-explicit-"));
    try {
      execFileSync(
        "git",
        ["config", "user.name", "Override Attempt"],
        {
          cwd: runnerDir,
          env: hermeticGitEnv(dirtyEnv),
          stdio: "pipe",
        },
      );
    } catch {
      // Expected to fail in an uninitialized directory blocked by GIT_CEILING_DIRECTORIES
    } finally {
      fs.rmSync(runnerDir, { recursive: true, force: true });
    }

    const currentConfig = fs.readFileSync(sentinel.configPath, "utf8");
    assert.equal(currentConfig, sentinel.initialConfig);

    // Aliases
    assert.equal(sanitizedGitEnv, hermeticGitEnv);
    assert.equal(cleanGitEnvironment, hermeticGitEnv);
  } finally {
    fs.rmSync(sentinel.dir, { recursive: true, force: true });
  }
});

test("hermeticGitEnv preserves explicit overrides", () => {
  const custom = hermeticGitEnv(process.env, {
    CUSTOM_TEST_VARIABLE: "preserves-override",
    GIT_CONFIG_GLOBAL: "/tmp/custom-global",
  });
  assert.equal(custom["CUSTOM_TEST_VARIABLE"], "preserves-override");
  assert.equal(custom["GIT_CONFIG_GLOBAL"], "/tmp/custom-global");
});

test("isHermeticActive reports preload status", () => {
  const cleanTemp = getHermeticTempDir();
  assert.ok(fs.existsSync(cleanTemp));
  assert.equal(typeof isHermeticActive(), "boolean");
});

test("hermeticGitCheck scanner identifies unscoped git spawns in test files", () => {
  const unadorned = `
    import { spawn } from "node:child_process";
    export function run() {
      spawn("git", ["status"]);
    }
  `;
  const violations = checkTestFileContent(unadorned, "test/foo.test.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.callee, "spawn");
  assert.match(violations[0]?.detail ?? "", /Spawning 'git'/);

  const withHelper = `
    import { execFileSync } from "node:child_process";
    import { hermeticGitEnv } from "@spencer-shadley/repo-quality/preload";
    export function run() {
      execFileSync("git", ["status"], { env: hermeticGitEnv() });
    }
  `;
  assert.equal(checkTestFileContent(withHelper, "test/foo.test.ts").length, 0);

  const withPreloadDirective = `
    // @hermetic-preload
    import { spawnSync } from "node:child_process";
    export function run() {
      spawnSync("git", ["status"]);
    }
  `;
  assert.equal(checkTestFileContent(withPreloadDirective, "test/foo.test.ts").length, 0);

  const withPreloadImport = `
    import "@spencer-shadley/repo-quality/preload";
    import { spawnSync } from "node:child_process";
    export function run() {
      spawnSync("git", ["status"]);
    }
  `;
  assert.equal(checkTestFileContent(withPreloadImport, "test/foo.test.ts").length, 0);
});

test("ESLint rule fleet/hermetic-git-spawn flags unscoped spawns and accepts preloaded or scoped spawns", () => {
  const ruleTester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
    },
  });

  ruleTester.run("fleet/hermetic-git-spawn", hermeticGitSpawnRule, {
    valid: [
      {
        code: `
          import "@spencer-shadley/repo-quality/preload";
          import { spawn } from "node:child_process";
          spawn("git", ["status"]);
        `,
        filename: "test/example.test.ts",
      },
      {
        code: `
          // @hermetic-preload
          import { spawn } from "node:child_process";
          spawn("git", ["status"]);
        `,
        filename: "test/example.test.ts",
      },
      {
        code: `
          import { spawn } from "node:child_process";
          import { hermeticGitEnv } from "@spencer-shadley/repo-quality";
          spawn("git", ["status"], { env: hermeticGitEnv() });
        `,
        filename: "test/example.test.ts",
      },
      {
        code: `
          import { execFileSync } from "node:child_process";
          import { sanitizedGitEnv } from "@spencer-shadley/repo-quality";
          execFileSync("git", ["status"], { env: sanitizedGitEnv() });
        `,
        filename: "test/example.test.ts",
      },
      {
        code: `
          import { spawnSync } from "node:child_process";
          spawnSync("npm", ["test"]);
        `,
        filename: "test/example.test.ts",
      },
      {
        code: `
          import { spawn } from "node:child_process";
          spawn("git", ["status"]);
        `,
        filename: "src/production.ts", // Non-test file is not flagged
      },
      {
        code: `
          import { spawn } from "node:child_process";
          spawn("git", ["status"]);
        `,
        filename: "test/example.test.ts",
        options: [{ underPreload: true }],
      },
    ],
    invalid: [
      {
        code: `
          import { spawn } from "node:child_process";
          spawn("git", ["status"]);
        `,
        filename: "test/example.test.ts",
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
      {
        code: `
          import { execFileSync } from "node:child_process";
          execFileSync("git", ["status"], { env: process.env });
        `,
        filename: "test/example.test.ts",
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
      {
        code: `
          import { spawnSync } from "node:child_process";
          spawnSync("git", ["status"], {});
        `,
        filename: "test/example.test.ts",
        errors: [{ messageId: "unscopedGitSpawn" }],
      },
    ],
  });
});
