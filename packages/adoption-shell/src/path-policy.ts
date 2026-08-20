const PORTABLE_SEGMENT = /^[A-Za-z0-9._@()+,=-]+$/;
const WINDOWS_RESERVED =
  /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export type PathFailure =
  | "absolute"
  | "characters"
  | "empty"
  | "length"
  | "reserved"
  | "segment"
  | "trailing";

function isAbsolutePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/.test(value) ||
    value.startsWith("//") ||
    value.startsWith("\\\\")
  );
}

function hasInvalidCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x21 || code > 0x7e || value[index] === "\\") {
      return true;
    }
  }
  return false;
}

function checkSegmentFailure(segment: string): PathFailure | null {
  if (segment.length === 0 || segment === "." || segment === "..") return "segment";
  if (segment.endsWith(".") || segment.endsWith(" ")) return "trailing";
  if (!PORTABLE_SEGMENT.test(segment)) return "characters";
  const basename = segment.split(".")[0] ?? segment;
  if (WINDOWS_RESERVED.test(basename)) return "reserved";
  return null;
}

export function portablePathFailure(value: string): PathFailure | null {
  if (value.length === 0) return "empty";
  if (value.length > 240) return "length";
  if (isAbsolutePath(value)) return "absolute";
  if (hasInvalidCharacters(value)) return "characters";
  for (const segment of value.split("/")) {
    const failure = checkSegmentFailure(segment);
    if (failure !== null) return failure;
  }
  return null;
}

export function isIssueTemplateOverride(value: string): boolean {
  const folded = value.toLowerCase();
  return (
    folded === ".github/issue_template" ||
    folded.startsWith(".github/issue_template/")
  );
}

export function isPreCustodyWorkflow(value: string): boolean {
  const folded = value.toLowerCase();
  return (
    folded === ".github/workflows" ||
    folded.startsWith(".github/workflows/")
  );
}

export function resolvePayloadLink(sourcePath: string, link: string): string | null {
  const target = link.split("#", 1)[0] ?? "";
  if (target.length === 0) return sourcePath;
  if (target.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) {
    return null;
  }
  const base = sourcePath.split("/");
  base.pop();
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (base.length === 0) return null;
      base.pop();
    } else {
      base.push(segment);
    }
  }
  return base.join("/");
}
