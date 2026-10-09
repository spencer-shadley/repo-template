/**
 * At-use-time resolver for the CURRENT published Governed Intake release (repo-template#468).
 *
 * Fleet rule: no pins, consume latest, record resolved SHAs as evidence. The producer
 * (spencer-shadley/.github) publishes `contracts/generated/governed-intake/manifest.json` on its
 * default branch. Consumers resolve that branch head when they act, verify the manifest and the
 * contract/policy payload bytes the way the producer's own `verify.ts` does (schema, family,
 * repository, full commit SHA, payload digest recomputed from file metadata, byte digests), and
 * fail closed only on unreadable or forged input. Nothing here names a revision number.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const PRODUCER_REPOSITORY = "spencer-shadley/.github";
export const PRODUCER_BRANCH = "main";
export const RELEASE_DIR = "contracts/generated/governed-intake";
export const TRIAGE_STAMP_NAMESPACE = "metadata:triage-v";

export interface ReleaseSource {
  /** Full 40-hex commit SHA of the producer default branch head. */
  resolveHead(): Promise<string>;
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

/** Same digest rule as the producer: sorted `path:sha256:byteLength` lines. */
export function computePayloadDigest(files: Record<string, FileEntry>): string {
  const lines = Object.keys(files)
    .toSorted((left, right) => left.localeCompare(right))
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

function verifyManifest(raw: unknown): { revision: number; producerCommit: string; payloadDigest: string; files: Record<string, FileEntry> } {
  if (!isRecord(raw)) return fail("manifest must be an object");
  if (raw["schema"] !== "GovernedIntakeReleaseManifestV1" || raw["schemaFamily"] !== "GovernedIntakeBodyV1") {
    return fail("unsupported manifest schema or family");
  }
  const revision = raw["revision"];
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) return fail("revision must be a positive integer");
  const producer = raw["producer"];
  if (!isRecord(producer) || producer["repository"] !== PRODUCER_REPOSITORY) return fail(`producer.repository must be ${PRODUCER_REPOSITORY}`);
  if (!isCommit(producer["commit"])) return fail("producer.commit must be a nonzero full lowercase commit SHA");
  const payloadDigest = raw["payloadDigest"];
  if (!isDigest(payloadDigest)) return fail("invalid payload digest");
  const files = parseFiles(raw["files"]);
  if (computePayloadDigest(files) !== payloadDigest) return fail("manifest payloadDigest does not match file metadata");
  return { revision, producerCommit: producer["commit"], payloadDigest, files };
}

async function verifyPayload(source: ReleaseSource, head: string, files: Record<string, FileEntry>, name: string): Promise<unknown> {
  const entry = files[name];
  if (!entry) return fail(`manifest missing required payload entry: ${name}`);
  const bytes = await source.readFile(head, `${RELEASE_DIR}/${name}`);
  if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) return fail(`payload digest or byteLength mismatch: ${name}`);
  return parseJson(bytes, name);
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
  const head = await unreadableAsRefusal(() => source.resolveHead());
  if (!isCommit(head)) return fail("producer head is not a full commit SHA");
  const manifestBytes = await unreadableAsRefusal(() => source.readFile(head, `${RELEASE_DIR}/manifest.json`));
  const manifest = verifyManifest(parseJson(manifestBytes, "manifest.json"));
  const [contract, policy] = await unreadableAsRefusal(() => Promise.all([
    verifyPayload(source, head, manifest.files, "governed-intake-body.v1.json"),
    verifyPayload(source, head, manifest.files, "governed-intake-triage-policy.v1.json"),
  ]));
  if (!isRecord(contract) || contract["schema"] !== "GovernedIntakeBodyV1" || contract["version"] !== manifest.revision || contract["owner"] !== PRODUCER_REPOSITORY) {
    return fail("contract schema, revision or owner differs from release identity");
  }
  if (!isRecord(policy) || policy["schema"] !== "GovernedTriagePolicyV1" || policy["owner"] !== PRODUCER_REPOSITORY) {
    return fail("policy schema or owner differs from producer identity");
  }
  return {
    repository: PRODUCER_REPOSITORY,
    branch: PRODUCER_BRANCH,
    headCommit: head,
    producerCommit: manifest.producerCommit,
    revision: manifest.revision,
    payloadDigest: `sha256:${manifest.payloadDigest}`,
    triageLabel: `${TRIAGE_STAMP_NAMESPACE}${String(manifest.revision)}`,
  };
}

/** Anonymous read of the public producer: `git ls-remote` for the head, raw content at that exact SHA. */
export function liveReleaseSource(): ReleaseSource {
  return {
    resolveHead(): Promise<string> {
      const result = spawnSync("git", ["ls-remote", `https://github.com/${PRODUCER_REPOSITORY}`, `refs/heads/${PRODUCER_BRANCH}`], { encoding: "utf8", windowsHide: true });
      if (result.status !== 0) return Promise.reject(new Error(`git ls-remote failed: ${result.stderr.trim()}`));
      return Promise.resolve(result.stdout.split(/\s/, 1)[0] ?? "");
    },
    async readFile(commit: string, path: string): Promise<Buffer> {
      const response = await fetch(`https://raw.githubusercontent.com/${PRODUCER_REPOSITORY}/${commit}/${path}`);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)} reading ${path}@${commit}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
