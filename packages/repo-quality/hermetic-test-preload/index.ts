/**
 * @spencer-shadley/repo-quality/hermetic-test-preload (code#6081 / DOCTRINE §65)
 *
 * Shared hermetic test environment for every fleet repository.
 * Import the preload entry for --import side effects, or call the builders directly.
 */
export {
  HERMETIC_STRIP_EXACT,
  applyHermeticTestEnvironment,
  buildHermeticTestEnvironment,
  hermeticEnvironmentSummary,
  isHermeticStripKey,
  type HermeticTestEnvironment,
  type HermeticTestEnvironmentOptions,
} from "./env.ts";
