/**
 * @spencer-shadley/repo-quality/hermetic-test-preload (code#6081 / DOCTRINE §65)
 *
 * Shared hermetic test environment for every fleet repository.
 * Import the preload entry for --import side effects, or call the builders directly.
 */
export {
  HERMETIC_STRIP_EXACT,
  HERMETIC_OWNER_MARKER,
  HERMETIC_SWEEP_MIN_AGE_MS,
  isHermeticOwner,
  sweepDeadHermeticRoots,
  removeOwnedHermeticRoot,
  retainHermeticRoot,
  runWithHermeticRootCommand,
  captureHermeticPnpmStore,
  restoreHermeticPnpmStore,
  type HermeticPnpmCacheBinding,
  type HermeticPnpmCacheSnapshot,
  applyHermeticTestEnvironment,
  buildHermeticTestEnvironment,
  hermeticEnvironmentSummary,
  isHermeticStripKey,
  type HermeticTestEnvironment,
  type HermeticTestEnvironmentOptions,
} from "./env.ts";
