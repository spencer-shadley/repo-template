/**
 * Hermetic test environment (code#6081 / DOCTRINE §65).
 *
 * Strips inherited git routing and host-harness identity markers, redirects HOME/XDG/TEMP/GIT_CONFIG_* into a disposable
 * temp root, and ceilings discovery so cwd-based git cannot climb into a real checkout.
 * Pure helpers — call \`applyHermeticTestEnvironment()\` from the preload or tests.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHermeticRoot, retainHermeticRoot } from "./lifetime.ts";
export { HERMETIC_OWNER_MARKER, HERMETIC_SWEEP_MIN_AGE_MS, isHermeticOwner, removeOwnedHermeticRoot, retainHermeticRoot, runWithHermeticRootCommand, runWithHermeticRootCommandAsync, sweepDeadHermeticRoots, captureHermeticPnpmStore, restoreHermeticPnpmStore } from "./lifetime.ts";
export type { HermeticPnpmCacheBinding, HermeticPnpmCacheSnapshot } from "./pnpm-cache.ts";

/** Exact routing / custody / config keys that must never leak a real repository into a test. */
export const HERMETIC_STRIP_EXACT = Object.freeze([
  "FLEET_CENTRAL_DB_PATH",
  "FLEET_STATE_ROOT",
  "CLI_WRAPPERS_STATE_ROOT",
  "CLI_WRAPPERS_STATE_DIR",
  "FLEET_SEAT_WORKTREE",
  "FLEET_SEAT_JOB_ID",
  "FLEET_SEAT_STAGE",
  "FLEET_SEAT_ID",
  "FLEET_SESSION_KIND",
  "FLEET_SESSION_ID",
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
  "CLAUDE_SESSION_ID",
  "COPILOT_HOOK_EVENT",
  "COPILOT_AGENT_SESSION_ID",
  "COPILOT_PROJECT_DIR",
  "COPILOT_RUN_ID",
  "COPILOT_MODEL",
  "COPILOT_ALLOW_ALL",
  "GROK_HOOK_EVENT",
  "GROK_SESSION_ID",
  "ANTIGRAVITY_AGENT",
  "ANTIGRAVITY_CONVERSATION_ID",
  "CURSOR_AGENT",
  "CURSOR_CONVERSATION_ID",
  "CODEX_THREAD_ID",
  "CODEX_SESSION_ID",
] as const);

const HARNESS_PREFIXES = ["CURSOR_HOOK"] as const;
// code#11940: commission topology (depth, tier, workstream, parent) describes the running agent, not a fixture.
const FLEET_SESSION_KEY = /^FLEET_(?:SESSION|COMMISSION|MOCHA|WORKSTREAM|PARENT_SESSION)(?:_.*)?$/i;

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
  /** The caller settles this root itself (for example, an awaited child with a keep-root option). */
  cleanup?: "process-exit" | "caller";
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
  if (FLEET_SESSION_KEY.test(upper)) return true;
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

const HERMETIC_GITHUB_SSH_PREFIXES = [
  "git@github.com:",
  "ssh://git@github.com/",
  "ssh://git@github.com:22/",
  "git+ssh://git@github.com/",
  "git+ssh://git@github.com:22/",
] as const;

const WINDOWS_GH_CREDENTIAL_HELPER =
  String.raw`!'C:\\Program Files\\GitHub CLI\\gh.exe' auth git-credential`;

/**
 * Disposable global gitconfig. A hermetic HOME hides the operator credential helper, and
 * windowless Git for Windows then asks git-askpass.exe (a headed "Git for Windows" dialog)
 * even with GIT_TERMINAL_PROMPT=0. credential.interactive=false makes a credential miss fail
 * instead, HTTPS insteadOf rewrites avoid SSH key prompts, and BatchMode ssh with
 * StrictHostKeyChecking=yes never asks about host keys (code#8482, windows-maintenance#1758).
 */
export function hermeticGlobalGitConfigText(): string {
  const lines = [
    "# fleet hermetic test global",
    "# Non-interactive GitHub transport. This file replaces the operator gitconfig.",
    "[credential]",
    "\tinteractive = false",
  ];
  if (process.platform === "win32" && existsSync(String.raw`C:\Program Files\GitHub CLI\gh.exe`)) {
    lines.push('[credential "https://github.com"]', "\thelper =", `\thelper = ${WINDOWS_GH_CREDENTIAL_HELPER}`);
  }
  lines.push('[url "https://github.com/"]');
  for (const prefix of HERMETIC_GITHUB_SSH_PREFIXES) {
    lines.push(`\tinsteadOf = ${prefix}`);
  }
  lines.push(
    "[core]",
    "\tsshCommand = ssh -o BatchMode=yes -o StrictHostKeyChecking=yes",
    "",
  );
  return lines.join("\n");
}

function populatePrivateDirectories(root: string, env: NodeJS.ProcessEnv): void {
  for (const [key, relative] of Object.entries({ ...PRIVATE_AGENT_STORAGE_PATHS, ...PRIVATE_STATE_HOME_PATHS })) {
    const directory = path.join(root, ...relative);
    mkdirSync(directory, { recursive: true });
    env[key] = directory;
  }
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
  const root = createHermeticRoot(parent, prefix);
  if (options.cleanup === "caller") retainHermeticRoot(root);
  const home = path.join(root, "home");
  const xdgConfig = path.join(root, "xdg-config");
  const gitConfigGlobal = path.join(root, "gitconfig.global");
  const gitConfigSystem = path.join(root, "gitconfig.system");
  const tempDir = path.join(root, "tmp");
  for (const dir of [home, xdgConfig, tempDir]) mkdirSync(dir, { recursive: true });
  writeFileSync(gitConfigGlobal, hermeticGlobalGitConfigText(), "utf8");
  writeFileSync(gitConfigSystem, "# fleet hermetic test system\n", "utf8");

  const env = copyInheritedEnvironment(source);
  env["FLEET_CENTRAL_DB_PATH"] = path.join(root, "fleet-central.sqlite");
  populatePrivateDirectories(root, env);

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
  env["GIT_CONFIG_COUNT"] = "3";
  env["GIT_CONFIG_KEY_0"] = "commit.gpgsign";
  env["GIT_CONFIG_VALUE_0"] = "false";
  env["GIT_CONFIG_KEY_1"] = "tag.gpgsign";
  env["GIT_CONFIG_VALUE_1"] = "false";
  // Highest-precedence copy: survives a test that repoints GIT_CONFIG_GLOBAL.
  env["GIT_CONFIG_KEY_2"] = "credential.interactive";
  env["GIT_CONFIG_VALUE_2"] = "false";
  env["GIT_TERMINAL_PROMPT"] = "0";
  env["GCM_INTERACTIVE"] = "Never";

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
