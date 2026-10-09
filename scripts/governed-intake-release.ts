/**
 * Resolve the current published producer once and verify all release bytes with that release's
 * own portable verifier. The verifier is trusted code from the same immutable producer commit,
 * not a consumer-owned copy of its admission rules. No revision or verifier SHA is pinned here.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const PRODUCER_REPOSITORY = "spencer-shadley/.github";
export const RELEASE_DIR = "contracts/generated/governed-intake";
export const TRIAGE_STAMP_NAMESPACE = "metadata:triage-v";

export interface ProducerHead {
  branch: string;
  commit: string;
}

export interface ReleaseSource {
  /** The producer symbolic default branch and full commit SHA from the same observation. */
  resolveHead(): Promise<ProducerHead>;
  /** Bytes of `path` at exactly `commit`. */
  readFile(commit: string, path: string): Promise<Buffer>;
}

export interface ResolvedRelease {
  repository: string;
  branch: string;
  /** Default-branch head the manifest was read from. */
  headCommit: string;
  /** Commit the producer recorded as having generated the payload. */
  producerCommit: string;
  revision: number;
  payloadDigest: string;
  triageLabel: string;
}

export class ReleaseResolutionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReleaseResolutionError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCommit = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{40}$/.test(value) && !/^0+$/.test(value);
const isDigest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

interface FileEntry { path: string; sha256: string; byteLength: number }

function fail(message: string): never {
  throw new ReleaseResolutionError(`governed-intake release refused: ${message}`);
}

function parseJson(bytes: Buffer, what: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new ReleaseResolutionError(`governed-intake release refused: ${what} is not valid JSON`, { cause: error });
  }
}

/** Preserve the producer's locale-independent UTF-16 code-unit ordering. */
function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Same digest rule as the producer: sorted `path:sha256:byteLength` lines. */
export function computePayloadDigest(files: Record<string, FileEntry>): string {
  const lines = Object.keys(files)
    // UTF-16 code-unit order like the producer's `.sort()` (names are ASCII, so byte order is identical; locale-independent).
    .toSorted(compareCodeUnits)
    .map((key) => {
      const entry = files[key];
      return `${entry?.path ?? ""}:${entry?.sha256 ?? ""}:${String(entry?.byteLength)}`;
    });
  return sha256(lines.join("\n"));
}

function isFileEntry(name: string, entry: unknown): entry is FileEntry {
  return /^[a-z0-9][a-z0-9._-]*$/.test(name) && isRecord(entry) && entry["path"] === name && isDigest(entry["sha256"])
    && typeof entry["byteLength"] === "number" && Number.isSafeInteger(entry["byteLength"]) && entry["byteLength"] >= 0;
}

function parseFiles(raw: unknown): Record<string, FileEntry> {
  if (!isRecord(raw)) return fail("invalid file map");
  const files: Record<string, FileEntry> = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!isFileEntry(name, entry)) return fail(`invalid payload path or metadata: ${name}`);
    files[name] = entry;
  }
  return files;
}

async function materializePayload(source: ReleaseSource, head: string, files: Record<string, FileEntry>, dir: string): Promise<Buffer> {
  let verifierBytes: Buffer | undefined;
  // Read every declared payload at the one resolved immutable commit, including both aliases.
  // Sequential reads bound fetch fan-out and guarantee cleanup after the last outstanding write.
  for (const [name, entry] of Object.entries(files)) {
    if (name === "manifest.json") return fail("payload collides with manifest.json");
    const bytes = await source.readFile(head, `${RELEASE_DIR}/${name}`);
    if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) {
      return fail(`payload digest or byteLength mismatch: ${name}`);
    }
    writeFileSync(path.join(dir, name), bytes, { flag: "wx" });
    if (name === "verify.js") verifierBytes = bytes;
  }
  if (!verifierBytes) return fail("published verifier bytes are missing");
  return verifierBytes;
}

/**
 * This is a transport boundary, not an alternate release rubric: filenames are constrained before
 * materializing producer bytes, then the producer owns required entries, aliases and schema checks.
 * Only integrity-checked verifier bytes from the resolved release are executed. The child inherits
 * no credentials and has read permission only for this directory, with no subprocess/worker/addon
 * permissions. Node permissions are defense in depth for trusted producer code, not a network sandbox.
 */
async function verifyWithPublishedProducer(source: ReleaseSource, head: string, manifestBytes: Buffer): Promise<Record<string, unknown>> {
  const manifest = parseJson(manifestBytes, "manifest.json");
  if (!isRecord(manifest)) return fail("manifest must be an object");
  const files = parseFiles(manifest["files"]);
  const verifier = files["verify.js"];
  if (!verifier) return fail("published verifier payload is missing");
  const dir = mkdtempSync(path.join(os.tmpdir(), "governed-intake-release-"));
  try {
    writeFileSync(path.join(dir, "manifest.json"), manifestBytes, { flag: "wx" });
    const verifierBytes = await materializePayload(source, head, files, dir);
    // Leading underscores cannot collide with a producer payload filename.
    writeFileSync(path.join(dir, "__producer-verify.mjs"), verifierBytes, { flag: "wx" });
    writeFileSync(path.join(dir, "__consumer-verify.mjs"), [
      'import { verifyGovernedIntakeRelease } from "./__producer-verify.mjs";',
      'const result = verifyGovernedIntakeRelease(process.cwd());',
      'process.stdout.write(JSON.stringify(result));',
    ].join("\n"), { flag: "wx" });
    const result = spawnSync(process.execPath, [
      "--permission", `--allow-fs-read=${dir}`, path.join(dir, "__consumer-verify.mjs"),
    ], { cwd: dir, env: {}, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) {
      return fail(`published verifier did not complete: ${result.error?.message ?? result.stderr.trim()}`);
    }
    const checked = parseJson(Buffer.from(result.stdout), "producer verification result");
    if (!isRecord(checked) || checked["ok"] !== true || !isRecord(checked["manifest"])) {
      return fail(`published verifier rejected release: ${isRecord(checked) ? String(checked["code"]) + ": " + String(checked["error"]) : "invalid result"}`);
    }
    // The portable verifier returns the parsed input manifest. Do not trust substitute identity.
    if (JSON.stringify(checked["manifest"]) !== JSON.stringify(manifest)) return fail("producer result changed manifest identity");
    return checked["manifest"];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Resolve and verify the producer's current published release. Throws ReleaseResolutionError on any doubt. */
async function unreadableAsRefusal<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ReleaseResolutionError) throw error;
    throw new ReleaseResolutionError(`governed-intake release unreadable: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export async function resolveCurrentRelease(source: ReleaseSource = liveReleaseSource()): Promise<ResolvedRelease> {
  const selected = await unreadableAsRefusal(() => source.resolveHead());
  const head = selected.commit;
  if (!selected.branch || /\s/.test(selected.branch)) return fail("producer default branch is invalid");
  if (!isCommit(head)) return fail("producer head is not a full commit SHA");
  const manifestBytes = await unreadableAsRefusal(() => source.readFile(head, `${RELEASE_DIR}/manifest.json`));
  const manifest = await unreadableAsRefusal(() => verifyWithPublishedProducer(source, head, manifestBytes));
  // Validate the portable result shape before constructing this consumer's receipt; the producer
  // has already admitted schema/revision/owner/payload semantics over all actual bytes.
  const revision = manifest["revision"];
  const producer = manifest["producer"];
  const payloadDigest = manifest["payloadDigest"];
  if (typeof revision !== "number" || !isRecord(producer) || typeof producer["commit"] !== "string" || typeof payloadDigest !== "string") {
    return fail("unsupported producer verification result");
  }
  const resolved: ResolvedRelease = {
    repository: PRODUCER_REPOSITORY,
    branch: selected.branch,
    headCommit: head,
    producerCommit: producer["commit"],
    revision,
    payloadDigest: `sha256:${payloadDigest}`,
    triageLabel: `${TRIAGE_STAMP_NAMESPACE}${String(revision)}`,
  };
  verifiedReleases.add(resolved);
  return resolved;
}

const verifiedReleases = new WeakSet<object>();

/** True only for objects returned by resolveCurrentRelease (not hand-built look-alikes). */
export function isVerifiedRelease(value: unknown): value is ResolvedRelease {
  return typeof value === "object" && value !== null && verifiedReleases.has(value);
}

/** Parse one symbolic HEAD observation; named branches never substitute for the default. */
export function parseProducerHead(output: string): ProducerHead {
  const rows = output.trim().split(/\r?\n/).map((line) => line.split("\t"));
  const refs = rows.filter(([value, ref]) => ref === "HEAD" && value?.startsWith("ref: "));
  const heads = rows.filter(([value, ref]) => ref === "HEAD" && isCommit(value));
  const target = refs[0]?.[0];
  const commit = heads[0]?.[0];
  if (refs.length !== 1 || heads.length !== 1 || !target?.startsWith("ref: refs/heads/") || !commit) {
    return fail("producer symbolic HEAD is missing or ambiguous");
  }
  const branch = target.slice("ref: refs/heads/".length);
  if (!branch || /\s/.test(branch)) return fail("producer symbolic HEAD branch is invalid");
  return { branch, commit };
}

/** Anonymous read of the public producer: `git ls-remote` for the head, raw content at that exact SHA. */
export function liveReleaseSource(): ReleaseSource {
  return {
    resolveHead(): Promise<ProducerHead> {
      const result = spawnSync("git", ["ls-remote", "--symref", "https://github.com/" + PRODUCER_REPOSITORY, "HEAD"], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
      if (result.status !== 0) return Promise.reject(new Error(`git ls-remote failed: ${result.stderr.trim()}`));
      return Promise.resolve(parseProducerHead(result.stdout));
    },
    async readFile(commit: string, path: string): Promise<Buffer> {
      const response = await fetch(`https://raw.githubusercontent.com/${PRODUCER_REPOSITORY}/${commit}/${path}`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${String(response.status)} reading ${path}@${commit}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
