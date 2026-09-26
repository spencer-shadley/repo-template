// @hermetic-boundary reason="every Git call passes the env built by buildHermeticTestEnvironment() for this test's temp root; the git() helper receives it as a parameter, which the lint cannot trace"
// repo-template#440: default-branch commit-refusal hook. Every repository lives under this
// test's temp root.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildHermeticTestEnvironment } from "../hermetic-test-preload/env.ts";
import {
  DEFAULT_BRANCH_GUARD_HOOKS,
  DEFAULT_BRANCH_GUARD_VERSION,
  inspectDefaultBranchGuard,
  installDefaultBranchGuard,
  main,
  renderDefaultBranchGuardHook,
} from "./index.ts";

interface Fixture {
  root: string;
  env: NodeJS.ProcessEnv;
  clone: string;
}

function git(cwd: string, env: NodeJS.ProcessEnv, args: string[]): { status: number | null; out: string } {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function mustGit(cwd: string, env: NodeJS.ProcessEnv, args: string[]): string {
  const result = git(cwd, env, args);
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.out}`);
  return result.out;
}

function withFixture(run: (fixture: Fixture) => void): void {
  const { root, env } = buildHermeticTestEnvironment({ prefix: "rq-dbg-" });
  try {
    const seed = path.join(root, "seed");
    const origin = path.join(root, "origin.git");
    const clone = path.join(root, "canonical");
    mkdirSync(seed, { recursive: true });
    mustGit(seed, env, ["init", "--initial-branch=master"]);
    writeFileSync(path.join(seed, "README.md"), "seed\n", "utf8");
    mustGit(seed, env, ["add", "README.md"]);
    mustGit(seed, env, ["commit", "-m", "seed"]);
    mustGit(root, env, ["clone", "--bare", seed, origin]);
    mustGit(root, env, ["clone", origin, clone]);
    run({ root, env, clone });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function commitFile(dir: string, env: NodeJS.ProcessEnv, name: string): { status: number | null; out: string } {
  writeFileSync(path.join(dir, name), `${name}\n`, "utf8");
  mustGit(dir, env, ["add", name]);
  return git(dir, env, ["commit", "-m", `add ${name}`]);
}

void test("the rendered hook carries a version marker and names the worktree exit", () => {
  const hook = renderDefaultBranchGuardHook();
  assert.match(hook, /^#!\/bin\/sh\n/);
  assert.match(hook, new RegExp(String.raw`repo-quality default-branch-guard v${String(DEFAULT_BRANCH_GUARD_VERSION)}\b`));
  assert.match(hook, /git worktree add/);
  assert.deepEqual([...DEFAULT_BRANCH_GUARD_HOOKS], ["pre-commit", "pre-merge-commit"]);
});

void test("an installed checkout refuses a default-branch commit and names the worktree exit", () => {
  withFixture(({ env, clone }) => {
    const receipt = installDefaultBranchGuard({ repoRoot: clone, env });
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
    const refused = commitFile(clone, env, "on-master.txt");
    assert.notEqual(refused.status, 0);
    assert.match(refused.out, /default-branch-guard: refusing to commit on 'master'/);
    assert.match(refused.out, /git worktree add/);
    assert.equal(mustGit(clone, env, ["rev-list", "--count", "HEAD"]).trim(), "1");
  });
});

void test("a linked worktree on a feature branch commits normally", () => {
  withFixture(({ root, env, clone }) => {
    installDefaultBranchGuard({ repoRoot: clone, env });
    const worktree = path.join(root, "feature-wt");
    mustGit(clone, env, ["worktree", "add", "-b", "feature", worktree, "origin/master"]);
    const committed = commitFile(worktree, env, "feature.txt");
    assert.equal(committed.status, 0, committed.out);
  });
});

void test("a feature branch or detached HEAD in the canonical checkout is not refused", () => {
  withFixture(({ env, clone }) => {
    installDefaultBranchGuard({ repoRoot: clone, env });
    mustGit(clone, env, ["switch", "-c", "topic"]);
    assert.equal(commitFile(clone, env, "topic.txt").status, 0);
    mustGit(clone, env, ["switch", "--detach", "master"]);
    assert.equal(commitFile(clone, env, "detached.txt").status, 0);
  });
});

void test("the default branch comes from origin/HEAD, not a hard-coded name", () => {
  withFixture(({ env, clone }) => {
    installDefaultBranchGuard({ repoRoot: clone, env });
    mustGit(clone, env, ["switch", "-c", "trunk"]);
    mustGit(clone, env, ["update-ref", "refs/remotes/origin/trunk", "HEAD"]);
    mustGit(clone, env, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"]);
    const refused = commitFile(clone, env, "trunk.txt");
    assert.notEqual(refused.status, 0);
    assert.match(refused.out, /refusing to commit on 'trunk'/);
    mustGit(clone, env, ["switch", "master"]);
    assert.equal(commitFile(clone, env, "master-now-ok.txt").status, 0);
  });
});

void test("inspect reports current, outdated, missing and foreign hooks so drift is detectable", () => {
  withFixture(({ env, clone }) => {
    const before = inspectDefaultBranchGuard({ repoRoot: clone, env });
    assert.equal(before.ok, false);
    assert.deepEqual(before.hooks.map((hook) => hook.state), ["missing", "missing"]);

    installDefaultBranchGuard({ repoRoot: clone, env });
    const current = inspectDefaultBranchGuard({ repoRoot: clone, env });
    assert.equal(current.ok, true);
    assert.deepEqual(current.hooks.map((hook) => hook.state), ["current", "current"]);

    const preCommit = path.join(current.hooksDir, "pre-commit");
    writeFileSync(
      preCommit,
      readFileSync(preCommit, "utf8").replace(/default-branch-guard v\d+/, "default-branch-guard v0"),
      "utf8",
    );
    const outdated = inspectDefaultBranchGuard({ repoRoot: clone, env });
    assert.equal(outdated.ok, false);
    const [outdatedPreCommit] = outdated.hooks;
    assert.equal(outdatedPreCommit?.state, "outdated");
    assert.equal(outdatedPreCommit.version, 0);

    const upgraded = installDefaultBranchGuard({ repoRoot: clone, env });
    assert.equal(upgraded.ok, true);
    assert.deepEqual(upgraded.written, ["pre-commit"]);
  });
});

void test("install never overwrites a foreign hook", () => {
  withFixture(({ env, clone }) => {
    const hooksDir = inspectDefaultBranchGuard({ repoRoot: clone, env }).hooksDir;
    mkdirSync(hooksDir, { recursive: true });
    const foreign = "#!/bin/sh\necho someone else's hook\n";
    writeFileSync(path.join(hooksDir, "pre-commit"), foreign, "utf8");
    const receipt = installDefaultBranchGuard({ repoRoot: clone, env });
    assert.equal(receipt.ok, false);
    assert.deepEqual(receipt.refused, ["pre-commit"]);
    assert.equal(readFileSync(path.join(hooksDir, "pre-commit"), "utf8"), foreign);
    assert.equal(inspectDefaultBranchGuard({ repoRoot: clone, env }).hooks[0]?.state, "foreign");
  });
});

void test("the CLI check exits non-zero on drift and zero once installed", () => {
  withFixture(({ env, clone }) => {
    const lines: string[] = [];
    const log = (line: string): void => { lines.push(line); };
    assert.equal(main(["check", "--repo", clone], { env, log }), 1);
    assert.equal(main(["install", "--repo", clone], { env, log }), 0);
    assert.equal(main(["check", "--repo", clone], { env, log }), 0);
    assert.equal(main(["bogus"], { env, log }), 2);
    assert.match(lines.at(-1) ?? "", /^usage: default-branch-guard/);
  });
});
