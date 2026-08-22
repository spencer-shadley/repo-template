import fs from "node:fs";
import path from "node:path";

const ALLOWED_NODE_IMPORTS = new Set(["node:crypto"]);

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function moduleAllowed(specifier: string): boolean {
  return (
    ALLOWED_NODE_IMPORTS.has(specifier) ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

function scanFile(filePath: string): readonly string[] {
  const text = fs.readFileSync(filePath, "utf8");
  const findings: string[] = [];
  const add = (index: number, message: string): void => {
    const prefix = text.slice(0, index);
    const line = prefix.split("\n").length;
    const column = index - prefix.lastIndexOf("\n");
    findings.push(`${filePath}:${String(line)}:${String(column)}: ${message}`);
  };
  for (const match of text.matchAll(
    /\b(?:import|export)\s+(?:[^"'`;]*?\sfrom\s*)?["']([^"']+)["']/g,
  )) {
    const specifier = match[1] ?? "";
    if (!moduleAllowed(specifier)) {
      add(match.index, `forbidden module import ${specifier}`);
    }
  }
  const forbiddenPatterns = [
    [/\bimport\s*\(/g, "dynamic import is forbidden"],
    [/\bimport\.meta\b/g, "import.meta ambient access is forbidden"],
    [
      /\b(?:Date|fetch|setImmediate|setInterval|setTimeout|WebSocket|XMLHttpRequest|process|require|eval)\b/g,
      "forbidden ambient identifier",
    ],
    [
      /\.(?:cwd|env|homedir|localeCompare|random|randomUUID)\b/g,
      "forbidden ambient property",
    ],
  ] as const;
  for (const [pattern, message] of forbiddenPatterns) {
    for (const match of text.matchAll(pattern)) add(match.index, message);
  }
  return findings;
}

export function scanPublicCode(
  root: string,
  relativePaths: readonly string[],
): readonly string[] {
  return relativePaths
    .flatMap((relativePath) => scanFile(path.join(root, ...relativePath.split("/"))))
    .sort(compare);
}
