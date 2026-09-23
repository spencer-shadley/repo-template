/**
 * Node --import entry: scrub process.env for hermetic tests (code#6081).
 *
 *   node --import @spencer-shadley/repo-quality/hermetic-test-preload …
 *   node --experimental-strip-types --import ./node_modules/@spencer-shadley/repo-quality/hermetic-test-preload/preload.ts …
 */
import { applyHermeticTestEnvironment } from "./env.ts";

export const HERMETIC_TEST_ROOT = applyHermeticTestEnvironment({
  prefix: "fleet-hermetic-preload-",
});

export {
  applyHermeticTestEnvironment,
  buildHermeticTestEnvironment,
  hermeticEnvironmentSummary,
  isHermeticStripKey,
} from "./env.ts";
