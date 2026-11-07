import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildHermeticTestEnvironment } from "./env.ts";
import { retainHermeticRoot, HERMETIC_OWNER_MARKER, removeOwnedHermeticRoot, runWithHermeticRootCommand, sweepDeadHermeticRoots } from "./lifetime.ts";

function parent(): string { return mkdtempSync(path.join(tmpdir(), "rq-lifetime-control-")); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function marker(root: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path.join(root, HERMETIC_OWNER_MARKER), "utf8"));
  assert.ok(isRecord(value));
  return value;
}
function pendingCount(root: string): number {
  const value = marker(root)["pending"];
  assert.ok(Array.isArray(value));
  return value.length;
}
/** Unit classifier port only: this control launches NO external process. */
function noProcessUnitClassifier(): unknown { return { status: "settled", mechanism: "linux-subreaper" }; }

void test("native callback sees a durable pending fence and classifier receives the original object", () => {
  const fixture = parent(), { root } = buildHermeticTestEnvironment({ tempParent: fixture });
  try {
    const original = { measuredExit: 1 };
    const returned = runWithHermeticRootCommand(root, () => {
      assert.equal(pendingCount(root), 1);
      assert.equal(removeOwnedHermeticRoot(root), false);
      return original;
    }, value => {
      assert.equal(value, original);
      return noProcessUnitClassifier();
    });
    assert.equal(returned, original, "a primary failure is not rewritten by lifetime accounting");
    assert.deepEqual(marker(root)["pending"], []);
    assert.equal(removeOwnedHermeticRoot(root), true);
    assert.equal(existsSync(root), false);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

for (const outcome of ["unknown", "throws", "classifier-throws"] as const) {
  void test("an actual " + outcome + " boundary is sticky and blocks later commands", () => {
    const fixture = parent(), { root } = buildHermeticTestEnvironment({ tempParent: fixture });
    try {
      const error = new Error("actual boundary fixture error"), original = { primary: "unchanged" };
      const execute = () => runWithHermeticRootCommand(root, () => {
        if (outcome === "throws") throw error;
        return original;
      }, () => {
        if (outcome === "classifier-throws") throw error;
        return { status: "unknown" };
      });
      if (outcome === "unknown") assert.equal(execute(), original);
      else assert.throws(execute, value => value === error);
      assert.equal(marker(root)["retained"], true);
      assert.equal(pendingCount(root), 1);
      let launched = false;
      assert.throws(() => { runWithHermeticRootCommand(root, () => { launched = true; }, noProcessUnitClassifier); }, /unresolved writer/);
      assert.equal(launched, false);
      assert.equal(removeOwnedHermeticRoot(root), false);
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
}

void test("nested UNKNOWN cannot be cleared by the outer operation's settled port", () => {
  const fixture = parent(), { root } = buildHermeticTestEnvironment({ tempParent: fixture });
  try {
    runWithHermeticRootCommand(root, () => {
      runWithHermeticRootCommand(root, () => "inner", () => ({ status: "unknown" }));
      return "outer";
    }, noProcessUnitClassifier);
    assert.equal(marker(root)["retained"], true);
    assert.equal(removeOwnedHermeticRoot(root), false);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

void test("replacement and unreadable markers cannot turn a path into cleanup authority", () => {
  const fixture = parent(), { root } = buildHermeticTestEnvironment({ tempParent: fixture });
  const original = root + "-original";
  try {
    renameSync(root, original); mkdirSync(root);
    writeFileSync(path.join(root, HERMETIC_OWNER_MARKER), readFileSync(path.join(original, HERMETIC_OWNER_MARKER)));
    assert.throws(() => removeOwnedHermeticRoot(root), /identity or writer state changed/);
    assert.ok(existsSync(root)); assert.ok(existsSync(original));
    const other = path.join(fixture, "foreign"); mkdirSync(other);
    writeFileSync(path.join(other, HERMETIC_OWNER_MARKER), JSON.stringify({ ...marker(original), pending: [], retained: false }));
    assert.throws(() => { retainHermeticRoot(other); }, /not created by this owner/);
    assert.throws(() => removeOwnedHermeticRoot(other), /not created by this owner/);
    assert.equal(sweepDeadHermeticRoots(fixture, "foreign", Date.now() + 86_400_000), 0);
    assert.ok(existsSync(other));
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

void test("a surviving marked child vetoes parent removal, regardless of its claimed green JSON", () => {
  const fixture = parent(), { root } = buildHermeticTestEnvironment({ tempParent: fixture });
  try {
    const child = path.join(root, "child"); mkdirSync(child);
    writeFileSync(path.join(child, HERMETIC_OWNER_MARKER), JSON.stringify({ pending: [], retained: false }));
    assert.equal(removeOwnedHermeticRoot(root), false);
    assert.ok(existsSync(child));
    rmSync(child, { recursive: true });
    assert.equal(removeOwnedHermeticRoot(root), true);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

void test("abnormal process exit preserves the prelaunch pending fence; later PID absence is not closure", () => {
  const fixture = parent();
  try {
    const environment = JSON.stringify(new URL("./env.ts", import.meta.url).href);
    const lifetime = JSON.stringify(new URL("./lifetime.ts", import.meta.url).href);
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e",
      "import { buildHermeticTestEnvironment } from " + environment + ";" +
      "import { runWithHermeticRootCommand } from " + lifetime + ";" +
      "const { root } = buildHermeticTestEnvironment({ tempParent: " + JSON.stringify(fixture) + " });" +
      "process.stdout.write(root);" +
      "runWithHermeticRootCommand(root, () => { process.kill(process.pid, 'SIGKILL'); }, () => { throw Error('unreachable'); });",
    ], { encoding: "utf8" });
    assert.ok(result.signal === "SIGKILL" || result.status !== 0, "the creator ended abnormally");
    const root = result.stdout;
    assert.ok(root && existsSync(root));
    assert.equal(pendingCount(root), 1);
    assert.equal(sweepDeadHermeticRoots(fixture, "fleet-hermetic-test-", Date.now() + 86_400_000), 0);
    assert.ok(existsSync(root));
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

void test("a malformed same-generation marker refuses cleanup", () => {
  const fixture = parent(), { root } = buildHermeticTestEnvironment({ tempParent: fixture });
  try {
    const before = lstatSync(root, { bigint: true }).ino;
    writeFileSync(path.join(root, HERMETIC_OWNER_MARKER), "{");
    assert.throws(() => removeOwnedHermeticRoot(root));
    assert.equal(lstatSync(root, { bigint: true }).ino, before);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

void test("actual same-process nested roots must close before their parent", () => {
  const fixture = parent(), { root } = buildHermeticTestEnvironment({ tempParent: fixture });
  const child = buildHermeticTestEnvironment({ tempParent: path.join(root, "tmp") }).root;
  try {
    assert.equal(removeOwnedHermeticRoot(root), false);
    assert.equal(removeOwnedHermeticRoot(child), true);
    assert.equal(removeOwnedHermeticRoot(root), true);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

void test("a real foreign pending child under the declared TMPDIR vetoes recursive parent cleanup", () => {
  const fixture = parent(), built = buildHermeticTestEnvironment({ tempParent: fixture });
  try {
    const environment = JSON.stringify(new URL("./env.ts", import.meta.url).href);
    const lifetime = JSON.stringify(new URL("./lifetime.ts", import.meta.url).href);
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e",
      "import { buildHermeticTestEnvironment } from " + environment + ";" +
      "import { runWithHermeticRootCommand } from " + lifetime + ";" +
      "const { root } = buildHermeticTestEnvironment({ tempParent: " + JSON.stringify(built.env["TMPDIR"]) + " });" +
      "process.stdout.write(root);" +
      "runWithHermeticRootCommand(root, () => { process.kill(process.pid, 'SIGKILL'); }, () => { throw Error('unreachable'); });",
    ], { encoding: "utf8" });
    assert.ok(result.signal === "SIGKILL" || result.status !== 0);
    assert.ok(result.stdout && existsSync(result.stdout));
    assert.equal(pendingCount(result.stdout), 1);
    assert.equal(removeOwnedHermeticRoot(built.root), false);
    assert.ok(existsSync(result.stdout), "parent must not recursively erase the foreign writer target");
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
