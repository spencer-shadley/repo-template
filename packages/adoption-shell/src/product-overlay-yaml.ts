import { compareStrings, isRecord } from "./validation-helpers.ts";

export const MAX_YAML_DEPTH = 32 as const;

function formatPrimitive(value: unknown): string | null {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (
      value === "" ||
      /[\n\r:#{}[],&|<>=!%@\\'"\t]/.test(value) ||
      value.includes("*") ||
      value.includes("?") ||
      value === "true" ||
      value === "false" ||
      value === "null" ||
      !Number.isNaN(Number(value))
    ) {
      return JSON.stringify(value);
    }
    return value;
  }
  return null;
}

function formatRecordEntry(
  key: string,
  val: unknown,
  indent: number,
): string {
  const prefix = "  ".repeat(indent);
  const safeKey = /^[a-zA-Z0-9_.-]+$/.test(key) ? key : JSON.stringify(key);
  if (isRecord(val) || Array.isArray(val)) {
    return `${prefix}${safeKey}:\n${toDeterministicYaml(val, indent + 1)}`;
  }
  const prim = formatPrimitive(val);
  return `${prefix}${safeKey}: ${prim ?? JSON.stringify(String(val))}\n`;
}

function formatRecord(record: Record<string, unknown>, indent: number): string {
  const prefix = "  ".repeat(indent);
  const keys = Object.keys(record).sort(compareStrings);
  if (keys.length === 0) return `${prefix}{}\n`;
  let out = "";
  for (const key of keys) {
    out += formatRecordEntry(key, record[key], indent);
  }
  return out;
}

function formatArrayItem(item: unknown, indent: number): string {
  const prefix = "  ".repeat(indent);
  if (isRecord(item)) {
    const keys = Object.keys(item).sort(compareStrings);
    if (keys.length === 0) return `${prefix}- {}\n`;
    const firstKey = keys[0];
    if (firstKey === undefined) return "";
    let out = `${prefix}- ${firstKey}:`;
    const firstVal = item[firstKey];
    if (isRecord(firstVal) || Array.isArray(firstVal)) {
      out += `\n${toDeterministicYaml(firstVal, indent + 2)}`;
    } else {
      const prim = formatPrimitive(firstVal);
      out += ` ${prim ?? JSON.stringify(String(firstVal))}\n`;
    }
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i];
      if (k !== undefined) {
        out += formatRecordEntry(k, item[k], indent + 1);
      }
    }
    return out;
  }
  if (Array.isArray(item)) {
    return `${prefix}-\n${toDeterministicYaml(item, indent + 1)}`;
  }
  const prim = formatPrimitive(item);
  return `${prefix}- ${prim ?? JSON.stringify(String(item))}\n`;
}

function formatArray(arr: readonly unknown[], indent: number): string {
  const prefix = "  ".repeat(indent);
  if (arr.length === 0) return `${prefix}[]\n`;
  let out = "";
  for (const item of arr) {
    out += formatArrayItem(item, indent);
  }
  return out;
}

export function toDeterministicYaml(value: unknown, indent = 0): string {
  if (indent > MAX_YAML_DEPTH) {
    throw new Error(`YAML serialization exceeds maximum nesting depth of ${String(MAX_YAML_DEPTH)}`);
  }
  const prim = formatPrimitive(value);
  if (prim !== null) {
    return `${"  ".repeat(indent)}${prim}\n`;
  }
  if (Array.isArray(value)) {
    return formatArray(value, indent);
  }
  if (isRecord(value)) {
    return formatRecord(value, indent);
  }
  return `${"  ".repeat(indent)}${JSON.stringify(String(value))}\n`;
}

function parseScalar(val: string): unknown {
  const trimmed = val.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

interface ParsedLine {
  indent: number;
  content: string;
}

function stripComment(raw: string): string {
  const hashIndex = raw.indexOf("#");
  return hashIndex === -1 ? raw.trimEnd() : raw.slice(0, hashIndex).trimEnd();
}

function tokenizeLines(text: string): ParsedLine[] {
  const result: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stripped = stripComment(raw);
    if (stripped.trim() === "") continue;
    const indent = stripped.search(/\S/);
    result.push({ indent, content: stripped.trim() });
  }
  return result;
}

interface Frame {
  indent: number;
  container: Record<string, unknown> | unknown[];
  key: string | null;
}

function processListItem(line: ParsedLine, current: Frame, stack: Frame[]): void {
  const itemStr = line.content.slice(2).trim();
  if (Array.isArray(current.container)) {
    current.container.push(parseScalar(itemStr));
    return;
  }
  if (current.key !== null && isRecord(current.container)) {
    if (stack.length >= MAX_YAML_DEPTH) {
      throw new Error(`YAML parsing exceeds maximum nesting depth of ${String(MAX_YAML_DEPTH)}`);
    }
    const arr: unknown[] = [parseScalar(itemStr)];
    current.container[current.key] = arr;
    stack.push({ indent: line.indent, container: arr, key: null });
  }
}

function processLine(
  line: ParsedLine,
  stack: Frame[],
): void {
  while (stack.length > 1) {
    const top = stack.at(-1);
    if (top !== undefined && line.indent <= top.indent) {
      stack.pop();
    } else {
      break;
    }
  }
  const current = stack.at(-1);
  if (current === undefined) return;

  if (line.content.startsWith("- ")) {
    processListItem(line, current, stack);
    return;
  }

  const colonIndex = line.content.indexOf(":");
  if (colonIndex === -1) return;
  const key = String(parseScalar(line.content.slice(0, colonIndex)));
  const valStr = line.content.slice(colonIndex + 1).trim();

  if (isRecord(current.container)) {
    if (valStr === "") {
      if (stack.length >= MAX_YAML_DEPTH) {
        throw new Error(`YAML parsing exceeds maximum nesting depth of ${String(MAX_YAML_DEPTH)}`);
      }
      const child: Record<string, unknown> = {};
      current.container[key] = child;
      stack.push({ indent: line.indent, container: child, key });
    } else {
      current.container[key] = parseScalar(valStr);
      current.key = key;
    }
  }
}

export function parseYamlOrJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to YAML parser
    }
  }

  const lines = tokenizeLines(text);
  if (lines.length === 0) return {};

  const first = lines[0];
  const rootContainer: Record<string, unknown> | unknown[] =
    first !== undefined && first.content.startsWith("- ") ? [] : {};
  const stack: Frame[] = [{ indent: -1, container: rootContainer, key: null }];

  for (const line of lines) {
    processLine(line, stack);
  }

  return rootContainer;
}
