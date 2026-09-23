export const HERMETIC_GIT_ROUTING_VARIABLES: readonly string[];
export const HERMETIC_GIT_ROUTING_SET: ReadonlySet<string>;
export const HERMETIC_MARKER_ENV: "REPO_QUALITY_HERMETIC_PRELOAD";
export const HERMETIC_MARKER_ENV_ALIAS: "HERMETIC_GIT_PRELOAD";
export function getHermeticTempDir(): string;
export function isHermeticActive(): boolean;
export function sanitizeProcessEnv(): { tempDir: string; cleanedKeys: string[] };
export interface HermeticGitEnvOptions {
  readonly tempDir?: string;
  readonly ceilingDirectories?: string;
  readonly gitConfigGlobal?: string;
  readonly xdgConfigHome?: string;
}
export function hermeticGitEnv(
  baseEnv?: NodeJS.ProcessEnv,
  overrides?: NodeJS.ProcessEnv,
  options?: HermeticGitEnvOptions,
): NodeJS.ProcessEnv;
export const sanitizedGitEnv: typeof hermeticGitEnv;
export const cleanGitEnvironment: typeof hermeticGitEnv;
