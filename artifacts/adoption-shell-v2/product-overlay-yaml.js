import { compareStrings, isRecord } from "./validation-helpers.js";
function formatPrimitive(value) {
    if (value === null || value === undefined)
        return "null";
    if (typeof value === "boolean")
        return value ? "true" : "false";
    if (typeof value === "number")
        return String(value);
    if (typeof value === "string") {
        if (value === "" ||
            /[\n\r:#{}[],&|<>=!%@\\'"\t]/.test(value) ||
            value.includes("*") ||
            value.includes("?") ||
            value === "true" ||
            value === "false" ||
            value === "null" ||
            !Number.isNaN(Number(value))) {
            return JSON.stringify(value);
        }
        return value;
    }
    return null;
}
function formatRecordEntry(key, val, indent) {
    const prefix = "  ".repeat(indent);
    const safeKey = /^[a-zA-Z0-9_.-]+$/.test(key) ? key : JSON.stringify(key);
    if (isRecord(val) || Array.isArray(val)) {
        return `${prefix}${safeKey}:\n${toDeterministicYaml(val, indent + 1)}`;
    }
    const prim = formatPrimitive(val);
    return `${prefix}${safeKey}: ${prim ?? JSON.stringify(String(val))}\n`;
}
function formatRecord(record, indent) {
    const prefix = "  ".repeat(indent);
    const keys = Object.keys(record).sort(compareStrings);
    if (keys.length === 0)
        return `${prefix}{}\n`;
    let out = "";
    for (const key of keys) {
        out += formatRecordEntry(key, record[key], indent);
    }
    return out;
}
function formatArrayItem(item, indent) {
    const prefix = "  ".repeat(indent);
    if (isRecord(item)) {
        const keys = Object.keys(item).sort(compareStrings);
        if (keys.length === 0)
            return `${prefix}- {}\n`;
        const firstKey = keys[0];
        if (firstKey === undefined)
            return "";
        let out = `${prefix}- ${firstKey}:`;
        const firstVal = item[firstKey];
        if (isRecord(firstVal) || Array.isArray(firstVal)) {
            out += `\n${toDeterministicYaml(firstVal, indent + 2)}`;
        }
        else {
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
function formatArray(arr, indent) {
    const prefix = "  ".repeat(indent);
    if (arr.length === 0)
        return `${prefix}[]\n`;
    let out = "";
    for (const item of arr) {
        out += formatArrayItem(item, indent);
    }
    return out;
}
export function toDeterministicYaml(value, indent = 0) {
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
function parseScalar(val) {
    const trimmed = val.trim();
    if (trimmed === "true")
        return true;
    if (trimmed === "false")
        return false;
    if (trimmed === "null")
        return null;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed))
        return Number(trimmed);
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}
function stripComment(raw) {
    const hashIndex = raw.indexOf("#");
    return hashIndex === -1 ? raw.trimEnd() : raw.slice(0, hashIndex).trimEnd();
}
function tokenizeLines(text) {
    const result = [];
    for (const raw of text.split(/\r?\n/)) {
        const stripped = stripComment(raw);
        if (stripped.trim() === "")
            continue;
        const indent = stripped.search(/\S/);
        result.push({ indent, content: stripped.trim() });
    }
    return result;
}
function processListItem(line, current, stack) {
    const itemStr = line.content.slice(2).trim();
    if (Array.isArray(current.container)) {
        current.container.push(parseScalar(itemStr));
        return;
    }
    if (current.key !== null && isRecord(current.container)) {
        const arr = [parseScalar(itemStr)];
        current.container[current.key] = arr;
        stack.push({ indent: line.indent, container: arr, key: null });
    }
}
function processLine(line, stack) {
    while (stack.length > 1) {
        const top = stack.at(-1);
        if (top !== undefined && line.indent <= top.indent) {
            stack.pop();
        }
        else {
            break;
        }
    }
    const current = stack.at(-1);
    if (current === undefined)
        return;
    if (line.content.startsWith("- ")) {
        processListItem(line, current, stack);
        return;
    }
    const colonIndex = line.content.indexOf(":");
    if (colonIndex === -1)
        return;
    const key = String(parseScalar(line.content.slice(0, colonIndex)));
    const valStr = line.content.slice(colonIndex + 1).trim();
    if (isRecord(current.container)) {
        if (valStr === "") {
            const child = {};
            current.container[key] = child;
            stack.push({ indent: line.indent, container: child, key });
        }
        else {
            current.container[key] = parseScalar(valStr);
            current.key = key;
        }
    }
}
export function parseYamlOrJson(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            // Fall through to YAML parser
        }
    }
    const lines = tokenizeLines(text);
    if (lines.length === 0)
        return {};
    const first = lines[0];
    const rootContainer = first !== undefined && first.content.startsWith("- ") ? [] : {};
    const stack = [{ indent: -1, container: rootContainer, key: null }];
    for (const line of lines) {
        processLine(line, stack);
    }
    return rootContainer;
}
