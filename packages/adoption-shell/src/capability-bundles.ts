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
} from "./contract.js";
import { sha256CanonicalJson } from "./digest.js";
import { isIssueTemplateOverride, portablePathFailure } from "./path-policy.js";
import {
  assertSortedUnique,
  BUNDLE_ID_PATTERN,
  Diagnostics,
  SEMVER_PATTERN,
} from "./validation-helpers.js";

function validatePath(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is string {
  if (!diagnostics.string(value, pointer, { min: 1, max: 240 })) return false;
  const failure = portablePathFailure(value);
  if (failure !== null || isIssueTemplateOverride(value)) {
    diagnostics.add(
      isIssueTemplateOverride(value) ? "E_PATH_ISSUE_TEMPLATE" : "E_PATH_PORTABLE",
      pointer,
      isIssueTemplateOverride(value)
        ? "local .github/ISSUE_TEMPLATE overrides are forbidden"
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
  value.forEach((path, index) => {
    if (validatePath(path, `${pointer}/${index}`, diagnostics)) paths.push(path);
  });
  assertSortedUnique(paths, pointer, diagnostics);
  return paths;
}

function validateBundle(
  value: unknown,
  pointer: string,
  diagnostics: Diagnostics,
): value is CapabilityBundle {
  const fields = [
    "id",
    "version",
    "digestAlgorithm",
    "digest",
    "dependencies",
    "artifacts",
    "fixtures",
    "goldens",
    "modes",
  ];
  if (!diagnostics.object(value, pointer, fields, fields)) return false;
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
  diagnostics.string(value["digestAlgorithm"], `${pointer}/digestAlgorithm`, {
    constant: ENVELOPE_DIGEST_ALGORITHM,
  });
  diagnostics.sha(value["digest"], `${pointer}/digest`);
  if (diagnostics.array(value["dependencies"], `${pointer}/dependencies`, 0, 128)) {
    const keys: string[] = [];
    value["dependencies"].forEach((dependency, index) => {
      if (validateReference(dependency, `${pointer}/dependencies/${index}`, diagnostics)) {
        keys.push(`${dependency.id}\u0000${dependency.version}\u0000${dependency.digest}`);
      }
    });
    assertSortedUnique(keys, `${pointer}/dependencies`, diagnostics);
  }
  validatePaths(value["artifacts"], `${pointer}/artifacts`, diagnostics);
  validatePaths(value["fixtures"], `${pointer}/fixtures`, diagnostics);
  validatePaths(value["goldens"], `${pointer}/goldens`, diagnostics);
  if (diagnostics.array(value["modes"], `${pointer}/modes`, 0, 64)) {
    const modeIds: string[] = [];
    value["modes"].forEach((mode, index) => {
      const modePointer = `${pointer}/modes/${index}`;
      if (
        !diagnostics.object(
          mode,
          modePointer,
          ["id", "entrypoint", "requiredPaths"],
          ["id", "entrypoint", "requiredPaths"],
        )
      ) {
        return;
      }
      if (
        diagnostics.string(mode["id"], `${modePointer}/id`, {
          min: 1,
          max: 40,
          pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        })
      ) {
        modeIds.push(mode["id"]);
      }
      validatePath(mode["entrypoint"], `${modePointer}/entrypoint`, diagnostics);
      validatePaths(mode["requiredPaths"], `${modePointer}/requiredPaths`, diagnostics);
    });
    assertSortedUnique(modeIds, `${pointer}/modes`, diagnostics);
  }
  if (typeof value["digest"] === "string") {
    const { digest: _digest, ...body } = value;
    if (sha256CanonicalJson(body) !== value["digest"]) {
      diagnostics.add("E_BUNDLE_DIGEST", `${pointer}/digest`, "bundle digest mismatch");
    }
  }
  return true;
}

function finish<T>(value: T, diagnostics: Diagnostics): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
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
    return finish(value as CapabilityBundleRegistry, diagnostics);
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
    value["bundles"].forEach((bundle, index) => {
      if (validateBundle(bundle, `/bundles/${index}`, diagnostics)) {
        keys.push(`${bundle.id}\u0000${bundle.version}\u0000${bundle.digest}`);
      }
    });
    assertSortedUnique(keys, "/bundles", diagnostics);
  }
  if (typeof value["registryDigest"] === "string") {
    const { registryDigest: _registryDigest, ...body } = value;
    if (sha256CanonicalJson(body) !== value["registryDigest"]) {
      diagnostics.add("E_REGISTRY_DIGEST", "/registryDigest", "registry digest mismatch");
    }
  }
  return finish(value as unknown as CapabilityBundleRegistry, diagnostics);
}

function referenceKey(reference: BundleReference): string {
  return `${reference.id}\u0000${reference.version}\u0000${reference.digest}`;
}

export interface CapabilityClosure {
  readonly bundles: readonly CapabilityBundle[];
  readonly diagnostics: readonly Diagnostic[];
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
    bundle.dependencies.forEach((dependency, index) =>
      visit(dependency, `${pointer}/dependencies/${index}`),
    );
    visiting.delete(key);
    selected.set(key, bundle);
  };
  requested.forEach((reference, index) => visit(reference, `/requestedBundles/${index}`));

  for (const bundle of selected.values()) {
    const declared = new Set([
      ...bundle.artifacts,
      ...bundle.fixtures,
      ...bundle.goldens,
    ]);
    for (const [category, paths] of [
      ["ARTIFACT", bundle.artifacts],
      ["FIXTURE", bundle.fixtures],
      ["GOLDEN", bundle.goldens],
    ] as const) {
      paths.forEach((path) => {
        const entry = entryByPath.get(path);
        if (entry === undefined) {
          diagnostics.add(
            `E_BUNDLE_${category}_MISSING`,
            `/bundles/${bundle.id}/${path}`,
            `${category.toLowerCase()} path is absent from the release`,
          );
        } else if (entry.bundleId !== bundle.id) {
          diagnostics.add(
            "E_BUNDLE_OWNERSHIP",
            `/entries/${path}/bundleId`,
            `entry is not owned by ${bundle.id}`,
          );
        }
      });
    }
    bundle.modes.forEach((mode) => {
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
    });
  }

  const bundles = [...selected.values()].sort((left, right) =>
    referenceKey(left) < referenceKey(right) ? -1 : 1,
  );
  return { bundles, diagnostics: diagnostics.sorted() };
}
