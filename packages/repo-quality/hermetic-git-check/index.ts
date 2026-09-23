/**
 * Hermetic git spawn checker (code#6081; cli-wrappers#1136).
 *
 * Scans test files to ensure spawns of `git` are scoped by either:
 * 1. Running the test suite under `@spencer-shadley/repo-quality/preload`, OR
 * 2. Explicitly passing `env: hermeticGitEnv()` to child_process spawns.
 */

import fs from "node:fs";
import path from "node:path";

export const HERMETIC_GIT_CHECK_SCHEMA = "HermeticGitCheckV1" as const;

export interface HermeticGitViolation {
  readonly file: string;
  readonly line: number;
  readonly callee: string;
  readonly detail: string;
}

export interface HermeticGitCheckResult {
  readonly schema: typeof HERMETIC_GIT_CHECK_SCHEMA;
  readonly ok: boolean;
  readonly testFilesScanned: number;
  readonly violations: readonly HermeticGitViolation[];
}

const TEST_FILE_RE = /(?:\.test|\.spec)\.[cm]?[jt]sx?$|(?:^|[/\\])(?:test|tests|__tests__|e2e|fixtures)[/\\]/i;
const PRELOAD_IMPORT_RE = /from\s+["'][^"']*repo-quality\/(?:hermetic-)?preload(?:\.mjs|\.js|\.ts)?["']|import\s+["'][^"']*repo-quality\/(?:hermetic-)?preload(?:\.mjs|\.js|\.ts)?["']/i;
const PRELOAD_DIRECTIVE_RE = /@hermetic(?:-git)?-preload\b|\bhermetic:\s*preload\b/i;
const GIT_SPAWN_RE = /\b(spawn|execFile|spawnSync|execFileSync)\s*\(\s*(?:["'`]git["'`]|['"`].*\/git['"`])/g;
const HERMETIC_ENV_RE = /\b(?:hermeticGitEnv|sanitizedGitEnv|cleanGitEnvironment|hermeticEnv)\b/;

export function isTestFilePath(filePath: string): boolean {
  return TEST_FILE_RE.test(filePath.replaceAll("\\", "/"));
}

export function isFilePreloaded(content: string, filePath?: string): boolean {
  if (PRELOAD_IMPORT_RE.test(content) || PRELOAD_DIRECTIVE_RE.test(content)) {
    return true;
  }

  if (filePath) {
    let currentDir = path.dirname(path.resolve(filePath));
    while (currentDir && currentDir !== path.dirname(currentDir)) {
      const pkgPath = path.join(currentDir, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
          if (pkg && typeof pkg === "object" && pkg["scripts"] && typeof pkg["scripts"] === "object") {
            const scripts = pkg["scripts"] as Record<string, unknown>;
            for (const script of Object.values(scripts)) {
              if (
                typeof script === "string" &&
                script.includes("--import") &&
                /repo-quality\/(?:hermetic-)?preload/.test(script)
              ) {
                return true;
              }
            }
          }
        } catch {
          // Ignore parse errors in package.json lookup
        }
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  }

  return false;
}

export function checkTestFileContent(content: string, filePath = "<input>"): HermeticGitViolation[] {
  if (isFilePreloaded(content, filePath === "<input>" ? undefined : filePath)) {
    return [];
  }

  const violations: HermeticGitViolation[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    let match: RegExpExecArray | null;
    const re = new RegExp(GIT_SPAWN_RE);

    while ((match = re.exec(line)) !== null) {
      const callee = match[1] ?? "spawn";
      // Inspect surrounding lines (up to 5 lines ahead) for env option
      const contextWindow = lines.slice(i, Math.min(lines.length, i + 6)).join("\n");
      if (!HERMETIC_ENV_RE.test(contextWindow)) {
        violations.push({
          file: filePath,
          line: i + 1,
          callee,
          detail: `Spawning 'git' via ${callee} without hermetic environment. Run tests under '@spencer-shadley/repo-quality/preload' or pass 'env: hermeticGitEnv()'.`,
        });
      }
    }
  }

  return violations;
}

export function checkHermeticGit(
  filePaths: readonly string[],
  options: { readonly cwd?: string } = {},
): HermeticGitCheckResult {
  const cwd = options.cwd || process.cwd();
  const violations: HermeticGitViolation[] = [];
  let testFilesScanned = 0;

  for (const rel of filePaths) {
    const normalized = rel.replaceAll("\\", "/");
    if (!isTestFilePath(normalized)) continue;

    const abs = path.resolve(cwd, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;

    testFilesScanned++;
    const content = fs.readFileSync(abs, "utf8");
    const fileViolations = checkTestFileContent(content, rel);
    violations.push(...fileViolations);
  }

  return {
    schema: HERMETIC_GIT_CHECK_SCHEMA,
    ok: violations.length === 0,
    testFilesScanned,
    violations,
  };
}
