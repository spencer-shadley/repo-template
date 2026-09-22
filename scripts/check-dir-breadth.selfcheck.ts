#!/usr/bin/env node
/**
 * Selfcheck for check-dir-breadth.ts (repo-template#377).
 *
 * Verifies:
 * 1. Source file detection
 * 2. Allowlist cap extraction
 * 3. Closed allowlist owners fail (KNOWN_CLOSED + dynamic lookup)
 * 4. Unallowlisted over-cap directories fail
 * 5. Growth above a frozen exception ceiling fails
 * 6. Valid open allowlist owners pass
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allowlistCap,
  checkDirBreadth,
  extractIssueNumber,
  isSourceFile,
  KNOWN_CLOSED_ISSUES,
  type DirBreadthConfig,
} from "./check-dir-breadth.ts";

assert.equal(isSourceFile("foo.ts"), true);
assert.equal(isSourceFile("bar.js"), true);
assert.equal(isSourceFile("baz.mjs"), true);
assert.equal(isSourceFile("qux.txt"), false);
assert.equal(isSourceFile("readme"), false);

assert.equal(extractIssueNumber("https://github.com/spencer-shadley/repo-template/issues/376"), 376);
assert.equal(extractIssueNumber("https://github.com/spencer-shadley/repo-template/issues/412"), 412);
assert.equal(extractIssueNumber("not-a-url"), null);

assert.ok(KNOWN_CLOSED_ISSUES.has(376), "closed tip-red repair #376 must be known-closed");
assert.equal(KNOWN_CLOSED_ISSUES.has(412), false, "live split owner must not be known-closed");

const dummyCfg: DirBreadthConfig = {
  maxFilesPerDir: 5,
  roots: ["src"],
  ignoreDirNames: new Set(["node_modules"]),
  allowlist: [{
    path: "src/bigdir",
    maxFiles: 50,
    issue: "https://github.com/spencer-shadley/repo-template/issues/412",
  }],
};
assert.deepEqual(allowlistCap("src/bigdir", dummyCfg), {
  max: 50,
  issue: "https://github.com/spencer-shadley/repo-template/issues/412",
});
assert.equal(allowlistCap("src/smalldir", dummyCfg), null);

const tmpDir = join(tmpdir(), `rt-dir-breadth-selfcheck-${String(process.pid)}`);
try {
  mkdirSync(join(tmpDir, "src", "normal"), { recursive: true });
  mkdirSync(join(tmpDir, "src", "overcrowded"), { recursive: true });
  mkdirSync(join(tmpDir, "src", "exempt"), { recursive: true });

  for (let i = 0; i < 3; i++) {
    writeFileSync(join(tmpDir, "src", "normal", `file${String(i)}.ts`), "export {};\n");
  }
  for (let i = 0; i < 10; i++) {
    writeFileSync(join(tmpDir, "src", "overcrowded", `file${String(i)}.ts`), "export {};\n");
  }
  for (let i = 0; i < 8; i++) {
    writeFileSync(join(tmpDir, "src", "exempt", `file${String(i)}.ts`), "export {};\n");
  }

  // Unallowlisted overcrowded directory fails
  const cfgUngated = join(tmpDir, "config-ungated.json");
  writeFileSync(
    cfgUngated,
    JSON.stringify({
      maxFilesPerDir: 5,
      roots: ["src"],
      ignoreDirNames: ["node_modules"],
      allowlist: [],
    }),
  );
  const res1 = checkDirBreadth(tmpDir, cfgUngated);
  assert.equal(res1.ok, false);
  assert.ok(res1.violations.some((v) => /src\/overcrowded: 10 source files > max 5/.test(v)));

  // CLOSED allowlist owner (#376) fails offline via KNOWN_CLOSED_ISSUES
  const cfgClosed = join(tmpDir, "config-closed-owner.json");
  writeFileSync(
    cfgClosed,
    JSON.stringify({
      maxFilesPerDir: 5,
      roots: ["src"],
      ignoreDirNames: ["node_modules"],
      allowlist: [{
        path: "src/overcrowded",
        maxFiles: 15,
        issue: "https://github.com/spencer-shadley/repo-template/issues/376",
      }],
    }),
  );
  const res2 = checkDirBreadth(tmpDir, cfgClosed);
  assert.equal(res2.ok, false);
  assert.ok(res2.violations.some((v) => v.includes("closed issue #376")));

  // Growth above frozen exception ceiling fails
  const cfgCeiling = join(tmpDir, "config-ceiling.json");
  writeFileSync(
    cfgCeiling,
    JSON.stringify({
      maxFilesPerDir: 5,
      roots: ["src"],
      ignoreDirNames: ["node_modules"],
      allowlist: [{
        path: "src/overcrowded",
        maxFiles: 8,
        issue: "https://github.com/spencer-shadley/repo-template/issues/412",
      }],
    }),
  );
  const resCeiling = checkDirBreadth(tmpDir, cfgCeiling);
  assert.equal(resCeiling.ok, false);
  assert.ok(resCeiling.violations.some((v) => /src\/overcrowded: 10 source files > max 8/.test(v)));

  // Valid open allowlist owner passes
  const cfgOpen = join(tmpDir, "config-valid-open.json");
  writeFileSync(
    cfgOpen,
    JSON.stringify({
      maxFilesPerDir: 5,
      roots: ["src"],
      ignoreDirNames: ["node_modules"],
      allowlist: [
        {
          path: "src/overcrowded",
          maxFiles: 15,
          issue: "https://github.com/spencer-shadley/repo-template/issues/412",
        },
        {
          path: "src/exempt",
          maxFiles: 10,
          issue: "https://github.com/spencer-shadley/repo-template/issues/412",
        },
      ],
    }),
  );
  const res3 = checkDirBreadth(tmpDir, cfgOpen);
  assert.equal(res3.ok, true);
  assert.equal(res3.violations.length, 0);
  assert.equal(res3.allowlisted.length, 2);

  // Dynamic issue lookup catches closed issues not in KNOWN_CLOSED_ISSUES
  const cfgDynamic = join(tmpDir, "config-dynamic-closed.json");
  writeFileSync(
    cfgDynamic,
    JSON.stringify({
      maxFilesPerDir: 5,
      roots: ["src"],
      ignoreDirNames: ["node_modules"],
      allowlist: [{
        path: "src/overcrowded",
        maxFiles: 15,
        issue: "https://github.com/spencer-shadley/repo-template/issues/99999",
      }],
    }),
  );
  const res4 = checkDirBreadth(tmpDir, cfgDynamic, {
    issueLookup: () => ({ state: "CLOSED" }),
  });
  assert.equal(res4.ok, false);
  assert.ok(res4.violations.some((v) => v.includes("dynamically verified closed issue #99999")));

  console.log("check-dir-breadth.selfcheck: ok");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
