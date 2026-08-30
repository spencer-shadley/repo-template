/**
 * Keep typescript-eslint on the TypeScript 6 JS API while project builds use
 * the native TypeScript 7 compiler. Remove when typescript-eslint supports
 * TypeScript 7's compiler package directly.
 */
import Module, { createRequire } from "node:module";

export type { CompilerOptions as TypeScript6CompilerOptions } from "typescript6";

const localRequire = createRequire(import.meta.url);
const typescript6Main = localRequire.resolve("typescript6");

interface ModuleWithResolve {
  _resolveFilename(
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown,
  ): string;
}

function hasResolveFilename(
  value: object,
): value is typeof Module & ModuleWithResolve {
  return typeof Reflect.get(value, "_resolveFilename") === "function";
}

if (!hasResolveFilename(Module)) {
  throw new Error("Node module loader does not expose _resolveFilename");
}

const moduleType = Module;
const originalResolveFilename = moduleType._resolveFilename.bind(moduleType);

moduleType._resolveFilename = function resolveFilenamePatched(
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown,
): string {
  if (request === "typescript") {
    return typescript6Main;
  }
  if (request.startsWith("typescript/")) {
    return originalResolveFilename(
      `typescript6/${request.slice("typescript/".length)}`,
      parent,
      isMain,
      options,
    );
  }
  return originalResolveFilename(request, parent, isMain, options);
};
