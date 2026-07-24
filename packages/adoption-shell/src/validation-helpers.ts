import type { Diagnostic } from "./contract.js";

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export const BUNDLE_ID_PATTERN =
  /^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export class Diagnostics {
  readonly rows: Diagnostic[] = [];

  add(code: string, pointer: string, message: string): void {
    this.rows.push({ code, pointer, message });
  }

  object(
    value: unknown,
    pointer: string,
    allowed: readonly string[],
    required: readonly string[],
  ): value is Record<string, unknown> {
    if (!isRecord(value)) {
      this.add("E_TYPE", pointer, "expected object");
      return false;
    }
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(value)) {
      if (!allowedSet.has(key)) {
        this.add(
          "E_UNKNOWN_PROPERTY",
          `${pointer}/${escapePointer(key)}`,
          "unknown property",
        );
      }
    }
    for (const key of required) {
      if (!Object.hasOwn(value, key)) {
        this.add(
          "E_REQUIRED",
          `${pointer}/${escapePointer(key)}`,
          "required property is missing",
        );
      }
    }
    return true;
  }

  string(
    value: unknown,
    pointer: string,
    options: Readonly<{
      min?: number;
      max?: number;
      pattern?: RegExp;
      constant?: string;
    }> = {},
  ): value is string {
    if (typeof value !== "string") {
      this.add("E_TYPE", pointer, "expected string");
      return false;
    }
    if (options.min !== undefined && value.length < options.min) {
      this.add("E_LENGTH", pointer, `must contain at least ${options.min} characters`);
    }
    if (options.max !== undefined && value.length > options.max) {
      this.add("E_LENGTH", pointer, `must contain at most ${options.max} characters`);
    }
    if (options.pattern !== undefined && !options.pattern.test(value)) {
      this.add("E_FORMAT", pointer, "string does not match the required format");
    }
    if (options.constant !== undefined && value !== options.constant) {
      this.add("E_CONST", pointer, `must equal ${JSON.stringify(options.constant)}`);
    }
    return true;
  }

  sha(value: unknown, pointer: string): value is string {
    if (!this.string(value, pointer)) return false;
    if (!SHA256_PATTERN.test(value)) {
      this.add("E_SHA256", pointer, "must be lowercase SHA-256 hex");
      return false;
    }
    return true;
  }

  array(
    value: unknown,
    pointer: string,
    min = 0,
    max = 4096,
  ): value is unknown[] {
    if (!Array.isArray(value)) {
      this.add("E_TYPE", pointer, "expected array");
      return false;
    }
    if (value.length < min || value.length > max) {
      this.add("E_COUNT", pointer, `array length must be between ${min} and ${max}`);
    }
    return true;
  }

  sorted(): readonly Diagnostic[] {
    return [...this.rows].sort((left, right) => {
      if (left.pointer !== right.pointer) return left.pointer < right.pointer ? -1 : 1;
      if (left.code !== right.code) return left.code < right.code ? -1 : 1;
      return left.message < right.message ? -1 : left.message > right.message ? 1 : 0;
    });
  }
}

export function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assertSortedUnique(
  values: readonly string[],
  pointer: string,
  diagnostics: Diagnostics,
): void {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined) continue;
    if (compareStrings(previous, current) >= 0) {
      diagnostics.add(
        previous === current ? "E_DUPLICATE" : "E_SORT_ORDER",
        `${pointer}/${index}`,
        previous === current
          ? "values must be unique"
          : "values must use ascending code-unit order",
      );
    }
  }
}
