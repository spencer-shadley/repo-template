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

function staticModuleSpecifier(statement: string): string | undefined {
  const prefix = statement.startsWith("import ")
    ? "import"
    : statement.startsWith("export ")
      ? "export"
      : undefined;
  if (prefix === undefined) return undefined;

  const clause = statement.slice(prefix.length).trimStart();
  const fromIndex = clause.lastIndexOf(" from ");
  const source = (fromIndex === -1 ? clause : clause.slice(fromIndex + " from ".length)).trimStart();
  const quote = source[0];
  if (quote !== '"' && quote !== "'") return undefined;

  const closingQuote = source.indexOf(quote, 1);
  return closingQuote === -1 ? undefined : source.slice(1, closingQuote);
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

  let statement = "";
  let statementIndex = 0;
  let index = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trimStart();
    if (statement.length === 0 && (trimmed.startsWith("import ") || trimmed.startsWith("export "))) {
      statement = trimmed;
      statementIndex = index + line.length - trimmed.length;
    } else if (statement.length > 0) {
      statement += `\n${trimmed}`;
    }
    if (statement.length > 0 && line.includes(";")) {
      const specifier = staticModuleSpecifier(statement);
      if (specifier !== undefined && !moduleAllowed(specifier)) {
        add(statementIndex, `forbidden module import ${specifier}`);
      }
      statement = "";
    }
    index += line.length + 1;
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
