/**
 * Hermetic test environment (code#6081 / DOCTRINE §65).
 *
 * Strips inherited git routing and host-harness identity markers, redirects HOME/XDG/TEMP/GIT_CONFIG_* into a disposable
 * temp root, and ceilings discovery so cwd-based git cannot climb into a real checkout.
 * Pure helpers — call \`applyHermeticTestEnvironment()\` from the preload or tests.
 */
import { mkdirSync, mkdtempSync, opendirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname, tmpdir, uptime } from "node:os";
import path from "node:path";
import { isMainThread } from "node:worker_threads";

/** Exact routing / custody / config keys that must never leak a real repository into a test. */
export const HERMETIC_STRIP_EXACT = Object.freeze([
  "FLEET_CENTRAL_DB_PATH",
  "FLEET_STATE_ROOT",
  "CLI_WRAPPERS_STATE_ROOT",
  "CLI_WRAPPERS_STATE_DIR",
  "FLEET_SEAT_WORKTREE",
  "FLEET_SEAT_JOB_ID",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_CEILING_DIRECTORIES",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_PREFIX",
  "GIT_ATTR_NOSYSTEM",
] as const);

/**
 * Host-harness identity markers (repo-template#514). Fleet protocol detection (fleet-hook, process-termination,
 * session-metadata) answers from these, so an agent session running the suite would otherwise leak its own
 * identity into spawned hook CLIs. Tests that need a marker set it explicitly in the child env.
 */
const HERMETIC_HARNESS_STRIP_EXACT = Object.freeze([
  "CLAUDECODE",
  "CLAUDE_HOOK_EVENT",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "COPILOT_HOOK_EVENT",
  "COPILOT_AGENT_SESSION_ID",
  "COPILOT_PROJECT_DIR",
  "COPILOT_RUN_ID",
  "COPILOT_MODEL",
  "COPILOT_ALLOW_ALL",
  "GROK_HOOK_EVENT",
  "ANTIGRAVITY_AGENT",
  "CURSOR_AGENT",
  "CURSOR_CONVERSATION_ID",
  "CODEX_THREAD_ID",
  "CODEX_SESSION_ID",
] as const);

const HARNESS_PREFIXES = ["CURSOR_HOOK"] as const;

/** Temp-dir variables redirected into the disposable root so tests never share os.tmpdir() state. */
const TEMP_KEYS = ["TEMP", "TMP", "TMPDIR"] as const;

/** Legacy state discovery must see private homes even when no explicit state override is set. */
const PRIVATE_STATE_HOME_PATHS = {
  APPDATA: ["home", "AppData", "Roaming"],
  LOCALAPPDATA: ["home", "AppData", "Local"],
  XDG_STATE_HOME: ["xdg-state"],
  XDG_DATA_HOME: ["xdg-data"],
  XDG_CACHE_HOME: ["xdg-cache"],
} as const;
const REDIRECTED_HOME_KEYS = new Set(["HOME", "USERPROFILE", "XDG_CONFIG_HOME", ...Object.keys(PRIVATE_STATE_HOME_PATHS)]);

/** Explicit private test namespaces, not operational fleet defaults. No inherited host path survives. */
const PRIVATE_AGENT_STORAGE_PATHS = {
  FLEET_AGENTS_ROOT: ["agents"],
  FLEET_AGENTS_TEMP: ["agents-temp"],
  AO_WORKTREES_ROOT: ["agents-temp", "worktrees"],
  ORCH_WORKTREE_ROOT: ["agents-temp", "worktrees"],
  npm_config_store_dir: ["agents-temp", "cache", "pnpm"],
  pnpm_config_store_dir: ["agents-temp", "cache", "pnpm"],
  npm_config_cache: ["agents-temp", "cache", "npm"],
  npm_config_cache_dir: ["agents-temp", "cache", "pnpm-runtime"],
  pnpm_config_cache_dir: ["agents-temp", "cache", "pnpm-runtime"],
} as const;
const PRIVATE_AGENT_STORAGE_KEYS = new Set(Object.keys(PRIVATE_AGENT_STORAGE_PATHS).map((key) => key.toUpperCase()));

const GIT_CONFIG_KEY_VALUE = /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/i;

export interface HermeticTestEnvironmentOptions {
  /** Existing env to scrub (defaults to a shallow copy of process.env). */
  env?: NodeJS.ProcessEnv;
  /** Parent directory for the disposable root (defaults to os.tmpdir()). */
  tempParent?: string;
  /** Prefix for mkdtempSync. */
  prefix?: string;
  /**
   * Absolute paths that git must not climb past during discovery.
   * Defaults to the disposable root itself.
   */
  ceilingDirectories?: readonly string[];
  /** When true, also clear USERPROFILE (win32 identity sink). Default true. */
  redirectUserProfile?: boolean;
}

export interface HermeticTestEnvironment {
  /** Absolute disposable root owning HOME / XDG / GIT_CONFIG_* files. */
  root: string;
  /** Scrubbed environment ready for spawn or process.env assignment. */
  env: NodeJS.ProcessEnv;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True when the key is inherited seat custody, git routing, or injectible config that tests must not inherit. */
export function isHermeticStripKey(key: string): boolean {
  const upper = key.toUpperCase();
  if ((HERMETIC_STRIP_EXACT as readonly string[]).includes(upper)) return true;
  if (PRIVATE_AGENT_STORAGE_KEYS.has(upper)) return true;
  if (GIT_CONFIG_KEY_VALUE.test(upper)) return true;
  if ((HERMETIC_HARNESS_STRIP_EXACT as readonly string[]).includes(upper)) return true;
  if (HARNESS_PREFIXES.some((prefix) => upper.startsWith(prefix))) return true;
  return false;
}

/** Copy `source`, dropping undefined values, stripped keys, and the identity/temp keys this module redirects. */
function copyInheritedEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const redirected = new Set<string>([...REDIRECTED_HOME_KEYS, ...TEMP_KEYS]);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || isHermeticStripKey(key) || redirected.has(key.toUpperCase())) continue;
    env[key] = value;
  }
  return env;
}

/**
 * Build a scrubbed env pointing HOME / XDG / GIT_CONFIG_* at a fresh temp root.
 * Does not mutate the input env object; returns a new one.
 */
export function buildHermeticTestEnvironment(
  options: HermeticTestEnvironmentOptions = {},
): HermeticTestEnvironment {
  const source = options.env ?? process.env;
  const parent = options.tempParent ?? tmpdir();
  const prefix = options.prefix ?? "fleet-hermetic-test-";
  mkdirSync(parent, { recursive: true });
  const root = disposeHermeticRootOnExit(mkdtempSync(path.join(parent, prefix)));
  const home = path.join(root, "home");
  const xdgConfig = path.join(root, "xdg-config");
  const gitConfigGlobal = path.join(root, "gitconfig.global");
  const gitConfigSystem = path.join(root, "gitconfig.system");
  const tempDir = path.join(root, "tmp");
  for (const dir of [home, xdgConfig, tempDir]) mkdirSync(dir, { recursive: true });
  writeFileSync(gitConfigGlobal, "# fleet hermetic test global\n", "utf8");
  writeFileSync(gitConfigSystem, "# fleet hermetic test system\n", "utf8");

  const env = copyInheritedEnvironment(source);
  env["FLEET_CENTRAL_DB_PATH"] = path.join(root, "fleet-central.sqlite");
  for (const [key, relative] of Object.entries({ ...PRIVATE_AGENT_STORAGE_PATHS, ...PRIVATE_STATE_HOME_PATHS })) {
    const directory = path.join(root, ...relative);
    mkdirSync(directory, { recursive: true });
    env[key] = directory;
  }

  const ceilings = (options.ceilingDirectories ?? [root])
    .map((entry) => path.resolve(entry))
    .filter((entry, index, all) => all.indexOf(entry) === index);

  env["HOME"] = home;
  env["XDG_CONFIG_HOME"] = xdgConfig;
  for (const key of TEMP_KEYS) env[key] = tempDir;
  if (options.redirectUserProfile !== false) {
    env["USERPROFILE"] = home;
  }
  env["GIT_CONFIG_GLOBAL"] = gitConfigGlobal;
  env["GIT_CONFIG_SYSTEM"] = gitConfigSystem;
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  env["GIT_ATTR_NOSYSTEM"] = "1";
  env["GIT_CEILING_DIRECTORIES"] = ceilings.join(path.delimiter);
  // Identity for any incidental commits inside fixtures — never a real operator identity.
  env["GIT_AUTHOR_NAME"] = "Fleet Hermetic Test";
  env["GIT_AUTHOR_EMAIL"] = "hermetic-test@invalid.example";
  env["GIT_COMMITTER_NAME"] = env["GIT_AUTHOR_NAME"];
  env["GIT_COMMITTER_EMAIL"] = env["GIT_AUTHOR_EMAIL"];
  // Disable signing for disposable fixtures (cli-wrappers test harness class).
  env["GIT_CONFIG_COUNT"] = "2";
  env["GIT_CONFIG_KEY_0"] = "commit.gpgsign";
  env["GIT_CONFIG_VALUE_0"] = "false";
  env["GIT_CONFIG_KEY_1"] = "tag.gpgsign";
  env["GIT_CONFIG_VALUE_1"] = "false";

  return { root, env };
}

/**
 * Apply a hermetic environment onto \`target\` (default: process.env) in place.
 * Returns the disposable root path.
 */
export function applyHermeticTestEnvironment(
  options: HermeticTestEnvironmentOptions = {},
  target: NodeJS.ProcessEnv = process.env,
): string {
  const built = buildHermeticTestEnvironment({
    ...options,
    env: options.env ?? { ...target },
  });
  for (const key of Object.keys(target)) {
    const upper = key.toUpperCase();
    if (isHermeticStripKey(key) || REDIRECTED_HOME_KEYS.has(upper)
      || (TEMP_KEYS as readonly string[]).includes(upper)) delete target[key];
  }
  Object.assign(target, built.env);
  return built.root;
}

/** Owner marker inside every disposable root, so a later sweep can prove its owner is gone. */
export const HERMETIC_OWNER_MARKER = ".fleet-hermetic-owner";
/** No test process lives this long; a younger root may belong to a process in another pid namespace. */
export const HERMETIC_SWEEP_MIN_AGE_MS = 6 * 60 * 60_000;
const SWEEP_INTERVAL_MS = 10 * 60_000;
/** Directory entries one sweep examines; the next sweep resumes after them, so a crowded temp dir costs one bounded slice. */
export const HERMETIC_SWEEP_ENTRY_BUDGET = 500;

export interface HermeticOwner { pid: number; host: string; boot: string; createdAt: number }

const ownedRoots = new Set<string>();

/** This boot's identity: the kernel boot id where there is one, otherwise the boot minute. */
function bootIdentity(): string {
  try {
    return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  } catch {
    return `boot-minute-${String(Math.round((Date.now() / 1000 - uptime()) / 60))}`;
  }
}

/**
 * Remove a root's contents, then its owner marker, then the root. An interrupted removal leaves the marker in place,
 * so the dead-owner sweep can still prove ownership and finish it. Throws when any step fails.
 */
function removeHermeticRoot(root: string): void {
  for (const name of readdirSync(root)) {
    if (name !== HERMETIC_OWNER_MARKER) rmSync(path.join(root, name), { recursive: true, force: true });
  }
  rmSync(path.join(root, HERMETIC_OWNER_MARKER), { force: true });
  rmdirSync(root);
}

function removeOwnedRoots(): void {
  for (const root of ownedRoots) {
    try {
      removeHermeticRoot(root);
    } catch {
      // A held handle (win32) leaves it, still marked, for the dead-owner sweep.
    }
  }
  ownedRoots.clear();
}

/**
 * Mark `root` as owned by this process (code#13858); returns `root`. Main-thread roots are removed on process exit.
 * Worker roots remain for the whole process's lifetime and are left marked for the later dead-owner sweep.
 * Nothing may use a root after its creating process exits. A killed process also leaves its marked roots for the sweep.
 */
export function disposeHermeticRootOnExit(root: string): string {
  const owner: HermeticOwner = { pid: process.pid, host: hostname(), boot: bootIdentity(), createdAt: Date.now() };
  writeFileSync(path.join(root, HERMETIC_OWNER_MARKER), JSON.stringify(owner), "utf8");
  // A Worker's process "exit" event ends that thread, not the process named by the marker.
  // Keep its roots for that process's lifetime; the existing marked-root sweep can consider them afterward.
  if (!isMainThread) return root;
  if (ownedRoots.size === 0) process.once("exit", removeOwnedRoots);
  ownedRoots.add(root);
  return root;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/** True when `value` is a complete owner marker. */
export function isHermeticOwner(value: unknown): value is HermeticOwner {
  return isRecord(value) && typeof value["pid"] === "number" && Number.isSafeInteger(value["pid"]) && value["pid"] > 0
    && typeof value["host"] === "string" && typeof value["boot"] === "string" && typeof value["createdAt"] === "number";
}

function readOwner(root: string): HermeticOwner | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(root, HERMETIC_OWNER_MARKER), "utf8"));
    return isHermeticOwner(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Made on this host in this boot, older than any test process, and its pid is dead. */
function ownerGone(owner: HermeticOwner, here: { host: string; boot: string; now: number }): boolean {
  if (owner.host !== here.host || owner.boot !== here.boot) return false;
  if (here.now - owner.createdAt < HERMETIC_SWEEP_MIN_AGE_MS) return false;
  return owner.pid !== process.pid && !pidAlive(owner.pid);
}

/** The cursor to resume from, or null while the last sweep is younger than the interval (a future stamp is expired). */
function sweepCursor(stamp: string, now: number): number | null {
  try {
    const age = now - statSync(stamp).mtimeMs;
    if (age >= 0 && age < SWEEP_INTERVAL_MS) return null;
    const cursor = Number(readFileSync(stamp, "utf8").trim());
    return Number.isSafeInteger(cursor) && cursor > 0 ? cursor : 0;
  } catch {
    return 0;
  }
}

/**
 * Visit at most `budget` `prefix*` directories after the first `skip`, in directory order. Returns how many matching
 * entries it passed and whether it reached the end.
 */
function visitSlice(parent: string, prefix: string, skip: number, budget: number, visit: (root: string) => void): { passed: number; finished: boolean } {
  const dir = opendirSync(parent);
  let passed = 0;
  try {
    for (let entry = dir.readSync(); entry !== null; entry = dir.readSync()) {
      if (!entry.name.startsWith(prefix) || !entry.isDirectory()) continue;
      if (passed >= skip + budget) return { passed, finished: false };
      passed += 1;
      if (passed > skip) visit(path.join(parent, entry.name));
    }
    return { passed, finished: true };
  } finally {
    dir.closeSync();
  }
}

/**
 * Remove `parent/<prefix>*` roots whose owner is provably gone: the marker was written on this host in this boot,
 * more than six hours ago, and names a dead pid. Unmarked directories and links are never touched (the
 * workspace-lifecycle temp janitor owns that backlog). At most one sweep per parent and prefix every ten minutes, and
 * each examines at most `budget` entries, resuming after them next time. Returns the number removed.
 */
export function sweepDeadHermeticRoots(parent: string, prefix: string, now = Date.now(), budget = HERMETIC_SWEEP_ENTRY_BUDGET): number {
  const stamp = path.join(parent, `${prefix.endsWith("-") ? prefix.slice(0, -1) : prefix}.sweep-stamp`);
  const cursor = sweepCursor(stamp, now);
  if (cursor === null) return 0;
  const here = { host: hostname(), boot: bootIdentity(), now };
  let removed = 0;
  try {
    writeFileSync(stamp, String(cursor), "utf8");
    const slice = visitSlice(parent, prefix, cursor, budget, (root) => {
      const owner = readOwner(root);
      if (!owner || !ownerGone(owner, here)) return;
      try {
        removeHermeticRoot(root);
        removed += 1;
      } catch {
        // Held or racing: a later sweep retries.
      }
    });
    writeFileSync(stamp, String(slice.finished ? 0 : slice.passed - removed), "utf8");
  } catch {
    // An unreadable temp directory never blocks a test run.
  }
  return removed;
}

/** Serialize a built environment for subprocess receipts / diagnostics. */
export function hermeticEnvironmentSummary(built: HermeticTestEnvironment): Record<string, unknown> {
  if (!isRecord(built)) return { ok: false };
  return {
    schema: "HermeticTestEnvironmentSummaryV1",
    root: built.root,
    home: built.env["HOME"],
    xdgConfigHome: built.env["XDG_CONFIG_HOME"],
    gitConfigGlobal: built.env["GIT_CONFIG_GLOBAL"],
    gitConfigNosystem: built.env["GIT_CONFIG_NOSYSTEM"],
    gitCeilingDirectories: built.env["GIT_CEILING_DIRECTORIES"],
    tempDir: built.env["TMPDIR"],
    strippedExact: [...HERMETIC_STRIP_EXACT, ...HERMETIC_HARNESS_STRIP_EXACT],
  };
}
