import {
  ENVELOPE_DIGEST_ALGORITHM,
  type CapabilityBundle,
  type Diagnostic,
  type PayloadEntry,
  type ValidationResult,
} from "./contract.ts";
import { sha256Bytes, sha256CanonicalJson } from "./digest.ts";
import {
  BUNDLE_ID_PATTERN,
  Diagnostics,
  SEMVER_PATTERN,
  compareStrings,
  isRecord,
} from "./validation-helpers.ts";

export const REPOSITORY_SHAPE_CONTRACT_ID =
  "repo-template/repository-shape/v1" as const;
export const REPOSITORY_SHAPE_SCHEMA_VERSION = "1.0.0" as const;
export const REPOSITORY_SHAPE_SCHEMA_ID =
  "https://schemas.repo-template.dev/repository-shape/v1/repository-shape.schema.json" as const;
export const TURBO_SCHEMA_ID =
  "https://turbo.build/schema.json" as const;
export const REPOSITORY_SHAPE_BUNDLE_ID =
  "repo-template/repository-shape" as const;
export const REPOSITORY_SHAPE_BUNDLE_VERSION = "1.0.0" as const;

export const PORTABLE_ROOT_FAMILIES = [
  "apps",
  "services",
  "native",
  "tools",
  "packages",
  "database",
  "infrastructure",
] as const;

export type PortableRootFamily = (typeof PORTABLE_ROOT_FAMILIES)[number];

export const CORE_PRODUCT_ROOT_FAMILIES = [
  "apps",
  "services",
  "tools",
  "packages",
] as const;

export const OPTIONAL_ROOT_FAMILIES = [
  "native",
  "database",
  "infrastructure",
] as const;

export const CANONICAL_TURBO_TASKS = [
  "build",
  "test",
  "lint",
  "verify",
] as const;

export type CanonicalTurboTask = (typeof CANONICAL_TURBO_TASKS)[number];

export interface TurboTaskDefinition {
  readonly dependsOn?: readonly string[];
  readonly outputs?: readonly string[];
  readonly cache?: boolean;
  readonly inputs?: readonly string[];
  readonly persistent?: boolean;
}

export interface TurboTaskGraph {
  readonly $schema?: string;
  readonly tasks: Readonly<Record<string, TurboTaskDefinition>>;
}

export interface RepositoryProfile {
  readonly profileId: string;
  readonly monorepo: boolean;
  readonly rootFamilies: readonly PortableRootFamily[];
  readonly declaredScripts: readonly string[] | Readonly<Record<string, string>>;
}

export const FULL_STACK_PROFILE: RepositoryProfile = Object.freeze({
  profileId: "full-stack",
  monorepo: true,
  rootFamilies: Object.freeze([
    "apps",
    "services",
    "tools",
    "packages",
    "database",
    "infrastructure",
  ] as const),
  declaredScripts: Object.freeze(["build", "lint", "test", "verify"]),
});

export const SERVICE_PROFILE: RepositoryProfile = Object.freeze({
  profileId: "service",
  monorepo: true,
  rootFamilies: Object.freeze([
    "services",
    "tools",
    "packages",
    "database",
    "infrastructure",
  ] as const),
  declaredScripts: Object.freeze(["build", "lint", "test", "verify"]),
});

export const LIBRARY_PROFILE: RepositoryProfile = Object.freeze({
  profileId: "library",
  monorepo: true,
  rootFamilies: Object.freeze(["packages", "tools"] as const),
  declaredScripts: Object.freeze(["build", "lint", "test", "verify"]),
});

export const STANDALONE_PROFILE: RepositoryProfile = Object.freeze({
  profileId: "standalone",
  monorepo: false,
  rootFamilies: Object.freeze([]),
  declaredScripts: Object.freeze(["lint", "verify"]),
});

const EMPTY_GITKEEP_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function composeTurboTaskGraph(
  declaredScripts: readonly string[] | Readonly<Record<string, string>>,
): TurboTaskGraph {
  const scriptList = Array.isArray(declaredScripts)
    ? declaredScripts
    : isRecord(declaredScripts)
      ? Object.keys(declaredScripts)
      : [];
  const declaredSet = new Set(scriptList);

  const tasks: Record<string, TurboTaskDefinition> = {};

  const hasBuild = declaredSet.has("build");
  const hasLint = declaredSet.has("lint");
  const hasTest = declaredSet.has("test");
  const hasVerify = declaredSet.has("verify");

  if (hasBuild) {
    tasks["build"] = {
      dependsOn: ["^build"],
      outputs: ["dist/**"],
    };
  }

  if (hasLint) {
    tasks["lint"] = {
      dependsOn: [],
    };
  }

  if (hasTest) {
    tasks["test"] = {
      dependsOn: hasBuild ? ["^build"] : [],
    };
  }

  if (hasVerify) {
    const verifyDeps: string[] = [];
    if (hasBuild) verifyDeps.push("build");
    if (hasLint) verifyDeps.push("lint");
    if (hasTest) verifyDeps.push("test");
    tasks["verify"] = {
      dependsOn: verifyDeps.sort(compareStrings),
    };
  }

  for (const script of scriptList) {
    if (
      !Object.hasOwn(tasks, script) &&
      !CANONICAL_TURBO_TASKS.includes(script as CanonicalTurboTask) &&
      /^[a-zA-Z0-9_:-]+$/.test(script)
    ) {
      tasks[script] = {
        dependsOn: [],
      };
    }
  }

  const sortedTasks: Record<string, TurboTaskDefinition> = {};
  for (const key of Object.keys(tasks).sort(compareStrings)) {
    const def = tasks[key];
    if (def !== undefined) {
      sortedTasks[key] = def;
    }
  }

  return {
    $schema: TURBO_SCHEMA_ID,
    tasks: sortedTasks,
  };
}

export function createTurboJsonContent(
  declaredScripts: readonly string[] | Readonly<Record<string, string>>,
): string {
  const taskGraph = composeTurboTaskGraph(declaredScripts);
  return `${JSON.stringify(taskGraph, null, 2)}\n`;
}

export function resolveRepositoryShapeRoots(
  profile: RepositoryProfile,
): readonly PortableRootFamily[] {
  if (!profile.monorepo) {
    return Object.freeze([]);
  }
  const roots = new Set<PortableRootFamily>();
  for (const family of profile.rootFamilies) {
    if (PORTABLE_ROOT_FAMILIES.includes(family)) {
      roots.add(family);
    }
  }
  return Object.freeze([...roots].sort(compareStrings));
}

export function createRepositorySkeletonEntries(
  rootFamilies: readonly PortableRootFamily[],
  bundleId: string | null = null,
): readonly PayloadEntry[] {
  const sortedFamilies = [...new Set(rootFamilies)].sort(compareStrings);
  const entries: PayloadEntry[] = [];
  for (const family of sortedFamilies) {
    entries.push(
      Object.freeze({
        path: `${family}/.gitkeep`,
        kind: "file",
        mode: "100644",
        contentSha256: EMPTY_GITKEEP_SHA256,
        role: "capability-config",
        encoding: "utf-8",
        bundleId,
        contentBase64: "",
      }),
    );
  }
  return Object.freeze(entries);
}

export function createTurboJsonPayloadEntry(
  declaredScripts: readonly string[] | Readonly<Record<string, string>>,
  bundleId: string | null = null,
): PayloadEntry {
  const content = createTurboJsonContent(declaredScripts);
  const bytes = Buffer.from(content, "utf8");
  return Object.freeze({
    path: "turbo.json",
    kind: "file",
    mode: "100644",
    contentSha256: sha256Bytes(bytes),
    role: "capability-config",
    encoding: "utf-8",
    bundleId,
    contentBase64: Buffer.from(bytes).toString("base64"),
  });
}

export function materializeRepositoryShapeEntries(
  profile: RepositoryProfile,
  bundleId: string | null = null,
): readonly PayloadEntry[] {
  if (!profile.monorepo) {
    return Object.freeze([]);
  }
  const roots = resolveRepositoryShapeRoots(profile);
  const skeletonEntries = createRepositorySkeletonEntries(roots, bundleId);
  const turboEntry = createTurboJsonPayloadEntry(profile.declaredScripts, bundleId);
  return Object.freeze(
    [...skeletonEntries, turboEntry].sort((left, right) =>
      compareStrings(left.path, right.path),
    ),
  );
}

export function createRepositoryShapeBundle(
  profile: RepositoryProfile,
  options?: Readonly<{
    id?: string;
    version?: string;
  }>,
): CapabilityBundle {
  const bundleId = options?.id ?? REPOSITORY_SHAPE_BUNDLE_ID;
  const version = options?.version ?? REPOSITORY_SHAPE_BUNDLE_VERSION;
  const roots = resolveRepositoryShapeRoots(profile);
  const artifacts: string[] = roots.map((root) => `${root}/.gitkeep`);
  if (profile.monorepo) {
    artifacts.push("turbo.json");
  }
  artifacts.sort(compareStrings);

  const bundleBody = {
    id: bundleId,
    version,
    digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
    dependencies: [],
    artifacts,
    fixtures: [],
    goldens: [],
    modes: [
      {
        id: "task-graph",
        entrypoint: "turbo.json",
        requiredPaths: artifacts,
      },
    ],
  };

  return Object.freeze({
    ...bundleBody,
    digest: sha256CanonicalJson(bundleBody),
  });
}

function finish<T>(
  value: T | undefined,
  diagnostics: Diagnostics,
): ValidationResult<T> {
  const rows = diagnostics.sorted();
  return rows.length === 0 && value !== undefined
    ? { ok: true, value }
    : { ok: false, diagnostics: rows };
}

export function validateTurboTaskGraph(
  value: unknown,
): ValidationResult<TurboTaskGraph> {
  const diagnostics = new Diagnostics();
  if (!diagnostics.object(value, "", ["$schema", "tasks"], ["tasks"])) {
    return finish<TurboTaskGraph>(undefined, diagnostics);
  }
  const rec = value;
  if (rec["$schema"] !== undefined) {
    diagnostics.string(rec["$schema"], "/$schema", { min: 1, max: 200 });
  }
  const tasksVal = rec["tasks"];
  if (!isRecord(tasksVal)) {
    diagnostics.add("E_TYPE", "/tasks", "tasks must be an object");
    return finish<TurboTaskGraph>(undefined, diagnostics);
  }
  for (const [taskName, taskDef] of Object.entries(tasksVal)) {
    const taskPointer = `/tasks/${taskName}`;
    if (
      !diagnostics.object(
        taskDef,
        taskPointer,
        ["dependsOn", "outputs", "cache", "inputs", "persistent"],
        [],
      )
    ) {
      continue;
    }
    const defRec = taskDef;
    if (defRec["dependsOn"] !== undefined) {
      if (!Array.isArray(defRec["dependsOn"])) {
        diagnostics.add("E_TYPE", `${taskPointer}/dependsOn`, "expected array");
      } else {
        for (const [idx, dep] of defRec["dependsOn"].entries()) {
          if (typeof dep !== "string") {
            diagnostics.add(
              "E_TYPE",
              `${taskPointer}/dependsOn/${String(idx)}`,
              "expected string",
            );
          }
        }
      }
    }
    if (defRec["outputs"] !== undefined) {
      if (!Array.isArray(defRec["outputs"])) {
        diagnostics.add("E_TYPE", `${taskPointer}/outputs`, "expected array");
      } else {
        for (const [idx, out] of defRec["outputs"].entries()) {
          if (typeof out !== "string") {
            diagnostics.add(
              "E_TYPE",
              `${taskPointer}/outputs/${String(idx)}`,
              "expected string",
            );
          }
        }
      }
    }
  }

  return finish<TurboTaskGraph>(
    diagnostics.rows.length === 0 ? (value as unknown as TurboTaskGraph) : undefined,
    diagnostics,
  );
}

export function validateRepositoryProfile(
  value: unknown,
): ValidationResult<RepositoryProfile> {
  const diagnostics = new Diagnostics();
  const fields = [
    "schemaId",
    "schemaVersion",
    "contractId",
    "profileId",
    "monorepo",
    "rootFamilies",
    "declaredScripts",
  ];
  if (!isRecord(value)) {
    diagnostics.add("E_TYPE", "", "expected object");
    return finish<RepositoryProfile>(undefined, diagnostics);
  }

  const allowedFields = ["$schema", ...fields];
  for (const key of Object.keys(value)) {
    if (!allowedFields.includes(key)) {
      diagnostics.add("E_UNKNOWN_PROPERTY", `/${key}`, "unknown property");
    }
  }

  const profileId = value["profileId"];
  if (typeof profileId !== "string" || profileId.trim() === "") {
    diagnostics.add("E_REQUIRED", "/profileId", "profileId is required");
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profileId)) {
    diagnostics.add("E_INVALID_FORMAT", "/profileId", "invalid profileId format");
  }

  const monorepo = value["monorepo"];
  if (typeof monorepo !== "boolean") {
    diagnostics.add("E_TYPE", "/monorepo", "monorepo must be a boolean");
  }

  const rootsVal = value["rootFamilies"];
  if (!Array.isArray(rootsVal)) {
    diagnostics.add("E_TYPE", "/rootFamilies", "rootFamilies must be an array");
  } else {
    const seenRoots = new Set<string>();
    for (const [idx, root] of rootsVal.entries()) {
      if (typeof root !== "string" || !PORTABLE_ROOT_FAMILIES.includes(root as PortableRootFamily)) {
        diagnostics.add(
          "E_INVALID_ROOT",
          `/rootFamilies/${String(idx)}`,
          `invalid root family: ${String(root)}`,
        );
      } else if (seenRoots.has(root)) {
        diagnostics.add(
          "E_DUPLICATE_ROOT",
          `/rootFamilies/${String(idx)}`,
          `duplicate root family: ${root}`,
        );
      } else {
        seenRoots.add(root);
      }
    }
  }

  const scriptsVal = value["declaredScripts"];
  if (!Array.isArray(scriptsVal) && !isRecord(scriptsVal)) {
    diagnostics.add(
      "E_TYPE",
      "/declaredScripts",
      "declaredScripts must be an array or object",
    );
  } else if (Array.isArray(scriptsVal)) {
    const seenScripts = new Set<string>();
    for (const [idx, script] of scriptsVal.entries()) {
      if (typeof script !== "string" || !/^[a-zA-Z0-9_:-]+$/.test(script)) {
        diagnostics.add(
          "E_INVALID_SCRIPT",
          `/declaredScripts/${String(idx)}`,
          `invalid script: ${String(script)}`,
        );
      } else if (seenScripts.has(script)) {
        diagnostics.add(
          "E_DUPLICATE_SCRIPT",
          `/declaredScripts/${String(idx)}`,
          `duplicate declared script: ${script}`,
        );
      } else {
        seenScripts.add(script);
      }
    }
  }

  return finish<RepositoryProfile>(
    diagnostics.rows.length === 0 ? (value as unknown as RepositoryProfile) : undefined,
    diagnostics,
  );
}
