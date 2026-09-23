/**
 * Shared hermetic test preload for fleet repositories (code#6081; cli-wrappers#1136).
 *
 * Enforces DOCTRINE §0 / §45 test hermeticity:
 * Tests must read and mutate only state created under their own temporary root.
 *
 * At import time:
 * 1. Removes all git routing variables (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, etc.)
 *    so tests never silently reach into real repositories or inherited seat worktrees.
 * 2. Removes all GIT_CONFIG_* injection variables (GIT_CONFIG_COUNT, GIT_CONFIG_KEY_*, etc.).
 * 3. Points HOME, XDG_CONFIG_HOME, and GIT_CONFIG_GLOBAL at a per-process temp directory,
 *    cleaned up on process exit.
 * 4. Sets GIT_CONFIG_NOSYSTEM=1 to prevent reading host system git config.
 * 5. Sets GIT_CEILING_DIRECTORIES to stop git from discovering repositories above the temp root.
 *
 * Usage:
 *   node --import @spencer-shadley/repo-quality/preload --test ...
 *
 * Explicit spawn helper:
 *   import { hermeticGitEnv } from "@spencer-shadley/repo-quality/preload";
 *   execFileSync("git", ["status"], { env: hermeticGitEnv() });
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HERMETIC_GIT_ROUTING_VARIABLES = Object.freeze([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
  "GIT_GRAFT_FILE",
  "GIT_DISCOVERY_ACROSS_FILESYSTEM",
] as const);

export const HERMETIC_GIT_ROUTING_SET: ReadonlySet<string> = new Set(
  HERMETIC_GIT_ROUTING_VARIABLES.map((v) => v.toUpperCase()),
);

export const HERMETIC_MARKER_ENV = "REPO_QUALITY_HERMETIC_PRELOAD" as const;
export const HERMETIC_MARKER_ENV_ALIAS = "HERMETIC_GIT_PRELOAD" as const;

let activeHermeticTempDir: string | null = null;
let cleanupRegistered = false;

function ensureHermeticTempDir(): string {
  if (activeHermeticTempDir && fs.existsSync(activeHermeticTempDir)) {
    return activeHermeticTempDir;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-quality-hermetic-git-"));
  activeHermeticTempDir = tempDir;

  const globalConfigPath = path.join(tempDir, ".gitconfig");
  if (!fs.existsSync(globalConfigPath)) {
    fs.writeFileSync(globalConfigPath, "", "utf8");
  }

  const xdgConfigDir = path.join(tempDir, ".config");
  if (!fs.existsSync(xdgConfigDir)) {
    fs.mkdirSync(xdgConfigDir, { recursive: true });
  }

  if (!cleanupRegistered) {
    cleanupRegistered = true;
    process.on("exit", () => {
      try {
        if (activeHermeticTempDir && fs.existsSync(activeHermeticTempDir)) {
          fs.rmSync(activeHermeticTempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignored during process teardown
      }
    });
  }

  return tempDir;
}

export function getHermeticTempDir(): string {
  return ensureHermeticTempDir();
}

export function isHermeticActive(): boolean {
  return (
    process.env[HERMETIC_MARKER_ENV] === "1" ||
    process.env[HERMETIC_MARKER_ENV_ALIAS] === "1"
  );
}

export function sanitizeProcessEnv(): { tempDir: string; cleanedKeys: string[] } {
  const tempDir = ensureHermeticTempDir();
  const globalConfig = path.join(tempDir, ".gitconfig");
  const xdgConfig = path.join(tempDir, ".config");
  const ceilingDir = path.dirname(tempDir);

  const cleanedKeys: string[] = [];
  for (const key of Object.keys(process.env)) {
    const upper = key.toUpperCase();
    if (HERMETIC_GIT_ROUTING_SET.has(upper) || upper.startsWith("GIT_CONFIG_")) {
      delete process.env[key];
      cleanedKeys.push(key);
    }
  }

  process.env["HOME"] = tempDir;
  process.env["XDG_CONFIG_HOME"] = xdgConfig;
  process.env["GIT_CONFIG_GLOBAL"] = globalConfig;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  process.env["GIT_CEILING_DIRECTORIES"] = ceilingDir;
  process.env[HERMETIC_MARKER_ENV] = "1";
  process.env[HERMETIC_MARKER_ENV_ALIAS] = "1";

  return { tempDir, cleanedKeys };
}

export interface HermeticGitEnvOptions {
  readonly tempDir?: string;
  readonly ceilingDirectories?: string;
  readonly gitConfigGlobal?: string;
  readonly xdgConfigHome?: string;
}

export function hermeticGitEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  overrides?: NodeJS.ProcessEnv,
  options: HermeticGitEnvOptions = {},
): NodeJS.ProcessEnv {
  const tempDir = options.tempDir ?? ensureHermeticTempDir();
  const globalConfig = options.gitConfigGlobal ?? path.join(tempDir, ".gitconfig");
  const xdgConfig = options.xdgConfigHome ?? path.join(tempDir, ".config");
  const ceilingDir = options.ceilingDirectories ?? path.dirname(tempDir);

  const env: NodeJS.ProcessEnv = { ...baseEnv };

  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();
    if (HERMETIC_GIT_ROUTING_SET.has(upper) || upper.startsWith("GIT_CONFIG_")) {
      delete env[key];
    }
  }

  env["HOME"] = tempDir;
  env["XDG_CONFIG_HOME"] = xdgConfig;
  env["GIT_CONFIG_GLOBAL"] = globalConfig;
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  env["GIT_CEILING_DIRECTORIES"] = ceilingDir;
  env[HERMETIC_MARKER_ENV] = "1";
  env[HERMETIC_MARKER_ENV_ALIAS] = "1";

  if (overrides) {
    Object.assign(env, overrides);
  }

  return env;
}

export const sanitizedGitEnv = hermeticGitEnv;
export const cleanGitEnvironment = hermeticGitEnv;

// Execute sanitization at import time for preload consumers.
sanitizeProcessEnv();
