/**
 * Lifetime of roots created by the hermetic environment owner.
 * Cooperating callers fence every external writer before launch. JSON/PID absence
 * is never reconstructed into native settlement authority after creator loss.
 */
import { randomUUID } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, opendirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname, uptime } from "node:os";
import path from "node:path";
import { isMainThread } from "node:worker_threads";
import { capturePnpmCacheBytes, restorePnpmCacheBytes, type HermeticPnpmCacheBinding, type HermeticPnpmCacheSnapshot } from "./pnpm-cache.ts";

export const HERMETIC_OWNER_MARKER = ".fleet-hermetic-owner";
/** Retained for compatibility; age no longer grants scope-empty proof. */
export const HERMETIC_SWEEP_MIN_AGE_MS = 6 * 60 * 60_000;
export const HERMETIC_SWEEP_ENTRY_BUDGET = 500;
export interface HermeticRootGeneration { dev: string; ino: string; birthtimeNs: string }
export interface HermeticOwner { pid: number; host: string; boot: string; createdAt: number }
interface WriterMarker extends HermeticOwner {
  creator: string;
  generation: HermeticRootGeneration;
  pending: string[];
  retained: boolean;
}
interface OwnedRoot { root: string; marker: WriterMarker }
const ownedRoots = new Map<string, OwnedRoot>();
let exitHookRegistered = false;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function bootIdentity(): string {
  try { return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(); }
  catch { return "boot-minute-" + String(Math.round((Date.now() / 1000 - uptime()) / 60)); }
}
export function hermeticRootGeneration(root: string): HermeticRootGeneration {
  const stat = lstatSync(root, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.ino <= 0n || stat.birthtimeNs <= 0n) {
    throw new Error("hermetic root has no usable ordinary directory generation");
  }
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}
function sameGeneration(left: HermeticRootGeneration, right: HermeticRootGeneration): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs;
}
function persist(owned: OwnedRoot): void {
  if (!sameGeneration(owned.marker.generation, hermeticRootGeneration(owned.root))) {
    owned.marker.retained = true;
    throw new Error("hermetic root generation changed; cleanup refused");
  }
  const temporary = path.join(owned.root, HERMETIC_OWNER_MARKER + "." + randomUUID());
  writeFileSync(temporary, JSON.stringify(owned.marker), { mode: 0o600, flag: "wx" });
  renameSync(temporary, path.join(owned.root, HERMETIC_OWNER_MARKER));
}
function readMarker(root: string): unknown {
  const file = path.join(root, HERMETIC_OWNER_MARKER), before = lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("hermetic marker is not ordinary data");
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > 64n * 1024n) throw new Error("hermetic owner marker is not bounded ordinary data");
    const limit = 64 * 1024, buffer = Buffer.alloc(limit + 1);
    let observed = 0;
    while (observed <= limit) {
      const bytes = readSync(fd, buffer, observed, limit + 1 - observed, null);
      if (!bytes) break;
      observed += bytes;
      if (observed > limit) throw new Error("hermetic owner marker grew beyond its bound");
    }
    const after = fstatSync(fd, { bigint: true }), currentPath = lstatSync(file, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
      || BigInt(observed) !== after.size || currentPath.isSymbolicLink()
      || currentPath.dev !== after.dev || currentPath.ino !== after.ino || currentPath.size !== after.size) {
      throw new Error("hermetic owner marker changed while it was read");
    }
    const value: unknown = JSON.parse(buffer.subarray(0, observed).toString("utf8"));
    return value;
  } finally { closeSync(fd); }
}
function current(root: string): OwnedRoot {
  const owned = ownedRoots.get(path.resolve(root));
  if (!owned) throw new Error("hermetic root was not created by this owner; cleanup refused");
  try {
    if (!sameGeneration(owned.marker.generation, hermeticRootGeneration(root))
      || JSON.stringify(readMarker(root)) !== JSON.stringify(owned.marker)) {
      throw new Error("hermetic root identity or writer state changed; cleanup refused");
    }
  } catch (error) { owned.marker.retained = true; throw error; }
  return owned;
}
function latch(owned: OwnedRoot): void {
  owned.marker.retained = true;
  // A failed write leaves the already-persisted pending fence in place.
  try { persist(owned); } catch { /* In-process cleanup also sees the sticky retained state. */ }
}

/** Internal creator: minting happens here, immediately after the actual mkdtemp. */
export function createHermeticRoot(parent: string, prefix: string): string {
  mkdirSync(parent, { recursive: true });
  const root = path.resolve(mkdtempSync(path.join(parent, prefix)));
  const owned: OwnedRoot = { root, marker: {
    pid: process.pid, host: hostname(), boot: bootIdentity(), createdAt: Date.now(),
    creator: randomUUID(), generation: hermeticRootGeneration(root), pending: [], retained: false,
  } };
  ownedRoots.set(root, owned);
  try { persist(owned); } catch (error) { owned.marker.retained = true; throw error; }
  if (isMainThread && !exitHookRegistered) {
    process.once("exit", removeOwnedRoots);
    exitHookRegistered = true;
  }
  return root;
}
/** Compatibility entry: existing paths cannot be adopted into creator authority. */
export function disposeHermeticRootOnExit(root: string): string {
  current(root);
  return root;
}
/** Sticky conservative refusal. It grants no native authority and has no reset API. */
export function retainHermeticRoot(root: string): void { latch(current(root)); }

/**
 * Synchronous cooperating-caller port, not a kernel classifier implementation.
 * The caller supplies its canonical native classifier; it receives the EXACT
 * original result returned by run, before any negative fixture view is injected.
 * No boolean/marker/path can complete a pending operation through this API.
 */
export function runWithHermeticRootCommand<T>(
  root: string,
  run: () => T,
  classify: (original: T) => unknown,
): T {
  const owned = current(root);
  if (owned.marker.retained) throw new Error("hermetic root retains an unresolved writer");
  const pending = randomUUID();
  owned.marker.pending.push(pending);
  try {
    persist(owned); // Durable BEFORE native launch, including abnormal process exit.
    const original = run();
    if (record(original) && typeof original["then"] === "function") throw new TypeError("hermetic writer port is synchronous");
    const proof = classify(original);
    if (!record(proof) || proof["status"] !== "settled"
      || (proof["mechanism"] !== "linux-subreaper" && proof["mechanism"] !== "windows-job")) {
      latch(owned);
      return original;
    }
    // A sibling/nested UNKNOWN cannot be undone by this operation's settlement.
    if (!owned.marker.retained) {
      current(root);
      owned.marker.pending = owned.marker.pending.filter(value => value !== pending);
      persist(owned);
    }
    return original;
  } catch (error) { latch(owned); throw error; }
}

/** A surviving child is a VETO only. Its JSON can never grant parent cleanup. */
function ordinaryDeclaredParent(root: string, components: string[]): string | undefined {
  let directory = root;
  for (const component of components) {
    directory = path.join(directory, component);
    try {
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("declared hermetic temp parent is not ordinary");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }
  return directory;
}
function survivingHermeticChild(root: string): boolean {
  for (const child of ownedRoots.keys()) {
    const relative = path.relative(root, child);
    if (relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) return true;
  }
  let inspected = 0;
  // These are the builder and normal child-storage temp boundaries, not an
  // unbounded recursive crawl. Other descendants require the parent's native fence.
  for (const components of [[], ["tmp"], ["agents-temp", "tmp"]]) {
    const directory = ordinaryDeclaredParent(root, components);
    if (!directory) continue;
    const handle = opendirSync(directory);
    try {
      for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
        if (++inspected > 256) return true;
        if (entry.name === HERMETIC_OWNER_MARKER) continue;
        if (entry.name.startsWith("fleet-hermetic-preload-") || entry.name.startsWith("fleet-hermetic-test-")) return true;
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        try {
          // ANY child marker is a veto, never a positive cleanup assertion.
          lstatSync(path.join(directory, entry.name, HERMETIC_OWNER_MARKER));
          return true;
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) return true;
        }
      }
    } finally { handle.closeSync(); }
  }
  return false;
}
/** Cleanup only this creator's unchanged generation, with all actual uses settled. */
export function removeOwnedHermeticRoot(root: string): boolean {
  const owned = current(root);
  if (owned.marker.retained || owned.marker.pending.length || survivingHermeticChild(root)) return false;
  try {
    for (const name of readdirSync(root)) {
      if (name !== HERMETIC_OWNER_MARKER) rmSync(path.join(root, name), { recursive: true, force: true });
    }
    rmSync(path.join(root, HERMETIC_OWNER_MARKER));
    rmdirSync(root);
    ownedRoots.delete(owned.root);
    return true;
  } catch (error) { latch(owned); throw error; }
}
function removeOwnedRoots(): void {
  for (const root of [...ownedRoots.keys()].sort((left, right) => right.length - left.length)) {
    try { removeOwnedHermeticRoot(root); } catch { /* Unknown generations remain untouched. */ }
  }
}
export function isHermeticOwner(value: unknown): value is HermeticOwner {
  return record(value) && typeof value["pid"] === "number" && Number.isSafeInteger(value["pid"]) && value["pid"] > 0
    && typeof value["host"] === "string" && typeof value["boot"] === "string" && typeof value["createdAt"] === "number";
}
/**
 * Compatibility observer: neither a dead creator PID nor foreign marker JSON
 * proves native scope closure. This owner cannot recover foreign/legacy roots;
 * they remain for independently proven recovery. No new collector is introduced.
 */
export function sweepDeadHermeticRoots(
  _parent: string, _prefix: string, _now = Date.now(), _budget = HERMETIC_SWEEP_ENTRY_BUDGET,
): number { return 0; }

/** Capture only this creator's ordinary store after all its native uses settled. */
export function captureHermeticPnpmStore(root: string, binding: HermeticPnpmCacheBinding): HermeticPnpmCacheSnapshot {
  const owned = current(root);
  if (owned.marker.retained || owned.marker.pending.length) throw new Error("PNPM acquisition still has unresolved writers");
  try { return capturePnpmCacheBytes(root, binding); }
  catch (error) { latch(owned); throw error; }
}
/** Restore declared data into this creator's observed-empty store; never node_modules. */
export function restoreHermeticPnpmStore(
  root: string, source: HermeticPnpmCacheSnapshot, expected: HermeticPnpmCacheBinding,
): void {
  const owned = current(root);
  if (owned.marker.retained || owned.marker.pending.length) throw new Error("PNPM restore requires an idle owned target");
  const pending = randomUUID();
  owned.marker.pending.push(pending);
  try {
    persist(owned);
    restorePnpmCacheBytes(root, source, expected);
    current(root);
    owned.marker.pending = owned.marker.pending.filter(value => value !== pending);
    persist(owned);
  } catch (error) { latch(owned); throw error; }
}
