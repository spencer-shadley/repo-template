export const STACK_WAIVER_PATTERN: RegExp;
export const ESLINT_INLINE_CONFIG_PATTERN: RegExp;
export const ISSUE_TRACKING_PATTERN: RegExp;
export const JS_FILE_PATTERN: RegExp;
export const KNIP_CONFIG: Readonly<{ readonly rules: Readonly<{ readonly cycles: "error" }> }>;
export function knipConfig(): { rules: { cycles: "error" } };
export const preferTypeScriptRule: import("eslint").Rule.RuleModule;
export const noEslintInlineConfigRule: import("eslint").Rule.RuleModule;
export const hermeticGitSpawnRule: import("eslint").Rule.RuleModule;
export const fleetPlugin: import("eslint").ESLint.Plugin;
export const DEFAULT_FLEET_IGNORES: readonly string[];
export const DEFAULT_FLEET_GLOBALS: Readonly<Record<string, boolean>>;
export function qualityRules(options?: Record<string, unknown>): unknown[];
export const QUALITY_LINT_GATE_ID: string;
export const QUALITY_LINT_GATE_VERSION: string;
export const RuleTester: typeof import("eslint").RuleTester;
export const typescriptEslint: typeof import("typescript-eslint");
export const HERMETIC_GIT_ROUTING_VARIABLES: readonly string[];
export const HERMETIC_MARKER_ENV: "REPO_QUALITY_HERMETIC_PRELOAD";
export const HERMETIC_MARKER_ENV_ALIAS: "HERMETIC_GIT_PRELOAD";
export function getHermeticTempDir(): string;
export function isHermeticActive(): boolean;
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
