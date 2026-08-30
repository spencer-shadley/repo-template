import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const forceHook = path.join(
  root,
  "scripts",
  "force-typescript6-for-eslint.ts",
);
const eslintPackage = require.resolve("eslint/package.json");
const eslintBinary = path.join(
  path.dirname(eslintPackage),
  "bin",
  "eslint.js",
);

if (!existsSync(eslintBinary)) {
  throw new Error(`run-eslint: missing eslint CLI at ${eslintBinary}`);
}

const result = spawnSync(
  process.execPath,
  ["--import", pathToFileURL(forceHook).href, eslintBinary, ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  },
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
