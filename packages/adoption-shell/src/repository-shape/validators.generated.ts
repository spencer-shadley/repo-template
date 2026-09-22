/**
 * GENERATED FILE — do not edit by hand.
 * Source schemas:
 *   contracts/repository-shape/v1/repository-shape.schema.json (sha256:0c349cb61509427ead06280d57c3bbfea7d6010e42e27bf653e4ddd2a37772ed)
 *   contracts/repository-shape/v1/turbo.schema.json (sha256:4870a7cc7642fd2856ca7eac45424b59140ff6f2248f5af74f5ada1490e9778c)
 * Regenerate: pnpm generate:repository-shape-validators
 */
import { Diagnostics, escapePointer, isRecord } from "../validation-helpers.ts";

export const REPOSITORY_SHAPE_PROFILE_SCHEMA_DIGEST =
  "0c349cb61509427ead06280d57c3bbfea7d6010e42e27bf653e4ddd2a37772ed" as const;

export const TURBO_TASK_GRAPH_SCHEMA_DIGEST =
  "4870a7cc7642fd2856ca7eac45424b59140ff6f2248f5af74f5ada1490e9778c" as const;

export function validateRepositoryShapeProfileWire(
  value: unknown,
  diagnostics: Diagnostics,
): boolean {
  if (!isRecord(value)) {
    diagnostics.add("E_TYPE", "", "expected object");
    return false;
  }

  const allowed = new Set<string>(["$schema","$schema","schemaId","schemaVersion","contractId","profileId","monorepo","rootFamilies","declaredScripts"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      diagnostics.add(
        "E_UNKNOWN_PROPERTY",
        `/${escapePointer(key)}`,
        "unknown property",
      );
    }
  }

  for (const key of ["schemaId","schemaVersion","contractId","profileId","monorepo","rootFamilies","declaredScripts"] as readonly string[]) {
    if (!Object.hasOwn(value, key)) {
      diagnostics.add(
        "E_REQUIRED",
        `/${escapePointer(key)}`,
        "required property is missing",
      );
    }
  }

  if (Object.hasOwn(value, "$schema") && typeof value["$schema"] !== "string") {
    diagnostics.add("E_TYPE", "/$schema", "expected string");
  }

  if (Object.hasOwn(value, "schemaId") && value["schemaId"] !== "https://schemas.repo-template.dev/repository-shape/v1/repository-shape.schema.json") {
    diagnostics.add(
      "E_CONST",
      "/schemaId",
      "must equal \"https://schemas.repo-template.dev/repository-shape/v1/repository-shape.schema.json\"",
    );
  }

  if (
    Object.hasOwn(value, "schemaVersion") &&
    value["schemaVersion"] !== "1.0.0"
  ) {
    diagnostics.add(
      "E_CONST",
      "/schemaVersion",
      "must equal \"1.0.0\"",
    );
  }

  if (
    Object.hasOwn(value, "contractId") &&
    value["contractId"] !== "repo-template/repository-shape/v1"
  ) {
    diagnostics.add(
      "E_CONST",
      "/contractId",
      "must equal \"repo-template/repository-shape/v1\"",
    );
  }

  const profileId = value["profileId"];
  if (Object.hasOwn(value, "profileId")) {
    if (typeof profileId !== "string") {
      diagnostics.add("E_TYPE", "/profileId", "expected string");
    } else {
      if (profileId.length < 1) {
        diagnostics.add(
          "E_LENGTH",
          "/profileId",
          "must contain at least 1 characters",
        );
      }
      if (profileId.length > 80) {
        diagnostics.add(
          "E_LENGTH",
          "/profileId",
          "must contain at most 80 characters",
        );
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profileId)) {
        diagnostics.add(
          "E_FORMAT",
          "/profileId",
          "string does not match the required format",
        );
      }
    }
  }

  if (Object.hasOwn(value, "monorepo") && typeof value["monorepo"] !== "boolean") {
    diagnostics.add("E_TYPE", "/monorepo", "monorepo must be a boolean");
  }

  const rootsVal = value["rootFamilies"];
  if (Object.hasOwn(value, "rootFamilies")) {
    if (!Array.isArray(rootsVal)) {
      diagnostics.add("E_TYPE", "/rootFamilies", "rootFamilies must be an array");
    } else {
      const allowedRoots = new Set<string>(["apps","services","native","tools","packages","database","infrastructure"]);
      const seenRoots = new Set<string>();
      for (const [idx, root] of rootsVal.entries()) {
        const pointer = `/rootFamilies/${String(idx)}`;
        if (typeof root !== "string" || !allowedRoots.has(root)) {
          diagnostics.add(
            "E_INVALID_ROOT",
            pointer,
            `invalid root family: ${String(root)}`,
          );
        } else if (seenRoots.has(root)) {
          diagnostics.add(
            "E_DUPLICATE_ROOT",
            pointer,
            `duplicate root family: ${root}`,
          );
        } else {
          seenRoots.add(root);
        }
      }
    }
  }

  const scriptsVal = value["declaredScripts"];
  if (Object.hasOwn(value, "declaredScripts")) {
    if (!Array.isArray(scriptsVal)) {
      diagnostics.add(
        "E_TYPE",
        "/declaredScripts",
        "declaredScripts must be an array",
      );
    } else {
      const seenScripts = new Set<string>();
      const scriptPattern = /^[a-zA-Z0-9_:-]+$/;
      for (const [idx, script] of scriptsVal.entries()) {
        const pointer = `/declaredScripts/${String(idx)}`;
        if (typeof script !== "string" || !scriptPattern.test(script)) {
          diagnostics.add(
            "E_INVALID_SCRIPT",
            pointer,
            `invalid script: ${String(script)}`,
          );
        } else if (seenScripts.has(script)) {
          diagnostics.add(
            "E_DUPLICATE_SCRIPT",
            pointer,
            `duplicate declared script: ${script}`,
          );
        } else {
          seenScripts.add(script);
        }
      }
    }
  }

  return diagnostics.rows.length === 0;
}

export function validateTurboTaskGraphWire(
  value: unknown,
  diagnostics: Diagnostics,
): boolean {
  if (!isRecord(value)) {
    diagnostics.add("E_TYPE", "", "expected object");
    return false;
  }

  const allowed = new Set<string>(["$schema", "tasks"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      diagnostics.add(
        "E_UNKNOWN_PROPERTY",
        `/${escapePointer(key)}`,
        "unknown property",
      );
    }
  }

  if (!Object.hasOwn(value, "tasks")) {
    diagnostics.add("E_REQUIRED", "/tasks", "required property is missing");
  }

  if (Object.hasOwn(value, "$schema") && typeof value["$schema"] !== "string") {
    diagnostics.add("E_TYPE", "/$schema", "expected string");
  }

  const tasksVal = value["tasks"];
  if (Object.hasOwn(value, "tasks")) {
    if (!isRecord(tasksVal)) {
      diagnostics.add("E_TYPE", "/tasks", "tasks must be an object");
      return diagnostics.rows.length === 0;
    }
    for (const [taskName, taskDefinition] of Object.entries(tasksVal)) {
      const taskPointer = `/tasks/${escapePointer(taskName)}`;
      if (!isRecord(taskDefinition)) {
        diagnostics.add("E_TYPE", taskPointer, "expected object");
        continue;
      }
      const allowedTaskKeys = new Set<string>(["dependsOn","outputs","cache","inputs","persistent"]);
      for (const key of Object.keys(taskDefinition)) {
        if (!allowedTaskKeys.has(key)) {
          diagnostics.add(
            "E_UNKNOWN_PROPERTY",
            `${taskPointer}/${escapePointer(key)}`,
            "unknown property",
          );
        }
      }
      if (Object.hasOwn(taskDefinition, "dependsOn")) {
        const dependsOn = taskDefinition["dependsOn"];
        if (!Array.isArray(dependsOn)) {
          diagnostics.add("E_TYPE", `${taskPointer}/dependsOn`, "expected array");
        } else {
          for (const [idx, dep] of dependsOn.entries()) {
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
      if (Object.hasOwn(taskDefinition, "outputs")) {
        const outputs = taskDefinition["outputs"];
        if (!Array.isArray(outputs)) {
          diagnostics.add("E_TYPE", `${taskPointer}/outputs`, "expected array");
        } else {
          for (const [idx, out] of outputs.entries()) {
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
      if (
        Object.hasOwn(taskDefinition, "cache") &&
        typeof taskDefinition["cache"] !== "boolean"
      ) {
        diagnostics.add("E_TYPE", `${taskPointer}/cache`, "expected boolean");
      }
      if (
        Object.hasOwn(taskDefinition, "persistent") &&
        typeof taskDefinition["persistent"] !== "boolean"
      ) {
        diagnostics.add("E_TYPE", `${taskPointer}/persistent`, "expected boolean");
      }
      if (Object.hasOwn(taskDefinition, "inputs")) {
        const inputs = taskDefinition["inputs"];
        if (!Array.isArray(inputs)) {
          diagnostics.add("E_TYPE", `${taskPointer}/inputs`, "expected array");
        } else {
          for (const [idx, input] of inputs.entries()) {
            if (typeof input !== "string") {
              diagnostics.add(
                "E_TYPE",
                `${taskPointer}/inputs/${String(idx)}`,
                "expected string",
              );
            }
          }
        }
      }
    }
  }

  return diagnostics.rows.length === 0;
}
