import {
  CONTRACT_ID,
  CONTRACT_VERSION,
  ENVELOPE_DIGEST_ALGORITHM,
  SCHEMA_DIGESTS,
  SCHEMA_IDS,
  type BundleReference,
  type CapabilityBundle,
  type CapabilityBundleRegistry,
  type Diagnostic,
  type PayloadEntry,
  type ValidationResult,
} from "./contract.ts";
import { sha256CanonicalJson } from "./digest.ts";
import {
  isIssueTemplateOverride,
  isPreCustodyWorkflow,
  portablePathFailure,
} from "./path-policy.ts";
import {
  assertSortedUnique,
  BUNDLE_ID_PATTERN,
  Diagnostics,
  SEMVER_PATTERN,
} from "./validation-helpers.ts";

function validatePath(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is string {
  if (!diagnostics.string(value, pointer, { min: 1, max: 240 })) return false;
  const failure = portablePathFailure(value);
  if (
    failure !== null ||
    isIssueTemplateOverride(value) ||
    isPreCustodyWorkflow(value)
  ) {
    const issueOverride = isIssueTemplateOverride(value);
    const workflow = isPreCustodyWorkflow(value);
    diagnostics.add(
      issueOverride
        ? "E_PATH_ISSUE_TEMPLATE"
        : workflow
          ? "E_PATH_PRE_CUSTODY_WORKFLOW"
          : "E_PATH_PORTABLE",
      pointer,
      issueOverride
        ? "local .github/ISSUE_TEMPLATE overrides are forbidden"
        : workflow
          ? "pre-custody .github/workflows entries are forbidden"
          : `portable path rejected: ${failure}`,
    );
    return false;
  }
  return true;
}

function validateReference(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is BundleReference {
  if (
    !diagnostics.object(
      value,
      pointer,
      ["id", "version", "digest"],
      ["id", "version", "digest"],
    )
  ) {
    return false;
  }
  diagnostics.string(value["id"], `${pointer}/id`, {
    min: 1,
    max: 80,
    pattern: BUNDLE_ID_PATTERN,
  });
  diagnostics.string(value["version"], `${pointer}/version`, {
    min: 5,
    max: 80,
    pattern: SEMVER_PATTERN,
  });
  diagnostics.sha(value["digest"], `${pointer}/digest`);
  return true;
}

function validatePaths(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): readonly string[] {
  if (!diagnostics.array(value, pointer, 0, 4096)) return [];
  const paths: string[] = [];
  for (const [index, path] of value.entries()) {
    if (validatePath(path, `${pointer}/${index}`, diagnostics)) paths.push(path);
  }
  assertSortedUnique(paths, pointer, diagnostics);
  return paths;
}

function validateBundleModes(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (!diagnostics.array(value, `${pointer}/modes`, 0, 64)) return;
  const modeIds: string[] = [];
  for (const [index, mode] of (value).entries()) {
    const modePointer = `${pointer}/modes/${index}`;
    if (
      !diagnostics.object(
        mode,
        modePointer,
        ["id", "entrypoint", "requiredPaths"],
        ["id", "entrypoint", "requiredPaths"],
      )
    ) {
      continue;
    }
    const modeRec = mode;
    if (
      diagnostics.string(modeRec["id"], `${modePointer}/id`, {
        min: 1,
        max: 40,
        pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      })
    ) {
      modeIds.push(modeRec["id"]);
    }
    validatePath(modeRec["entrypoint"], `${modePointer}/entrypoint`, diagnostics);
    validatePaths(modeRec["requiredPaths"], `${modePointer}/requiredPaths`, diagnostics);
  }
  assertSortedUnique(modeIds, `${pointer}/modes`, diagnostics);
}

function validateBundleDigest(
  value: Record<string, unknown>,
  pointer: string,
  diagnostics: Diagnostics,
): void {
  if (typeof value["digest"] !== "string") return;
  const { digest: _digest, ...body } = value;
  try {
    if (sha256CanonicalJson(body) !== value["digest"]) {
      diagnostics.add("E_BUNDLE_DIGEST", `${pointer}/digest`, "bundle digest mismatch");
    }
  } catch {
    diagnostics.add(
      "E_CANONICAL_JSON",
      `${pointer}/digest`,
      "bundle body is not supported canonical JSON",
    );
  }
}

function validateBundle(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is CapabilityBundle {
  const fields = [
    "id", "version", "digestAlgorithm", "digest",
    "dependencies", "artifacts", "fixtures", "goldens", "modes",
  ];
  if (!diagnostics.object(value, pointer, fields, fields)) return false;
  const rec = value;
  diagnostics.string(rec["id"], `${pointer}/id`, { min: 1, max: 80, pattern: BUNDLE_ID_PATTERN });
  diagnostics.string(rec["version"], `${pointer}/version`, { min: 5, max: 80, pattern: SEMVER_PATTERN });
  diagnostics.string(rec["digestAlgorithm"], `${pointer}/digestAlgorithm`, {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(rec["digest"], `${pointer}/digest`);
  if (diagnostics.array(rec["dependencies"], `${pointer}/dependencies`, 0, 128)) {
    const keys: string[] = [];
    for (const [index, dependency] of (rec["dependencies"]).entries()) {
      if (validateReference(dependency, `${pointer}/dependencies/${index}`, diagnostics)) {
        keys.push(`${(dependency).id}\u{0}${(dependency).version}\u{0}${(dependency).digest}`);
      }
    }
    assertSortedUnique(keys, `${pointer}/dependencies`, diagnostics);
  }
  const artifacts = validatePaths(rec["artifacts"], `${pointer}/artifacts`, diagnostics);
  const fixtures = validatePaths(rec["fixtures"], `${pointer}/fixtures`, diagnostics);
  const goldens = validatePaths(rec["goldens"], `${pointer}/goldens`, diagnostics);
  const classifiedPaths = [...artifacts, ...fixtures, ...goldens].sort();
  assertSortedUnique(classifiedPaths, `${pointer}/closure`, diagnostics);
  validateBundleModes(rec["modes"], pointer, diagnostics);
  validateBundleDigest(rec, pointer, diagnostics);
  return true;
}

function finish<T>(value: T | undefined, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: rows };
}

export function validateCapabilityBundleRegistryV2(
  value: unknown,
): ValidationResult<CapabilityBundleRegistry> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId",
    "schemaVersion",
    "schemaDigest",
    "contractId",
    "digestAlgorithm",
    "registryDigest",
    "bundles",
  ];
  if (!diagnostics.object(value, "", fields, fields)) {
    return finish<CapabilityBundleRegistry>(undefined, diagnostics);
  }
  diagnostics.string(value["schemaId"], "/schemaId", {
    constant: SCHEMA_IDS.capabilityBundle,
  });
  diagnostics.string(value["schemaVersion"], "/schemaVersion", {
    constant: CONTRACT_VERSION,
  });
  if (
    diagnostics.sha(value["schemaDigest"], "/schemaDigest") &&
    value["schemaDigest"] !== SCHEMA_DIGESTS.capabilityBundle
  ) {
    diagnostics.add(
      "E_SCHEMA_DIGEST",
      "/schemaDigest",
      "schema digest does not match the committed contract",
    );
  }
  diagnostics.string(value["contractId"], "/contractId", { constant: CONTRACT_ID });
  diagnostics.string(value["digestAlgorithm"], "/digestAlgorithm", {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["registryDigest"], "/registryDigest");
  if (diagnostics.array(value["bundles"], "/bundles", 0, 256)) {
    const keys: string[] = [];
    for (const [index, bundle] of value["bundles"].entries()) {
      if (validateBundle(bundle, `/bundles/${index}`, diagnostics)) {
        keys.push(`${bundle.id}\u{0}${bundle.version}\u{0}${bundle.digest}`);
      }
    }
    assertSortedUnique(keys, "/bundles", diagnostics);
  }
  if (typeof value["registryDigest"] === "string") {
    const { registryDigest: _registryDigest, ...body } = value;
    try {
      if (sha256CanonicalJson(body) !== value["registryDigest"]) {
        diagnostics.add("E_REGISTRY_DIGEST", "/registryDigest", "registry digest mismatch");
      }
    } catch {
      diagnostics.add(
        "E_CANONICAL_JSON",
        "/registryDigest",
        "registry body is not supported canonical JSON",
      );
    }
  }
  return finish(value as unknown as CapabilityBundleRegistry, diagnostics);
}

function referenceKey(reference: BundleReference): string {
  return `${reference.id}\u{0}${reference.version}\u{0}${reference.digest}`;
}

export interface CapabilityClosure {
  readonly bundles: readonly CapabilityBundle[];
  readonly diagnostics: readonly Diagnostic[];
}

const CATEGORY_ROLES: Record<string, Set<string>> = {
  ARTIFACT: new Set(["capability-executable", "capability-config"]),
  FIXTURE: new Set(["capability-fixture"]),
  GOLDEN: new Set(["capability-golden"]),
};

function validateSingleCategoryPath(
  bundle: CapabilityBundle,
  category: "ARTIFACT" | "FIXTURE" | "GOLDEN",
  path: string,
  entryByPath: Map<string, PayloadEntry>,
  diagnostics: Diagnostics,
): void {
  const entry = entryByPath.get(path);
  if (entry === undefined) {
    diagnostics.add(
      `E_BUNDLE_${category}_MISSING`,
      `/bundles/${bundle.id}/${path}`,
      `${category.toLowerCase()} path is absent from the release`,
    );
    return;
  }
  if (entry.bundleId !== bundle.id) {
    diagnostics.add(
      "E_BUNDLE_OWNERSHIP",
      `/entries/${path}/bundleId`,
      `entry is not owned by ${bundle.id}`,
    );
    return;
  }
  const expectedRoles = CATEGORY_ROLES[category];
  if (!expectedRoles?.has(entry.role)) {
    diagnostics.add(
      "E_BUNDLE_ROLE",
      `/entries/${path}/role`,
      `entry role does not match ${category.toLowerCase()} classification`,
    );
  }
}

function validateBundleCategoryPaths(
  bundle: CapabilityBundle,
  entryByPath: Map<string, PayloadEntry>,
  diagnostics: Diagnostics,
): void {
  for (const [category, paths] of [
    ["ARTIFACT", bundle.artifacts],
    ["FIXTURE", bundle.fixtures],
    ["GOLDEN", bundle.goldens],
  ] as const) {
    for (const path of paths) {
      validateSingleCategoryPath(bundle, category, path, entryByPath, diagnostics);
    }
  }
}

function validateBundleModesClosure(
  bundle: CapabilityBundle,
  declared: Set<string>,
  entryByPath: Map<string, PayloadEntry>,
  diagnostics: Diagnostics,
): void {
  for (const mode of bundle.modes) {
    if (!bundle.artifacts.includes(mode.entrypoint)) {
      diagnostics.add(
        "E_MODE_ENTRYPOINT",
        `/bundles/${bundle.id}/modes/${mode.id}/entrypoint`,
        "mode entrypoint must be a bundle artifact",
      );
    }
    for (const path of mode.requiredPaths) {
      if (!declared.has(path) || !entryByPath.has(path)) {
        diagnostics.add(
          "E_MODE_CLOSURE",
          `/bundles/${bundle.id}/modes/${mode.id}/requiredPaths`,
          `mode dependency is absent from the materializable closure: ${path}`,
        );
      }
    }
  }
}

export function resolveCapabilityClosure(
  registry: CapabilityBundleRegistry,
  requested: readonly BundleReference[],
  entries: readonly PayloadEntry[],
): CapabilityClosure {
  const diagnostics = new Diagnostics();
  const byReference = new Map(
    registry.bundles.map((bundle) => [referenceKey(bundle), bundle]),
  );
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const selected = new Map<string, CapabilityBundle>();
  const visiting = new Set<string>();

  const visit = (reference: BundleReference, pointer: string): void => {
    const key = referenceKey(reference);
    const bundle = byReference.get(key);
    if (bundle === undefined) {
      diagnostics.add("E_BUNDLE_MISSING", pointer, "referenced capability bundle is missing");
      return;
    }
    if (selected.has(key)) return;
    if (visiting.has(key)) {
      diagnostics.add("E_BUNDLE_CYCLE", pointer, "capability dependency cycle detected");
      return;
    }
    visiting.add(key);
    for (const [index, dependency] of bundle.dependencies.entries()) visit(dependency, `${pointer}/dependencies/${index}`)
    ;
    visiting.delete(key);
    selected.set(key, bundle);
  };
  for (const [index, reference] of requested.entries()) visit(reference, `/requestedBundles/${index}`);

  for (const bundle of selected.values()) {
    const declared = new Set([
      ...bundle.artifacts,
      ...bundle.fixtures,
      ...bundle.goldens,
    ]);
    validateBundleCategoryPaths(bundle, entryByPath, diagnostics);
    validateBundleModesClosure(bundle, declared, entryByPath, diagnostics);
  }

  const bundles = [...selected.values()].sort((left, right) =>
    referenceKey(left) < referenceKey(right) ? -1 : 1,
  );
  return { bundles, diagnostics: diagnostics.sorted() };
}
