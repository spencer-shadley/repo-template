#!/usr/bin/env node
/**
 * repo-quality export-surface snapshot (repo-template#463 P4).
 *
 * The kit's consumer contract is its `index.d.ts` export names plus its package.json `exports` subpaths.
 * `packages/repo-quality/export-surface.json` records that surface for the current kit version. This check:
 *   ES1: `index.d.ts` names only what the runtime `index.mjs` really exports (a stale declaration hides a removal).
 *   ES2: a name removed since the snapshot is refused unless the kit version bumps MAJOR or the snapshot
 *        carries an explicit `acknowledgedRemovals` note for it (repo-template 3770b31 removed `fleetPlugin`
 *        in a minor release and broke code's quality-lint).
 *   ES3: the snapshot matches the current version and surface, so every kit release re-records it (`--write`).
 *
 * Usage: node scripts/check-repo-quality-export-surface.ts [--check|--write|--self-test]
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import semver from "semver";

export interface AcknowledgedRemoval {
  readonly name: string;
  readonly note: string;
}

export interface ExportSurfaceSnapshot {
  readonly packageVersion: string;
  readonly typeExports: readonly string[];
  readonly subpathExports: readonly string[];
  readonly acknowledgedRemovals?: readonly AcknowledgedRemoval[];
}

export interface ExportSurface {
  readonly packageVersion: string;
  readonly typeExports: readonly string[];
  readonly subpathExports: readonly string[];
  readonly runtimeExports: readonly string[];
}

export interface ExportSurfaceViolation {
  readonly rule: "ES1" | "ES2" | "ES3";
  readonly message: string;
}

const byName = (left: string, right: string): number => left.localeCompare(right, "en");
const sortedNames = (names: readonly string[]): string[] => names.toSorted(byName);

const DECLARATION_EXPORT = /^export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/gmu;
const TYPE_ONLY_EXPORT = /^export\s+(?:declare\s+)?(?:interface|type)\s+/u;

/** Value export names declared in a .d.ts (type-only declarations have no runtime counterpart). */
export function declaredValueExports(declarations: string): string[] {
  const names: string[] = [];
  for (const match of declarations.matchAll(DECLARATION_EXPORT)) {
    const name = match[1];
    if (name !== undefined && !TYPE_ONLY_EXPORT.test(match[0])) names.push(name);
  }
  return sortedNames(names);
}

export function declaredExports(declarations: string): string[] {
  return sortedNames([...declarations.matchAll(DECLARATION_EXPORT)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])));
}

export function evaluateExportSurface(snapshot: ExportSurfaceSnapshot, current: ExportSurface): ExportSurfaceViolation[] {
  const violations: ExportSurfaceViolation[] = [];
  const runtime = new Set(current.runtimeExports);
  for (const name of current.typeExports) {
    if (!runtime.has(name)) {
      violations.push({ rule: "ES1", message: `index.d.ts declares '${name}' but index.mjs does not export it` });
    }
  }

  const currentNames = new Set([...current.typeExports, ...current.subpathExports]);
  const removed = [...snapshot.typeExports, ...snapshot.subpathExports].filter((name) => !currentNames.has(name));
  const majorBump = semver.major(current.packageVersion) > semver.major(snapshot.packageVersion);
  const acknowledged = new Map((snapshot.acknowledgedRemovals ?? []).map((entry) => [entry.name, entry.note.trim()]));
  for (const name of removed) {
    if (!majorBump && !acknowledged.get(name)) {
      violations.push({
        rule: "ES2",
        message: `export '${name}' was removed in ${current.packageVersion} (snapshot ${snapshot.packageVersion}); `
          + "removing a kit export needs a MAJOR version or an acknowledgedRemovals note in export-surface.json",
      });
    }
  }

  const same = (left: readonly string[], right: readonly string[]) => JSON.stringify(sortedNames(left)) === JSON.stringify(sortedNames(right));
  if (
    snapshot.packageVersion !== current.packageVersion
    || !same(snapshot.typeExports, current.typeExports)
    || !same(snapshot.subpathExports, current.subpathExports)
  ) {
    violations.push({
      rule: "ES3",
      message: `export-surface.json records ${snapshot.packageVersion} but the kit is ${current.packageVersion} with a different surface; `
        + "run: node scripts/check-repo-quality-export-surface.ts --write",
    });
  }
  return violations;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = join(root, "packages", "repo-quality");
const snapshotPath = join(kitRoot, "export-surface.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(value)) throw new TypeError(`${path} must be a JSON object`);
  return value;
}

function stringList(value: unknown, label: string): string[] {
  const entries: unknown[] = Array.isArray(value) ? value : [];
  const strings = entries.filter((entry): entry is string => typeof entry === "string");
  if (!Array.isArray(value) || strings.length !== entries.length) throw new TypeError(`${label} must be a string array`);
  return strings;
}

async function readCurrentSurface(): Promise<ExportSurface> {
  const manifest = readJsonRecord(join(kitRoot, "package.json"));
  const { version, exports } = manifest;
  if (typeof version !== "string" || !isRecord(exports)) throw new TypeError("repo-quality package.json needs version and exports");
  const runtime: unknown = await import(pathToFileURL(join(kitRoot, "index.mjs")).href);
  if (!isRecord(runtime)) throw new TypeError("repo-quality index.mjs did not load as a module namespace");
  const declarations = readFileSync(join(kitRoot, "index.d.ts"), "utf8");
  const valueNames = new Set(declaredValueExports(declarations));
  const typeOnlyNames = declaredExports(declarations).filter((name) => !valueNames.has(name));
  return {
    packageVersion: version,
    typeExports: declaredExports(declarations),
    subpathExports: sortedNames(Object.keys(exports)),
    runtimeExports: [...Object.keys(runtime), ...typeOnlyNames],
  };
}

function readSnapshot(): ExportSurfaceSnapshot {
  const raw = readJsonRecord(snapshotPath);
  const { packageVersion, acknowledgedRemovals } = raw;
  if (typeof packageVersion !== "string") throw new TypeError("export-surface.json needs packageVersion");
  const acks: AcknowledgedRemoval[] = [];
  if (acknowledgedRemovals !== undefined) {
    if (!Array.isArray(acknowledgedRemovals)) throw new TypeError("acknowledgedRemovals must be an array");
    for (const entry of acknowledgedRemovals) {
      if (!isRecord(entry) || typeof entry["name"] !== "string" || typeof entry["note"] !== "string") {
        throw new TypeError("each acknowledgedRemovals entry needs string name and note");
      }
      acks.push({ name: entry["name"], note: entry["note"] });
    }
  }
  return {
    packageVersion,
    typeExports: stringList(raw["typeExports"], "typeExports"),
    subpathExports: stringList(raw["subpathExports"], "subpathExports"),
    ...(acknowledgedRemovals === undefined ? {} : { acknowledgedRemovals: acks }),
  };
}

function selfTest(): void {
  const base: ExportSurfaceSnapshot = {
    packageVersion: "1.12.0",
    typeExports: ["qualityRules", "fleetPlugin"],
    subpathExports: [".", "./secret-scan.mjs"],
  };
  const surface = (version: string, typeExports: string[], runtimeExports = typeExports): ExportSurface => ({
    packageVersion: version,
    typeExports,
    subpathExports: [".", "./secret-scan.mjs"],
    runtimeExports,
  });

  assert.deepEqual(evaluateExportSurface(base, surface("1.12.0", ["fleetPlugin", "qualityRules"])), []);

  const minorRemoval = evaluateExportSurface(base, surface("1.13.0", ["qualityRules"]));
  assert.ok(minorRemoval.some((v) => v.rule === "ES2" && v.message.includes("'fleetPlugin'")));

  const majorRemoval = evaluateExportSurface(base, surface("2.0.0", ["qualityRules"]));
  assert.ok(majorRemoval.every((v) => v.rule !== "ES2"));
  assert.ok(majorRemoval.some((v) => v.rule === "ES3"));

  const acknowledged = evaluateExportSurface(
    { ...base, acknowledgedRemovals: [{ name: "fleetPlugin", note: "use qualityRules(); consumers repaired in code#7059" }] },
    surface("1.13.0", ["qualityRules"]),
  );
  assert.ok(acknowledged.every((v) => v.rule !== "ES2"));
  const blankNote = evaluateExportSurface(
    { ...base, acknowledgedRemovals: [{ name: "fleetPlugin", note: "  " }] },
    surface("1.13.0", ["qualityRules"]),
  );
  assert.ok(blankNote.some((v) => v.rule === "ES2"));

  const subpathRemoval = evaluateExportSurface(base, { ...surface("1.12.1", ["fleetPlugin", "qualityRules"]), subpathExports: ["."] });
  assert.ok(subpathRemoval.some((v) => v.rule === "ES2" && v.message.includes("./secret-scan.mjs")));

  const addition = evaluateExportSurface(base, surface("1.13.0", ["fleetPlugin", "qualityRules", "newThing"]));
  assert.deepEqual(addition.map((v) => v.rule), ["ES3"]);

  const staleDeclaration = evaluateExportSurface(base, surface("1.12.0", ["fleetPlugin", "qualityRules"], ["qualityRules"]));
  assert.ok(staleDeclaration.some((v) => v.rule === "ES1" && v.message.includes("'fleetPlugin'")));

  const dts = "export const A: string;\nexport function b(): void;\nexport interface C {}\nexport type D = string;\n";
  assert.deepEqual(declaredExports(dts), ["A", "b", "C", "D"]);
  assert.deepEqual(declaredValueExports(dts), ["A", "b"]);
  console.log("check-repo-quality-export-surface: self-test passed");
}

async function main(): Promise<number> {
  const mode = process.argv[2] ?? "--check";
  if (mode === "--self-test") {
    selfTest();
    return 0;
  }
  if (mode !== "--check" && mode !== "--write") {
    throw new Error("usage: node scripts/check-repo-quality-export-surface.ts [--check|--write|--self-test]");
  }
  const current = await readCurrentSurface();
  const snapshot = readSnapshot();
  const violations = evaluateExportSurface(snapshot, current);
  const blocking = mode === "--write" ? violations.filter((v) => v.rule !== "ES3") : violations;
  if (blocking.length > 0) {
    console.error("check-repo-quality-export-surface: FAIL");
    for (const violation of blocking) console.error(`${violation.rule} ${violation.message}`);
    return 1;
  }
  if (mode === "--write") {
    const next: ExportSurfaceSnapshot = {
      packageVersion: current.packageVersion,
      typeExports: current.typeExports,
      subpathExports: current.subpathExports,
      ...(snapshot.acknowledgedRemovals ? { acknowledgedRemovals: snapshot.acknowledgedRemovals } : {}),
    };
    writeFileSync(snapshotPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    console.log(`check-repo-quality-export-surface: wrote snapshot for ${current.packageVersion}`);
    return 0;
  }
  console.log(`check-repo-quality-export-surface: ok (${current.packageVersion}, ${String(current.typeExports.length)} names, ${String(current.subpathExports.length)} subpaths)`);
  return 0;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  process.exitCode = await main();
}