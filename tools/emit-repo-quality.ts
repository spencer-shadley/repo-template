#!/usr/bin/env node
/**
 * Emit published `.mjs` artifacts from `packages/repo-quality/*.ts`.
 * Generated output is the stable consumer contract; do not edit it by hand.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.join(root, "packages", "repo-quality");
/**
 * Subpath modules whose `.mjs` launchers and `exports` entries must resolve to JavaScript: Node
 * refuses to strip types under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so a
 * git consumer cannot load the `.ts` sources directly (repo-template#491).
 */
const subpathDirs = ["default-branch-guard", "docs-only-gate", "hermetic-test-preload", "todo-issue-link"] as const;

function subpathSources(): string[] {
  return subpathDirs.flatMap((dir) =>
    readdirSync(path.join(pkg, dir))
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => `${dir}/${name}`),
  );
}

export const sources: readonly string[] = ["index.ts", "jscpd.ts", "knip.ts", "secret-scan.ts", ...subpathSources()];

function portable(filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function generatedName(sourceName: string): string {
  return sourceName.replace(/\.ts$/u, ".mjs");
}

function generatedPath(sourceName: string): string {
  return path.join(pkg, generatedName(sourceName));
}

function withBanner(sourceName: string, emittedJs: string): string {
  const banner = `// @generated from ${sourceName}. DO NOT EDIT.\n// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."\n`;
  // tsc rewrites relative `./x.ts` specifiers to `./x.js`; the committed siblings are `.mjs`.
  let output = emittedJs.replaceAll("\r\n", "\n");
  const dir = path.posix.dirname(sourceName);
  for (const sibling of sources) {
    if (path.posix.dirname(sibling) !== dir) continue;
    const base = path.posix.basename(sibling, ".ts");
    for (const quote of ['"', "'"]) {
      output = output.replaceAll(`${quote}./${base}.js${quote}`, `${quote}./${base}.mjs${quote}`);
    }
  }
  if (output.startsWith("#!")) {
    const newline = output.indexOf("\n");
    output = `${output.slice(0, newline + 1)}${banner}${output.slice(newline + 1)}`;
  } else {
    output = `${banner}${output}`;
  }
  if (!output.endsWith("\n")) output += "\n";
  return output;
}

export function emitAll(): Map<string, string> {
  const ownedRoot = mkdtempSync(path.join(os.tmpdir(), "repo-quality-emit-"));
  const emittedRoot = path.join(ownedRoot, "emitted");
  const tsconfigPath = path.join(root, ".repo-quality-emit.json");
  const tsconfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      noEmit: false,
      skipLibCheck: true,
      allowImportingTsExtensions: false,
      rewriteRelativeImportExtensions: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      rootDir: "packages/repo-quality",
      outDir: emittedRoot.split(path.sep).join("/"),
    },
    include: sources.map((sourceName) => `packages/repo-quality/${sourceName}`),
  };
  writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");
  try {
    const tsc = spawnSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", tsconfigPath], {
      cwd: root,
      encoding: "utf8",
    });
    if (tsc.error) throw tsc.error;
    if (tsc.status !== 0) {
      throw new Error(tsc.stdout || tsc.stderr || `tsc exited ${String(tsc.status)}`);
    }
    const output = new Map<string, string>();
    for (const sourceName of sources) {
      const jsName = sourceName.replace(/\.ts$/u, ".js");
      const jsPath = path.join(emittedRoot, jsName);
      const js = readFileSync(jsPath, "utf8");
      // A type-only module emits `export {};`; type imports are elided, so no runtime file is needed.
      const code = js.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("/") && !line.startsWith("*"));
      if (code.length === 1 && code[0] === "export {};") continue;
      output.set(sourceName, withBanner(sourceName, js));
    }
    return output;
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
    rmSync(tsconfigPath, { force: true });
  }
}

function writeAll(): void {
  const emitted = emitAll();
  for (const [sourceName, bytes] of emitted) {
    writeFileSync(generatedPath(sourceName), bytes, "utf8");
  }
}

/**
 * The emitted .mjs files ARE committed: consumers install this package straight from git
 * (`github:spencer-shadley/repo-template#path:packages/repo-quality`), where no build step runs
 * and Node refuses to strip types under node_modules, so `exports` must resolve to committed JS.
 * The emit must compile, carry the generated banner, parse as ESM, and match the committed file
 * (a missing or stale entrypoint breaks every git consumer at tip; repo-template#484 regression).
 */
function checkAll(): void {
  const emitted = emitAll();
  const problems: string[] = [];
  for (const [sourceName, bytes] of emitted) {
    const banner = `// @generated from ${sourceName}. DO NOT EDIT.`;
    if (!bytes.includes(banner)) problems.push(`${sourceName}: emitted output lacks the generated banner`);
    const syntax = spawnSync(process.execPath, ["--input-type=module", "--check"], {
      input: bytes,
      encoding: "utf8",
    });
    if (syntax.status !== 0) problems.push(`${sourceName}: emitted output is not valid ESM: ${syntax.stderr}`);
    const onDisk = generatedPath(sourceName);
    if (!existsSync(onDisk)) {
      problems.push(`${portable(onDisk)}: missing; run pnpm repo-quality:emit and commit it`);
    } else if (readFileSync(onDisk, "utf8").replaceAll("\r\n", "\n") !== bytes) {
      problems.push(`${portable(onDisk)}: stale vs ${sourceName}; run pnpm repo-quality:emit and commit it`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`repo-quality emit check failed:\n${problems.join("\n")}`);
  }
}

if (import.meta.main) {
  const action = process.argv[2];
  if (action !== "write" && action !== "check") {
    throw new Error("usage: node tools/emit-repo-quality.ts <write|check>");
  }
  if (action === "write") writeAll();
  else checkAll();
}
