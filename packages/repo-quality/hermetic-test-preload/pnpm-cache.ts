/**
 * Byte-transfer mechanics for a caller-proved normal PNPM cache acquisition.
 * Hashes/bindings do not prove credential absence, package provenance or native
 * settlement. The actual normal acquisition caller must establish those facts;
 * these primitives never authorize borrowing an installed node_modules graph.
 */
import { createHash } from "node:crypto";
import { constants, closeSync, cpSync, fstatSync, lstatSync, opendirSync, openSync, readSync, realpathSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";

export interface HermeticPnpmCacheBinding {
  sourceInputsSha256: string;
  packageManager: string;
  nodeVersion: string;
  platform: string;
  architecture: string;
  host: string;
}
export interface HermeticPnpmCacheSnapshot {
  directory: string;
  generation: { dev: string; ino: string; birthtimeNs: string };
  sha256: string;
  binding: HermeticPnpmCacheBinding;
}
export function pnpmStoreDirectory(root: string): string {
  return path.join(root, "agents-temp", "cache", "pnpm");
}
function generation(directory: string): HermeticPnpmCacheSnapshot["generation"] {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.ino <= 0n || stat.birthtimeNs <= 0n || realpathSync(directory) !== path.resolve(directory)) {
    throw new Error("PNPM cache is not an ordinary physical directory");
  }
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}
function equal(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function inventory(directory: string): string {
  const hash = createHash("sha256"), buffer = Buffer.alloc(1024 * 1024);
  function visit(current: string): void {
    const entries = [];
    const handle = opendirSync(current);
    try {
      for (let entry = handle.readSync(); entry; entry = handle.readSync()) entries.push(entry.name);
    } finally { handle.closeSync(); }
    entries.sort((left, right) => left.localeCompare(right) || (left < right ? -1 : left > right ? 1 : 0));
    for (const name of entries) {
      const file = path.join(current, name), stat = lstatSync(file, { bigint: true });
      if (stat.size < 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("PNPM cache entry size is not lossless");
      hash.update(JSON.stringify([path.relative(directory, file), Number(stat.mode & 0o7777n),
        stat.isDirectory() ? "directory" : "file", stat.isFile() ? Number(stat.size) : 0]) + "\0");
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error("PNPM cache contains a link or special entry");
      }
      if (stat.isDirectory()) { visit(file); }
      else {
        const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          let observed = 0n;
          for (;;) {
            const remaining = stat.size - observed;
            const length = Number(remaining < BigInt(buffer.length) ? remaining + 1n : BigInt(buffer.length));
            const bytes = readSync(fd, buffer, 0, length, null);
            if (!bytes) break;
            observed += BigInt(bytes);
            if (observed > stat.size) throw new Error("PNPM cache file grew beyond its framed size");
            hash.update(buffer.subarray(0, bytes));
          }
          const after = fstatSync(fd, { bigint: true });
          if (observed !== stat.size || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size) {
            throw new Error("PNPM cache file changed while it was inventoried");
          }
        } finally { closeSync(fd); }
        hash.update("\0");
      }
    }
  }
  visit(directory);
  return hash.digest("hex");
}
function requireBinding(binding: HermeticPnpmCacheBinding): void {
  if (!/^[a-f0-9]{64}$/u.test(binding.sourceInputsSha256)
    || !/^pnpm@\d+\.\d+\.\d+$/u.test(binding.packageManager)
    || binding.nodeVersion !== process.version || binding.platform !== process.platform
    || binding.architecture !== process.arch || binding.host !== hostname()) {
    throw new Error("PNPM cache source/runtime/host binding is unavailable or mismatched");
  }
}
export function capturePnpmCacheBytes(root: string, binding: HermeticPnpmCacheBinding): HermeticPnpmCacheSnapshot {
  requireBinding(binding);
  const directory = pnpmStoreDirectory(root), before = generation(directory);
  const sha256 = inventory(directory);
  if (!equal(before, generation(directory))) throw new Error("PNPM cache source generation changed");
  return { directory, generation: before, sha256, binding: { ...binding } };
}
export function restorePnpmCacheBytes(root: string, source: HermeticPnpmCacheSnapshot, expected: HermeticPnpmCacheBinding): void {
  requireBinding(expected);
  if (!equal(source.binding, expected)) throw new Error("PNPM cache source inputs or runtime differ");
  const target = pnpmStoreDirectory(root), before = generation(target);
  const relative = path.relative(source.directory, target);
  const reverse = path.relative(target, source.directory);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))
    || (!reverse.startsWith("..") && !path.isAbsolute(reverse))) {
    throw new Error("PNPM cache source and target overlap");
  }
  if (!equal(source.generation, generation(source.directory)) || inventory(source.directory) !== source.sha256) {
    throw new Error("PNPM cache source bytes or generation changed");
  }
  const handle = opendirSync(target);
  try { if (handle.readSync() !== null) throw new Error("PNPM cache target was not observed empty"); }
  finally { handle.closeSync(); }
  cpSync(source.directory, target, { recursive: true, dereference: false, force: false, errorOnExist: true });
  if (!equal(before, generation(target)) || inventory(target) !== source.sha256
    || !equal(source.generation, generation(source.directory)) || inventory(source.directory) !== source.sha256) {
    throw new Error("PNPM cache transfer seal changed; target is retained and source owner must preserve its input");
  }
}
