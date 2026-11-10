import assert from "node:assert/strict";
import test from "node:test";
import { changedScriptText, selectAffectedTests, type UpstreamInput } from "./select.ts";

function select(changedPaths: string[], contents: Record<string, string>, changedScripts: string[] = [], upstream?: UpstreamInput) {
  return selectAffectedTests({
    changedPaths,
    files: Object.keys(contents).filter((file) => !file.startsWith("node_modules/")),
    ...(upstream ? { upstream } : {}),
    readFile: (file) => {
      const text = contents[file];
      if (text === undefined) throw new Error(`missing ${file}`);
      return text;
    },
    changedScripts,
  });
}

void test("selects tests that import the changed file through any chain", () => {
  const selection = select(["src/core.ts"], {
    "src/core.ts": "export const core = 1;",
    "src/mid.ts": 'import { core } from "./core.ts"; export const mid = core;',
    "src/mid.test.ts": 'import { mid } from "./mid.ts";',
    "src/deep/top.selfcheck.ts": 'import { mid } from "../mid.js";',
    "src/other.test.ts": 'import "./unrelated.ts";',
    "src/unrelated.ts": "",
  });
  assert.deepEqual(selection.tests, ["src/mid.test.ts"]);
  assert.deepEqual(selection.selfchecks, ["src/deep/top.selfcheck.ts"]);
  assert.deepEqual(selection.reasons["src/mid.test.ts"], { edge: "import", from: "src/core.ts" });
});

void test("a trace map adds the runnables only runtime saw, after every static edge", () => {
  const contents: Record<string, string> = {
    "docs/guide.md": "# guide",
    "src/core.ts": "export const core = 1;",
    "src/core.test.ts": 'import { core } from "./core.ts";',
    "tools/corpus-scan.test.ts": 'execFileSync("git", ["ls-files"]);',
  };
  const traceMap = new Map([
    ["docs/guide.md", ["tools/corpus-scan.test.ts", "tools/deleted.test.ts"]],
    ["src/core.ts", ["src/core.test.ts", "tools/corpus-scan.test.ts"]],
  ]);
  const selection = selectAffectedTests({
    changedPaths: ["docs/guide.md", "src/core.ts"],
    files: Object.keys(contents),
    readFile: (file) => contents[file] as string,
    traceMap,
  });
  assert.deepEqual(selection.tests, ["src/core.test.ts", "tools/corpus-scan.test.ts"]);
  assert.deepEqual(selection.reasons["src/core.test.ts"], { edge: "import", from: "src/core.ts" });
  assert.deepEqual(selection.reasons["tools/corpus-scan.test.ts"], { edge: "trace", from: "docs/guide.md" });
  assert.deepEqual(select(["docs/guide.md"], contents).tests, [], "without a map the static edges alone miss the scanner");
  const whole = selectAffectedTests({
    changedPaths: [],
    files: Object.keys(contents),
    readFile: (file) => contents[file] as string,
    upstream: { packages: ["@x/pkg"], listFiles: () => [], changedPackages: ["@x/pkg"] },
    traceMap: new Map([["node_modules/@x/pkg/bin/run.js", ["tools/corpus-scan.test.ts"]], ["node_modules/@x/pkg-other/a.js", ["src/core.test.ts"]]]),
  });
  assert.deepEqual(whole.tests, ["tools/corpus-scan.test.ts"], "a whole-package change unions what the map saw load that package, not a prefix-sharing one");
});

void test("code#14475: a scanner that listed a directory is selected when an entry there is added or removed, not edited", () => {
  const base = ["skills/a/SKILL.md", "skills/b/SKILL.md", "tools/skills-scan.test.ts", "tools/top-scan.test.ts"];
  const baseEntries = new Set([...base, "skills", "skills/a", "skills/b", "tools"]);
  const traceMap = new Map([["skills/", ["tools/skills-scan.test.ts"]], ["skills/a/", ["tools/top-scan.test.ts"]]]);
  const run = (changedPaths: string[], files: string[], inBase: ((file: string) => boolean) | null = (file) => baseEntries.has(file)) => selectAffectedTests({
    changedPaths, files, readFile: () => "", traceMap, ...(inBase ? { inBase } : {}),
  }).tests;
  assert.deepEqual(run(["skills/a/new.md"], [...base, "skills/a/new.md"]), ["tools/top-scan.test.ts"], "an added file changes its directory's listing");
  assert.deepEqual(run(["skills/c/SKILL.md"], [...base, "skills/c/SKILL.md"]), ["tools/skills-scan.test.ts"], "a new directory changes its parent's listing");
  assert.deepEqual(run(["skills/b/SKILL.md"], base.filter((file) => file !== "skills/b/SKILL.md")), ["tools/skills-scan.test.ts"], "removing a directory's last file changes its parent's listing");
  assert.deepEqual(run(["skills/a/SKILL.md"], base), [], "an edit leaves every listing as it was");
  assert.deepEqual(run(["skills/a/SKILL.md"], base, null), ["tools/top-scan.test.ts"], "without the base tree, a changed path may have changed only its own directory's listing");
});

void test("code#14475: a scanner that listed a directory recursively is selected when an entry anywhere under it is added or removed", () => {
  const base = ["skills/a/refs/one.md", "tools/deep-scan.test.ts"];
  const baseEntries = new Set([...base, "skills", "skills/a", "skills/a/refs", "tools"]);
  const traceMap = new Map([["skills/**", ["tools/deep-scan.test.ts"]]]);
  const run = (changedPaths: string[], files: string[]) => selectAffectedTests({
    changedPaths, files, readFile: () => "", traceMap, inBase: (file) => baseEntries.has(file),
  }).tests;
  assert.deepEqual(run(["skills/a/refs/two.md"], [...base, "skills/a/refs/two.md"]), ["tools/deep-scan.test.ts"], "an added file two levels down");
  assert.deepEqual(run(["skills/a/refs/one.md"], ["tools/deep-scan.test.ts"]), ["tools/deep-scan.test.ts"], "a removed file");
  assert.deepEqual(run(["skills/a/refs/one.md"], base), [], "an edit");
  assert.deepEqual(run(["docs/new.md"], [...base, "docs/new.md"]), [], "an addition outside the listed tree");
});

void test("a changed test or selfcheck selects itself", () => {
  const selection = select(["a/x.test.ts", "a/y.selfcheck.ts"], { "a/x.test.ts": "", "a/y.selfcheck.ts": "" });
  assert.deepEqual(selection.tests, ["a/x.test.ts"]);
  assert.deepEqual(selection.selfchecks, ["a/y.selfcheck.ts"]);
  assert.equal(selection.reasons["a/x.test.ts"]?.edge, "changed");
});

void test("selects tests that name a spawned script or a data file", () => {
  const selection = select(["tools/run-thing.ts", "contracts/thing-map.json"], {
    "tools/run-thing.ts": "",
    "contracts/thing-map.json": "{}",
    "tools/spawn.test.ts": 'spawnSync(process.execPath, [path.join(here, "run-thing.ts")]);',
    "tools/map.test.ts": 'readFileSync("contracts/thing-map.json", "utf8");',
    "tools/quiet.test.ts": 'readFileSync("other.json");',
  });
  assert.deepEqual(selection.tests, ["tools/map.test.ts", "tools/spawn.test.ts"]);
});

void test("a reference to an importer of the changed file selects the referrer", () => {
  const selection = select(["lib/shared.ts"], {
    "lib/shared.ts": "",
    "bin/command.ts": 'import "../lib/shared.ts";',
    "bin/command-cli.test.ts": 'spawnSync("node", ["bin/command.ts"]);',
  });
  assert.deepEqual(selection.reasons["bin/command-cli.test.ts"], { edge: "reference", from: "bin/command.ts (via lib/shared.ts)" });
});

void test("a basename shared by several files only matches with its parent directory", () => {
  const files = {
    "skills/alpha/SKILL.md": "",
    "skills/beta/SKILL.md": "",
    "skills/alpha.test.ts": 'read("skills/alpha/SKILL.md");',
    "skills/generic.test.ts": 'read("SKILL.md");',
    "skills/beta.test.ts": 'read("beta/SKILL.md");',
  };
  assert.deepEqual(select(["skills/alpha/SKILL.md"], files).tests, ["skills/alpha.test.ts"]);
  assert.deepEqual(select(["skills/beta/SKILL.md"], files).tests, ["skills/beta.test.ts"]);
});

void test("a shared top-level basename matches only bare mentions", () => {
  const selection = select(["AGENTS.md"], {
    "AGENTS.md": "",
    "repos/infra/AGENTS.md": "",
    "tests/root.test.ts": 'read(path.join(root, "AGENTS.md"));',
    "tests/leaf.test.ts": 'read("repos/infra/AGENTS.md");',
  });
  assert.deepEqual(selection.tests, ["tests/root.test.ts"]);
});

void test("a fixture change selects the tests beside its fixtures directory", () => {
  const selection = select(["tools/usage/fixtures/case/input.json"], {
    "tools/usage/fixtures/case/input.json": "{}",
    "tools/usage/usage.test.ts": 'const dir = path.join(here, "fixtures");',
    "tools/usage/sub/deeper.test.ts": "",
    "tools/other.test.ts": "",
  });
  assert.deepEqual(selection.tests, ["tools/usage/usage.test.ts"]);
  assert.equal(selection.reasons["tools/usage/usage.test.ts"]?.edge, "fixture");
});

void test("package.json selects only tests its changed scripts name", () => {
  const files = {
    "package.json": "{}",
    "tools/a.test.ts": 'read("package.json");',
    "tools/b.selfcheck.ts": "",
  };
  const selection = select(["package.json"], files, ["node --experimental-strip-types tools/b.selfcheck.ts"]);
  assert.deepEqual(selection.tests, []);
  assert.deepEqual(selection.selfchecks, ["tools/b.selfcheck.ts"]);
  assert.equal(selection.reasons["tools/b.selfcheck.ts"]?.edge, "script");
});

void test("a deleted file still selects the tests that import it", () => {
  const selection = select(["src/gone.ts"], { "src/user.test.ts": 'import "./gone.ts";' });
  assert.deepEqual(selection.tests, ["src/user.test.ts"]);
});

void test("an unrelated change selects nothing", () => {
  assert.deepEqual(select(["docs/note.md"], { "docs/note.md": "", "src/a.test.ts": "" }).tests, []);
});

void test("changedScriptText returns only new or edited script commands", () => {
  const base = { scripts: { keep: "node a.ts", edit: "node b.ts", gone: "node c.ts" } };
  const current = { scripts: { keep: "node a.ts", edit: "node b2.ts", add: "node d.ts" } };
  assert.deepEqual(changedScriptText(base, current), ["node b2.ts", "node d.ts"]);
  assert.deepEqual(changedScriptText(null, { scripts: { x: "y" } }), ["y"]);
});

void test("a dynamic import(modulePath) literal selects the naming file and its direct importers", () => {
  const selection = select(["lane/detect.ts"], {
    "lane/detect.ts": "",
    "checks/coverage.ts": 'const DETECTORS = [{ modulePath: "../lane/detect.ts" }]; // also see "../lane/other.ts"',
    "checks/coverage.selfcheck.ts": 'import { run } from "./coverage.ts";',
    "checks/far.test.ts": 'import "./near.ts";',
    "checks/near.ts": 'import "./coverage.ts";',
    "checks/commented.ts": '// see "../lane/detect.ts": a comment names nothing',
    "checks/commented.selfcheck.ts": 'import "./commented.ts";',
  });
  assert.deepEqual(selection.selfchecks, ["checks/coverage.selfcheck.ts"]);
  assert.deepEqual(selection.tests, []);
  assert.deepEqual(selection.reasons["checks/coverage.selfcheck.ts"], { edge: "literal", from: "checks/coverage.ts (via lane/detect.ts)" });
});

void test("a test naming a directory is selected by changes under it", () => {
  const selection = select(["skills/route/SKILL.md"], {
    "skills/route/SKILL.md": "",
    "skills/route/scripts/a.ts": "",
    "tests/route-docs.test.ts": 'const dir = path.join(root, "skills", "route");',
    "tests/scripts.test.ts": 'readdirSync("skills/route/scripts");',
    "tests/top.test.ts": 'readdirSync("skills");',
  });
  assert.deepEqual(selection.tests, ["tests/route-docs.test.ts"]);
  assert.equal(selection.reasons["tests/route-docs.test.ts"]?.edge, "directory");
});

function upstreamFixture(): { contents: Record<string, string>; upstream: (changedPackages?: string[]) => UpstreamInput } {
  const contents: Record<string, string> = {
    "node_modules/up/package.json": JSON.stringify({ exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, "./gate": "./dist/gate/index.js", "./types": "./src/types.ts" } }),
    "node_modules/up/dist/index.js": 'export * from "./core.js";',
    "node_modules/up/dist/core.js": "",
    "node_modules/up/dist/gate/index.js": 'import "../shared.js";',
    "node_modules/up/dist/shared.js": "",
    "node_modules/up/src/types.ts": "",
    "node_modules/down/package.json": JSON.stringify({ exports: { ".": "./index.js" } }),
    "node_modules/down/index.js": 'import { gate } from "up/gate";',
    "node_modules/runner/package.json": "{}",
    "node_modules/runner/preload.ts": 'import "./env.ts";',
    "node_modules/runner/env.ts": "",
    "node_modules/runner/lint.ts": "",
    "src/root.test.ts": 'import { core } from "up";',
    "src/lib.ts": 'import { gate } from "up/gate";',
    "src/lib.test.ts": 'import "./lib.ts";',
    "src/types.test.ts": 'import type { T } from "up/types";',
    "src/down.test.ts": 'import "down";',
    "src/none.selfcheck.ts": "",
  };
  return {
    contents,
    upstream: (changedPackages = []) => ({
      packages: ["up", "down", "runner"],
      changedPackages,
      listFiles: (name) => Object.keys(contents).filter((file) => file.startsWith(`node_modules/${name}/`)),
      runnerPreloads: ["node_modules/runner/preload.ts"],
    }),
  };
}

void test("an upstream file selects importers of the subpaths that load it, through other internal packages", () => {
  const { contents, upstream } = upstreamFixture();
  const gate = select(["node_modules/up/dist/shared.js"], contents, [], upstream());
  assert.deepEqual(gate.tests, ["src/down.test.ts", "src/lib.test.ts"]);
  assert.deepEqual(gate.reasons["src/lib.test.ts"], { edge: "import", from: "up/gate" });
  assert.deepEqual(select(["node_modules/up/dist/core.js"], contents, [], upstream()).tests, ["src/root.test.ts"]);
});

void test("a whole upstream package selects every value importer, never type-only ones", () => {
  const { contents, upstream } = upstreamFixture();
  const selection = select([], contents, [], upstream(["up"]));
  assert.deepEqual(selection.tests, ["src/down.test.ts", "src/lib.test.ts", "src/root.test.ts"]);
  assert.equal(selection.reasons["src/root.test.ts"]?.edge, "package");
});

void test("a change the runner preload loads selects every test and selfcheck; other files of its package do not", () => {
  const { contents, upstream } = upstreamFixture();
  const preload = select(["node_modules/runner/env.ts"], contents, [], upstream());
  assert.deepEqual(preload.tests, ["src/down.test.ts", "src/lib.test.ts", "src/root.test.ts", "src/types.test.ts"]);
  assert.equal(preload.reasons["src/types.test.ts"]?.edge, "runner");
  assert.deepEqual(preload.selfchecks, ["src/none.selfcheck.ts"]);
  assert.equal(preload.reasons["src/none.selfcheck.ts"]?.edge, "runner");
  assert.deepEqual(select(["node_modules/runner/lint.ts"], contents, [], upstream()).tests, []);
});
