/**
 * Hermetic test environment (code#6081 / DOCTRINE §65).
 *
 * Strips inherited git routing and host-harness identity markers, redirects HOME/XDG/TEMP/GIT_CONFIG_* into a disposable
 * temp root, and ceilings discovery so cwd-based git cannot climb into a real checkout.
 * Pure helpers — call \`applyHermeticTestEnvironment()\` from the preload or tests.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Exact routing / custody / config keys that must never leak a real repository into a test. */
export const HERMETIC_STRIP_EXACT = Object.freeze([
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
export const HERMETIC_HARNESS_STRIP_EXACT = Object.freeze([
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
  if (GIT_CONFIG_KEY_VALUE.test(upper)) return true;
  if ((HERMETIC_HARNESS_STRIP_EXACT as readonly string[]).includes(upper)) return true;
  if (HARNESS_PREFIXES.some((prefix) => upper.startsWith(prefix))) return true;
  return false;
}

/** Copy `source`, dropping undefined values, stripped keys, and the identity/temp keys this module redirects. */
function copyInheritedEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const redirected = new Set<string>(["HOME", "USERPROFILE", "XDG_CONFIG_HOME", ...TEMP_KEYS]);
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
  const root = mkdtempSync(path.join(parent, prefix));
  const home = path.join(root, "home");
  const xdgConfig = path.join(root, "xdg-config");
  const gitConfigGlobal = path.join(root, "gitconfig.global");
  const gitConfigSystem = path.join(root, "gitconfig.system");
  const tempDir = path.join(root, "tmp");
  for (const dir of [home, xdgConfig, tempDir]) mkdirSync(dir, { recursive: true });
  writeFileSync(gitConfigGlobal, "# fleet hermetic test global\n", "utf8");
  writeFileSync(gitConfigSystem, "# fleet hermetic test system\n", "utf8");

  const env = copyInheritedEnvironment(source);

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
    if (isHermeticStripKey(key)) delete target[key];
  }
  delete target["HOME"];
  delete target["USERPROFILE"];
  delete target["XDG_CONFIG_HOME"];
  for (const key of Object.keys(target)) {
    if ((TEMP_KEYS as readonly string[]).includes(key.toUpperCase())) delete target[key];
  }
  Object.assign(target, built.env);
  return built.root;
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
