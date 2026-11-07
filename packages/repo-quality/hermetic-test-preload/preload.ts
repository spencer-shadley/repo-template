/**
 * Node --import entry: scrub process.env for hermetic tests (code#6081).
 *
 *   node --import @spencer-shadley/repo-quality/hermetic-test-preload …
 *   node --experimental-strip-types --import ./node_modules/@spencer-shadley/repo-quality/hermetic-test-preload/preload.ts …
 */
import { tmpdir } from "node:os";
import { applyHermeticTestEnvironment, sweepDeadHermeticRoots } from "./env.ts";

const PREFIX = "fleet-hermetic-preload-";
// Reclaim roots whose test process was killed before its exit hook ran, including the builder's default prefix
// (code#13858).
for (const prefix of [PREFIX, "fleet-hermetic-test-"]) sweepDeadHermeticRoots(tmpdir(), prefix);
export const HERMETIC_TEST_ROOT = applyHermeticTestEnvironment({ prefix: PREFIX });

export {
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
} from "./env.ts";
