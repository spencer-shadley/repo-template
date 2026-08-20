const encoder = new TextEncoder();

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        throw new TypeError("RFC 8785 strings must not contain lone surrogates");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("RFC 8785 strings must not contain lone surrogates");
    }
  }
}

function serializePrimitive(value: unknown): string | null {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("RFC 8785 numbers must be finite");
    }
    return JSON.stringify(value);
  }
  return null;
}

function serializeArray(value: unknown[], ancestors: Set<object>): string {
  const rows: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new TypeError("RFC 8785 does not support sparse arrays");
    }
    rows.push(serialize(value[index], ancestors));
  }
  return `[${rows.join(",")}]`;
}

function serializeObject(value: object, ancestors: Set<object>): string {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("RFC 8785 accepts only plain objects");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const rows = keys.map((key) => {
    assertUnicodeScalarString(key);
    return `${JSON.stringify(key)}:${serialize(record[key], ancestors)}`;
  });
  return `{${rows.join(",")}}`;
}

function serialize(value: unknown, ancestors: Set<object>): string {
  const primitive = serializePrimitive(value);
  if (primitive !== null) return primitive;
  if (typeof value !== "object") {
    throw new TypeError(`RFC 8785 does not support ${typeof value}`);
  }

  if (ancestors.has(value)) {
    throw new TypeError("RFC 8785 does not support cyclic values");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return serializeArray(value, ancestors);
    }
    return serializeObject(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJson(value: unknown): string {
  return serialize(value, new Set<object>());
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalizeJson(value));
}
