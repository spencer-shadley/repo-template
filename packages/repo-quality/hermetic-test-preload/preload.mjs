// @generated from hermetic-test-preload/preload.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
/**
 * Node --import entry: scrub process.env for hermetic tests (code#6081).
 *
 *   node --import @spencer-shadley/repo-quality/hermetic-test-preload …
 *   node --experimental-strip-types --import ./node_modules/@spencer-shadley/repo-quality/hermetic-test-preload/preload.ts …
 */
import { applyHermeticTestEnvironment } from "./env.mjs";
export const HERMETIC_TEST_ROOT = applyHermeticTestEnvironment({
    prefix: "fleet-hermetic-preload-",
});
export { applyHermeticTestEnvironment, buildHermeticTestEnvironment, hermeticEnvironmentSummary, isHermeticStripKey, } from "./env.mjs";
