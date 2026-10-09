#!/usr/bin/env node
/**
 * Emit published `.mjs` artifacts from `packages/repo-quality/*.ts`.
 * Generated output is the stable consumer contract; do not edit it by hand.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.join(root, "packages", "repo-quality");
export const sources = ["index.ts", "jscpd.ts", "knip.ts", "secret-scan.ts"] as const;

function portable(filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function generatedName(sourceName: (typeof sources)[number]): string {
  return sourceName.replace(/\.ts$/u, ".mjs");
}

function generatedPath(sourceName: (typeof sources)[number]): string {
  return path.join(pkg, generatedName(sourceName));
}

function withBanner(sourceName: (typeof sources)[number], emittedJs: string): string {
  const banner = `// @generated from ${sourceName}. DO NOT EDIT.\n// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."\n`;
  let output = emittedJs.replaceAll("\r\n", "\n");
  if (output.startsWith("#!")) {
    const newline = output.indexOf("\n");
    output = `${output.slice(0, newline + 1)}${banner}${output.slice(newline + 1)}`;
  } else {
    output = `${banner}${output}`;
  }
  if (!output.endsWith("\n")) output += "\n";
  return output;
}

export function emitAll(): Map<(typeof sources)[number], string> {
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
    const output = new Map<(typeof sources)[number], string>();
    for (const sourceName of sources) {
      const jsName = sourceName.replace(/\.ts$/u, ".js");
      const jsPath = path.join(emittedRoot, jsName);
      output.set(sourceName, withBanner(sourceName, readFileSync(jsPath, "utf8")));
    }
    return output;
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
    rmSync(tsconfigPath, { force: true });
  }
}

function writeAll(): void {
  const emitted = emitAll();
  for (const sourceName of sources) {
    const bytes = emitted.get(sourceName);
    if (bytes === undefined) throw new Error(`emit missed ${sourceName}`);
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
  for (const sourceName of sources) {
    const bytes = emitted.get(sourceName);
    if (bytes === undefined) throw new Error(`emit missed ${sourceName}`);
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
