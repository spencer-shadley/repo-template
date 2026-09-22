/**
 * Generate dependency-free repository-shape wire validators from the published
 * JSON Schemas (repo-template#355). Schema bytes are the sole maintained
 * structural authority; this tool emits a Diagnostics adapter and refuses drift.
 *
 * Usage:
 *   node --experimental-strip-types tools/generate-repository-shape-validators.ts write
 *   node --experimental-strip-types tools/generate-repository-shape-validators.ts check
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profileSchemaPath = path.join(
  root,
  "contracts/repository-shape/v1/repository-shape.schema.json",
);
const turboSchemaPath = path.join(
  root,
  "contracts/repository-shape/v1/turbo.schema.json",
);
const outPath = path.join(
  root,
  "packages/adoption-shell/src/repository-shape/validators.generated.ts",
);

type JsonSchema = {
  readonly $id?: string;
  readonly title?: string;
  readonly type?: string;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly required?: readonly string[];
  readonly properties?: Record<string, JsonSchema>;
  readonly const?: string;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly enum?: readonly string[];
  readonly uniqueItems?: boolean;
  readonly items?: JsonSchema;
  readonly $ref?: string;
  readonly $defs?: Record<string, JsonSchema>;
};

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readSchema(filePath: string): { schema: JsonSchema; digest: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  const digest = sha256Hex(Buffer.from(raw, "utf8"));
  const schema = JSON.parse(raw) as JsonSchema;
  return { schema, digest };
}

function lit(value: string): string {
  return JSON.stringify(value);
}

function renderGeneratedFile(
  profile: { schema: JsonSchema; digest: string },
  turbo: { schema: JsonSchema; digest: string },
): string {
  const props = profile.schema.properties ?? {};
  const required = profile.schema.required ?? [];
  const allowed = ["$schema", ...Object.keys(props)];
  const profileIdSchema = props["profileId"] ?? {};
  const rootsSchema = props["rootFamilies"] ?? {};
  const rootItems = rootsSchema.items ?? {};
  const rootEnum = rootItems.enum ?? [];
  const scriptsSchema = props["declaredScripts"] ?? {};
  const scriptItems = scriptsSchema.items ?? {};
  const schemaIdConst = String(props["schemaId"]?.const ?? "");
  const schemaVersionConst = String(props["schemaVersion"]?.const ?? "");
  const contractIdConst = String(props["contractId"]?.const ?? "");
  const profileMin = Number(profileIdSchema.minLength ?? 1);
  const profileMax = Number(profileIdSchema.maxLength ?? 80);
  const profilePattern = profileIdSchema.pattern ?? "^.*$";
  const scriptPattern = scriptItems.pattern ?? "^.*$";

  const taskDef = (turbo.schema.$defs ?? {})["taskDefinition"] ?? {};
  const taskProps = Object.keys(taskDef.properties ?? {});

  return `/**
 * GENERATED FILE — do not edit by hand.
 * Source schemas:
 *   contracts/repository-shape/v1/repository-shape.schema.json (sha256:${profile.digest})
 *   contracts/repository-shape/v1/turbo.schema.json (sha256:${turbo.digest})
 * Regenerate: pnpm generate:repository-shape-validators
 */
import { Diagnostics, escapePointer, isRecord } from "../validation-helpers.ts";

export const REPOSITORY_SHAPE_PROFILE_SCHEMA_DIGEST =
  ${lit(profile.digest)} as const;

export const TURBO_TASK_GRAPH_SCHEMA_DIGEST =
  ${lit(turbo.digest)} as const;

export function validateRepositoryShapeProfileWire(
  value: unknown,
  diagnostics: Diagnostics,
): boolean {
  if (!isRecord(value)) {
    diagnostics.add("E_TYPE", "", "expected object");
    return false;
  }

  const allowed = new Set<string>(${JSON.stringify(allowed)});
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      diagnostics.add(
        "E_UNKNOWN_PROPERTY",
        \`/\${escapePointer(key)}\`,
        "unknown property",
      );
    }
  }

  for (const key of ${JSON.stringify(required)} as readonly string[]) {
    if (!Object.hasOwn(value, key)) {
      diagnostics.add(
        "E_REQUIRED",
        \`/\${escapePointer(key)}\`,
        "required property is missing",
      );
    }
  }

  if (Object.hasOwn(value, "$schema") && typeof value["$schema"] !== "string") {
    diagnostics.add("E_TYPE", "/$schema", "expected string");
  }

  if (Object.hasOwn(value, "schemaId") && value["schemaId"] !== ${lit(schemaIdConst)}) {
    diagnostics.add(
      "E_CONST",
      "/schemaId",
      ${lit("must equal " + lit(schemaIdConst))},
    );
  }

  if (
    Object.hasOwn(value, "schemaVersion") &&
    value["schemaVersion"] !== ${lit(schemaVersionConst)}
  ) {
    diagnostics.add(
      "E_CONST",
      "/schemaVersion",
      ${lit("must equal " + lit(schemaVersionConst))},
    );
  }

  if (
    Object.hasOwn(value, "contractId") &&
    value["contractId"] !== ${lit(contractIdConst)}
  ) {
    diagnostics.add(
      "E_CONST",
      "/contractId",
      ${lit("must equal " + lit(contractIdConst))},
    );
  }

  const profileId = value["profileId"];
  if (Object.hasOwn(value, "profileId")) {
    if (typeof profileId !== "string") {
      diagnostics.add("E_TYPE", "/profileId", "expected string");
    } else {
      if (profileId.length < ${profileMin}) {
        diagnostics.add(
          "E_LENGTH",
          "/profileId",
          "must contain at least ${profileMin} characters",
        );
      }
      if (profileId.length > ${profileMax}) {
        diagnostics.add(
          "E_LENGTH",
          "/profileId",
          "must contain at most ${profileMax} characters",
        );
      }
      if (!/${profilePattern}/.test(profileId)) {
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
      const allowedRoots = new Set<string>(${JSON.stringify(rootEnum)});
      const seenRoots = new Set<string>();
      for (const [idx, root] of rootsVal.entries()) {
        const pointer = \`/rootFamilies/\${String(idx)}\`;
        if (typeof root !== "string" || !allowedRoots.has(root)) {
          diagnostics.add(
            "E_INVALID_ROOT",
            pointer,
            \`invalid root family: \${String(root)}\`,
          );
        } else if (seenRoots.has(root)) {
          diagnostics.add(
            "E_DUPLICATE_ROOT",
            pointer,
            \`duplicate root family: \${root}\`,
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
      const scriptPattern = /${scriptPattern}/;
      for (const [idx, script] of scriptsVal.entries()) {
        const pointer = \`/declaredScripts/\${String(idx)}\`;
        if (typeof script !== "string" || !scriptPattern.test(script)) {
          diagnostics.add(
            "E_INVALID_SCRIPT",
            pointer,
            \`invalid script: \${String(script)}\`,
          );
        } else if (seenScripts.has(script)) {
          diagnostics.add(
            "E_DUPLICATE_SCRIPT",
            pointer,
            \`duplicate declared script: \${script}\`,
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
        \`/\${escapePointer(key)}\`,
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
      const taskPointer = \`/tasks/\${escapePointer(taskName)}\`;
      if (!isRecord(taskDefinition)) {
        diagnostics.add("E_TYPE", taskPointer, "expected object");
        continue;
      }
      const allowedTaskKeys = new Set<string>(${JSON.stringify(taskProps)});
      for (const key of Object.keys(taskDefinition)) {
        if (!allowedTaskKeys.has(key)) {
          diagnostics.add(
            "E_UNKNOWN_PROPERTY",
            \`\${taskPointer}/\${escapePointer(key)}\`,
            "unknown property",
          );
        }
      }
      if (Object.hasOwn(taskDefinition, "dependsOn")) {
        const dependsOn = taskDefinition["dependsOn"];
        if (!Array.isArray(dependsOn)) {
          diagnostics.add("E_TYPE", \`\${taskPointer}/dependsOn\`, "expected array");
        } else {
          for (const [idx, dep] of dependsOn.entries()) {
            if (typeof dep !== "string") {
              diagnostics.add(
                "E_TYPE",
                \`\${taskPointer}/dependsOn/\${String(idx)}\`,
                "expected string",
              );
            }
          }
        }
      }
      if (Object.hasOwn(taskDefinition, "outputs")) {
        const outputs = taskDefinition["outputs"];
        if (!Array.isArray(outputs)) {
          diagnostics.add("E_TYPE", \`\${taskPointer}/outputs\`, "expected array");
        } else {
          for (const [idx, out] of outputs.entries()) {
            if (typeof out !== "string") {
              diagnostics.add(
                "E_TYPE",
                \`\${taskPointer}/outputs/\${String(idx)}\`,
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
        diagnostics.add("E_TYPE", \`\${taskPointer}/cache\`, "expected boolean");
      }
      if (
        Object.hasOwn(taskDefinition, "persistent") &&
        typeof taskDefinition["persistent"] !== "boolean"
      ) {
        diagnostics.add("E_TYPE", \`\${taskPointer}/persistent\`, "expected boolean");
      }
      if (Object.hasOwn(taskDefinition, "inputs")) {
        const inputs = taskDefinition["inputs"];
        if (!Array.isArray(inputs)) {
          diagnostics.add("E_TYPE", \`\${taskPointer}/inputs\`, "expected array");
        } else {
          for (const [idx, input] of inputs.entries()) {
            if (typeof input !== "string") {
              diagnostics.add(
                "E_TYPE",
                \`\${taskPointer}/inputs/\${String(idx)}\`,
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
`;
}

function main(argv: readonly string[]): void {
  const mode = argv[0] ?? "check";
  if (mode !== "write" && mode !== "check") {
    throw new Error(
      `usage: generate-repository-shape-validators.ts write|check (got ${mode})`,
    );
  }
  const next = renderGeneratedFile(
    readSchema(profileSchemaPath),
    readSchema(turboSchemaPath),
  );
  if (mode === "write") {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, next, "utf8");
    process.stdout.write(`wrote ${path.relative(root, outPath)}\n`);
    return;
  }
  if (!fs.existsSync(outPath)) {
    throw new Error(`missing generated validators: ${path.relative(root, outPath)}`);
  }
  const current = fs.readFileSync(outPath, "utf8");
  if (current !== next) {
    throw new Error(
      "repository-shape generated validators are stale; run pnpm generate:repository-shape-validators",
    );
  }
  process.stdout.write("repository-shape generated validators match schemas\n");
}

main(process.argv.slice(2));
