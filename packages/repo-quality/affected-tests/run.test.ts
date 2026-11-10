// @hermetic-boundary reason="every Git and CLI call passes the env built by buildHermeticTestEnvironment() for this test's temp root; the helpers receive it as a parameter, which the lint cannot trace"
// repo-template#549: fleet-test-affected argument parsing, universe filtering and the CLI against temp repositories.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildHermeticTestEnvironment } from "../hermetic-test-preload/env.ts";
import { parseAffectedArgs, parseRunMap, toRunPath, UsageError } from "./args.ts";
import { parsePorcelainZ } from "./git.ts";
import { expandUniverse, planAffectedRun } from "./run.ts";

const CLI = fileURLToPath(new URL("cli.ts", import.meta.url));

void test("arguments: globs are the universe, value flags take the next word even when it starts with --", () => {
  const options = parseAffectedArgs([
    "tests/**/*.test.ts", "--base", "origin/dev", "--node-arg", "--experimental-strip-types", "--node-arg=--import=./x.ts",
    "--run-map", "tests/=dist/tests/", "--list", "--timeout-seconds=30", "src/*.test.ts",
  ]);
  assert.deepEqual(options.patterns, ["tests/**/*.test.ts", "src/*.test.ts"]);
  assert.equal(options.baseRef, "origin/dev");
  assert.deepEqual(options.nodeArgs, ["--experimental-strip-types", "--import=./x.ts"]);
  assert.deepEqual(options.runMap, { from: "tests/", to: "dist/tests/" });
  assert.equal(options.list, true);
  assert.equal(options.all, false);
  assert.equal(options.timeoutSeconds, 30);
  assert.equal(options.files, null);
});

void test("arguments: --files turns later positionals into files; bad input is a usage error", () => {
  const options = parseAffectedArgs(["--files", "a.test.ts", "--node-arg", "--no-warnings", "b.test.ts"]);
  assert.deepEqual(options.files, ["a.test.ts", "b.test.ts"]);
  assert.deepEqual(options.patterns, []);
  assert.deepEqual(options.nodeArgs, ["--no-warnings"]);
  assert.throws(() => parseAffectedArgs(["--bogus"]), UsageError);
  assert.throws(() => parseAffectedArgs(["--base"]), UsageError);
  assert.throws(() => parseAffectedArgs(["--all", "--files", "a.test.ts"]), UsageError);
  assert.throws(() => parseAffectedArgs(["--timeout-seconds", "0"]), UsageError);
  assert.throws(() => parseRunMap("=dist/"), UsageError);
});

void test("run map: a source test runs as its compiled output", () => {
  const map = parseRunMap("tests/=dist/tests/");
  assert.equal(toRunPath("tests/a/b.test.ts", map), "dist/tests/a/b.test.js");
  assert.equal(toRunPath("tests/c.test.mts", map), "dist/tests/c.test.mjs");
  assert.equal(toRunPath("src/d.test.ts", map), "src/d.test.ts");
  assert.equal(toRunPath("tests/a.test.ts", null), "tests/a.test.ts");
});

void test("porcelain -z: renames yield the new and the old path", () => {
  assert.deepEqual(parsePorcelainZ("R  new.ts\0old.ts\0 M a.ts\0?? dir/b.ts\0"), ["new.ts", "old.ts", "a.ts", "dir/b.ts"]);
});

void test("universe: globs expand with ** and skip node_modules; an unmatched glob is reported", () => {
  const { root } = buildHermeticTestEnvironment({ prefix: "rq-affected-universe-" });
  try {
    for (const file of ["tests/a.test.ts", "tests/deep/b.test.ts", "node_modules/x/c.test.ts", "src/c.ts"]) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "", "utf8");
    }
    const universe = expandUniverse(["tests/**/*.test.ts", "**/*.test.ts", "missing/*.test.ts"], root);
    assert.deepEqual(universe.files, ["tests/a.test.ts", "tests/deep/b.test.ts"]);
    assert.deepEqual(universe.unmatched, ["missing/*.test.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test("plan: only universe files run, relative to the working directory, through the run map", () => {
  const selection = {
    tests: ["pkg/tests/a.test.ts", "pkg/tests/b.test.ts", "other/c.test.ts"],
    selfchecks: ["pkg/tests/d.selfcheck.ts"],
    reasons: {
      "pkg/tests/a.test.ts": { edge: "import" as const, from: "pkg/src/a.ts" },
      "pkg/tests/b.test.ts": { edge: "changed" as const, from: "pkg/tests/b.test.ts" },
      "other/c.test.ts": { edge: "changed" as const, from: "other/c.test.ts" },
      "pkg/tests/d.selfcheck.ts": { edge: "reference" as const, from: "pkg/src/a.ts" },
    },
    changedPaths: [],
  };
  assert.deepEqual(planAffectedRun(selection, ["tests/a.test.ts", "tests/d.selfcheck.ts"], "pkg", null), [
    { file: "tests/a.test.ts", reason: "import from pkg/src/a.ts" },
    { file: "tests/d.selfcheck.ts", reason: "reference from pkg/src/a.ts" },
  ]);
  assert.deepEqual(planAffectedRun(selection, ["dist/tests/b.test.js"], "pkg", parseRunMap("tests/=dist/tests/")), [
    { file: "dist/tests/b.test.js", reason: "changed from pkg/tests/b.test.ts" },
  ]);
  assert.deepEqual(planAffectedRun(selection, ["other/c.test.ts"], "", null), [{ file: "other/c.test.ts", reason: "changed from other/c.test.ts" }]);
});

interface Fixture {
  root: string;
  env: NodeJS.ProcessEnv;
  clone: string;
}

function mustGit(cwd: string, env: NodeJS.ProcessEnv, args: string[]): void {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stdout}${result.stderr}`);
}

function write(dir: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text, "utf8");
}

const PASSING = (body: string): string => `import test from "node:test";\n${body}\nvoid test("passes", () => {});\n`;

function withRepo(run: (fixture: Fixture) => void): void {
  const { root, env } = buildHermeticTestEnvironment({ prefix: "rq-affected-cli-" });
  try {
    const seed = path.join(root, "seed");
    mkdirSync(seed, { recursive: true });
    mustGit(seed, env, ["init", "--initial-branch=master"]);
    write(seed, "src/core.ts", "export const core = 1;\n");
    write(seed, "src/core.test.ts", PASSING('import { core } from "./core.ts";\nvoid core;'));
    write(seed, "src/other.test.ts", PASSING(""));
    write(seed, "extra/core.test.ts", PASSING('import "../src/core.ts";'));
    write(seed, "pkg/lib/x.ts", "export const x = 1;\n");
    write(seed, "pkg/test/x.test.ts", PASSING('import "../lib/x.ts";'));
    mustGit(seed, env, ["add", "."]);
    mustGit(seed, env, ["commit", "-m", "seed"]);
    const origin = path.join(root, "origin.git");
    const clone = path.join(root, "clone");
    mustGit(root, env, ["clone", "--bare", seed, origin]);
    mustGit(root, env, ["clone", origin, clone]);
    run({ root, env, clone });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function cli(cwd: string, env: NodeJS.ProcessEnv, args: string[]): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8", timeout: 120_000 });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

void test("cli: a clean tree selects nothing and exits 0", () => {
  withRepo(({ env, clone }) => {
    const result = cli(clone, env, ["src/*.test.ts", "extra/*.test.ts"]);
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /fleet-test-affected: no affected tests for 0 changed path\(s\)/);
  });
});

void test("cli: a changed source runs only its universe tests; --list runs nothing", () => {
  withRepo(({ env, clone }) => {
    write(clone, "src/core.ts", "export const core = 2;\n");
    const listed = cli(clone, env, ["src/*.test.ts", "--list"]);
    assert.equal(listed.status, 0, listed.out);
    assert.match(listed.out, /1 of 2 test file\(s\) affected by 1 changed path\(s\) vs origin\/master/);
    assert.match(listed.out, / {2}src\/core\.test\.ts {2}\(import from src\/core\.ts\)/);
    assert.doesNotMatch(listed.out, /other\.test\.ts|extra\/core\.test\.ts|PASS/);
    const ran = cli(clone, env, ["src/*.test.ts"]);
    assert.equal(ran.status, 0, ran.out);
    assert.match(ran.out, /PASS src\/core\.test\.ts/);
    assert.match(ran.out, /1 passed, 0 failed \(1 file\(s\)\)/);
  });
});

void test("cli: a failing affected file fails the run; --all and --files run what they name", () => {
  withRepo(({ root, env, clone }) => {
    write(clone, "src/broken.test.ts", 'import test from "node:test";\nvoid test("fails", () => { throw new Error("boom"); });\n');
    const failed = cli(clone, env, ["src/*.test.ts"]);
    assert.equal(failed.status, 1, failed.out);
    assert.match(failed.out, /failed: src\/broken\.test\.ts/);
    rmSync(path.join(clone, "src/broken.test.ts"));
    const all = cli(clone, env, ["src/*.test.ts", "extra/*.test.ts", "--all"]);
    assert.equal(all.status, 0, all.out);
    assert.match(all.out, /3 passed, 0 failed \(3 file\(s\)\)/);
    write(root, "preload.mjs", 'import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("marker.txt", import.meta.url), "loaded");\n');
    const files = cli(clone, env, ["--files", "src/other.test.ts", "--node-arg", `--import=${pathToFileURL(path.join(root, "preload.mjs")).href}`]);
    assert.equal(files.status, 0, files.out);
    assert.match(files.out, /1 passed, 0 failed \(1 file\(s\)\)/);
    assert.equal(existsSync(path.join(root, "marker.txt")), true, "--node-arg reaches the child");
    assert.equal(cli(clone, env, ["--files", "src/missing.test.ts"]).status, 2);
  });
});

void test("cli: a package directory selects from its own universe with an explicit --base", () => {
  withRepo(({ env, clone }) => {
    mustGit(clone, env, ["switch", "-c", "feature"]);
    write(clone, "pkg/lib/x.ts", "export const x = 2;\n");
    mustGit(clone, env, ["commit", "-am", "change x"]);
    const result = cli(path.join(clone, "pkg"), env, ["test/*.test.ts", "--base", "master", "--list"]);
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /1 of 1 test file\(s\) affected by 1 changed path\(s\) vs master/);
    assert.match(result.out, / {2}test\/x\.test\.ts {2}\(import from pkg\/lib\/x\.ts\)/);
  });
});
