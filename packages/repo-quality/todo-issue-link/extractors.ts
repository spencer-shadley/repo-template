import type { CommentSpanV1 } from "./types.ts";

function pushSpan(out: CommentSpanV1[], text: string, line: number, column: number): void {
  const trimmed = text.replace(/\r/g, "");
  if (!trimmed.trim()) return;
  out.push({ text: trimmed, line, column });
}

function lineColAt(source: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

/** C-family line and block comments outside strings. */
function extractCFamilyComments(source: string): CommentSpanV1[] {
  const out: CommentSpanV1[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      const start = i;
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      const { line, column } = lineColAt(source, start);
      pushSpan(out, source.slice(start + 2, i), line, column + 2);
      continue;
    }
    if (ch === "/" && next === "*") {
      const start = i;
      i += 2;
      while (i + 1 < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      const end = i;
      if (i + 1 < source.length) i += 2;
      const { line, column } = lineColAt(source, start);
      pushSpan(out, source.slice(start + 2, end), line, column + 2);
      continue;
    }
    i += 1;
  }
  return out;
}

/** Hash line comments outside single/double/backtick strings. */
function extractHashLineComments(source: string): CommentSpanV1[] {
  const out: CommentSpanV1[] = [];
  const lines = source.split(/\r?\n/);
  let offset = 0;
  for (let li = 0; li < lines.length; li += 1) {
    const lineText = lines[li]!;
    let inSingle = false;
    let inDouble = false;
    let hashAt = -1;
    for (let ci = 0; ci < lineText.length; ci += 1) {
      const ch = lineText[ci]!;
      if (ch === "\\" && (inSingle || inDouble)) {
        ci += 1;
        continue;
      }
      if (!inDouble && ch === "'") {
        inSingle = !inSingle;
        continue;
      }
      if (!inSingle && ch === '"') {
        inDouble = !inDouble;
        continue;
      }
      if (!inSingle && !inDouble && ch === "#") {
        hashAt = ci;
        break;
      }
    }
    if (hashAt >= 0) {
      pushSpan(out, lineText.slice(hashAt + 1), li + 1, hashAt + 2);
    }
    offset += lineText.length + 1;
  }
  return out;
}

function extractPowershellComments(source: string): CommentSpanV1[] {
  const out = extractHashLineComments(source);
  let i = 0;
  while (i < source.length) {
    if (source[i] === "<" && source[i + 1] === "#") {
      const start = i;
      i += 2;
      while (i + 1 < source.length && !(source[i] === "#" && source[i + 1] === ">")) i += 1;
      const end = i;
      if (i + 1 < source.length) i += 2;
      const { line, column } = lineColAt(source, start);
      pushSpan(out, source.slice(start + 2, end), line, column + 2);
      continue;
    }
    i += 1;
  }
  return out;
}

function extractSqlComments(source: string): CommentSpanV1[] {
  const out: CommentSpanV1[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === "'" ) {
      i += 1;
      while (i < source.length) {
        if (source[i] === "'" && source[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (source[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "-" && next === "-") {
      const start = i;
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      const { line, column } = lineColAt(source, start);
      pushSpan(out, source.slice(start + 2, i), line, column + 2);
      continue;
    }
    if (ch === "/" && next === "*") {
      const start = i;
      i += 2;
      while (i + 1 < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      const end = i;
      if (i + 1 < source.length) i += 2;
      const { line, column } = lineColAt(source, start);
      pushSpan(out, source.slice(start + 2, end), line, column + 2);
      continue;
    }
    i += 1;
  }
  return out;
}

function extractHtmlComments(source: string): CommentSpanV1[] {
  const out: CommentSpanV1[] = [];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const start = i;
      i += 4;
      while (i + 2 < source.length && !source.startsWith("-->", i)) i += 1;
      const end = i;
      if (i + 2 < source.length) i += 3;
      const { line, column } = lineColAt(source, start);
      pushSpan(out, source.slice(start + 4, end), line, column + 4);
      continue;
    }
    i += 1;
  }
  return out;
}

function extractCssBlockComments(source: string): CommentSpanV1[] {
  return extractCFamilyComments(source).filter((span) => true);
}

export function extractComments(extractorId: string, source: string): CommentSpanV1[] {
  switch (extractorId) {
    case "c-family-comments-v1":
      return extractCFamilyComments(source);
    case "hash-line-comments-v1":
      return extractHashLineComments(source);
    case "powershell-comments-v1":
      return extractPowershellComments(source);
    case "sql-comments-v1":
      return extractSqlComments(source);
    case "html-comments-v1":
      return extractHtmlComments(source);
    case "css-block-comments-v1":
      return extractCssBlockComments(source);
    case "none":
      return [];
    default:
      return [];
  }
}
