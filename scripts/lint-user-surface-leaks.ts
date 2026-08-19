#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_CONFIG = ".user-surface-lint.json";
const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "dist", "build", "coverage"]);

export interface Rule {
  readonly id: string;
  readonly description: string;
  readonly pattern: RegExp;
}

export interface AllowlistEntry {
  readonly path: string;
  readonly line?: number;
  readonly rule?: string;
  readonly match?: string;
  readonly justification: string;
}

export interface Config {
  readonly include: readonly string[];
  readonly allowlist: readonly AllowlistEntry[];
  readonly userSurface?: "none";
}

export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly rule: string;
  readonly match: string;
  readonly description: string;
}

export interface StringLiteral {
  readonly value: string;
  readonly line: number;
}

export interface FileEntry {
  readonly abs: string;
  readonly rel: string;
}

const RULES: readonly Rule[] = [
  {
    id: "env-var",
    description: "environment-variable name in user-visible literal",
    pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g,
  },
  {
    id: "infra-noun",
    description: "infra/operator noun in user-visible literal",
    pattern: /\b(?:docker|compose|pg_dump)\b|restart the .{0,80}\bstack\b|\.env\b/gi,
  },
  {
    id: "absolute-path",
    description: "absolute host path in user-visible literal",
    pattern: /\b[A-Z]:\\|\/(?:home|var|srv)\//g,
  },
  {
    id: "internal-error",
    description: "internal error detail in user-visible literal",
    pattern: /\b(?:stack trace|internal server error|unhandled exception)\b/gi,
  },
];

const SOURCE_RULES: readonly Rule[] = [
  {
    id: "internal-error",
    description: "stack/internal error passthrough to a response",
    pattern:
      /\b(?:res\.(?:send|json)|reply\.(?:send|code)|new Response)\s*\([^;\n]*\b[A-Za-z_$][\w$]*\.stack\b/g,
  },
];

// Exact source references catch arbitrary environment-variable names. These suffixes preserve
// detection for setup guidance that names a conventional environment variable but reads it elsewhere.
const HIGH_CONFIDENCE_ENV_VAR_SUFFIXES = [
  "ACCESS_TOKEN",
  "API_KEY",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "CONNECTION_STRING",
  "DATABASE_URI",
  "DATABASE_URL",
  "PRIVATE_KEY",
  "REFRESH_TOKEN",
  "SIGNING_KEY",
  "WEBHOOK_SECRET",
] as const;

const ENV_VAR_REFERENCE_PATTERNS = [
  /\b(?:process|Bun)\.env(?:\?\.|\.)(?<name>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g,
  /\b(?:process|Bun)\.env\s*\[\s*(['"`])(?<name>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\1\s*\]/g,
  /\bimport\.meta\.env(?:\?\.|\.)(?<name>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g,
  /\b(?:Deno\.env\.get|getenv)\s*\(\s*(['"`])(?<name>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\1/g,
];

function referencedEnvironmentVariables(text: string): Set<string> {
  const names = new Set<string>();
  for (const pattern of ENV_VAR_REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const name = match.groups?.["name"];
      if (name) names.add(name);
    }
  }
  return names;
}

function isEnvironmentVariableLeak(token: string, referencedNames: Set<string>): boolean {
  return (
    referencedNames.has(token) ||
    HIGH_CONFIDENCE_ENV_VAR_SUFFIXES.some(
      (suffix) => token === suffix || token.endsWith(`_${suffix}`),
    )
  );
}

function usage(): string {
  return [
    "Usage: node scripts/lint-user-surface-leaks.ts [--config <path>] [--self-test]",
    "",
    "Config shape:",
    "{",
    '  "include": ["src/**/*.{js,jsx,ts,tsx}"],',
    '  "allowlist": [',
    "    {",
    '      "path": "src/status.ts",',
    '      "line": 12,',
    '      "rule": "env-var",',
    '      "match": "SSO_ID",',
    '      "justification": "Shown as an integration acronym, not setup guidance."',
    "    }",
    "  ]",
    "}",
    "",
    "A repository with no user-facing surface at all must say so explicitly instead of leaving",
    '"include" empty:',
    "{",
    '  "userSurface": "none",',
    '  "include": [],',
    '  "allowlist": []',
    "}",
    "",
    'An empty "include" without "userSurface": "none" is rejected (exit 2): the guard fails closed',
    "on an unconfigured/undeclared user surface rather than silently passing.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): { configPath: string; selfTest: boolean } {
  const args = { configPath: DEFAULT_CONFIG, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--config") {
      i += 1;
      const next = argv[i];
      if (!next) throw new Error("--config requires a path");
      args.configPath = next;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function normalizeRel(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function readConfig(configPath: string): Config {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    throw new Error(`failed to read config ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`failed to parse config ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const include = config["include"];
  const allowlist = (config["allowlist"] ?? config["allow"] ?? []) as unknown[];
  const userSurface = config["userSurface"];
  if (!Array.isArray(include) || include.some((entry) => typeof entry !== "string")) {
    throw new Error("config.include must be an array of glob strings");
  }
  if (!Array.isArray(allowlist)) {
    throw new Error("config.allowlist must be an array");
  }
  if (userSurface !== undefined && userSurface !== "none") {
    throw new Error('config.userSurface must be "none" when present');
  }
  if (userSurface === "none" && include.length > 0) {
    throw new Error(
      'config.userSurface "none" conflicts with a non-empty config.include; declare one or the other',
    );
  }

  const typedAllowlist: AllowlistEntry[] = [];
  for (const [index, entry] of allowlist.entries()) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`config.allowlist[${index}] must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e["path"] !== "string" || !e["path"].trim()) {
      throw new Error(`config.allowlist[${index}].path must be a non-empty string`);
    }
    if (e["line"] !== undefined && (!Number.isInteger(e["line"]) || (e["line"] as number) < 1)) {
      throw new Error(`config.allowlist[${index}].line must be a positive integer`);
    }
    if (e["rule"] !== undefined && !RULES.some((rule) => rule.id === e["rule"])) {
      throw new Error(`config.allowlist[${index}].rule is not a known rule`);
    }
    if (e["match"] !== undefined && typeof e["match"] !== "string") {
      throw new Error(`config.allowlist[${index}].match must be a string`);
    }
    if (typeof e["justification"] !== "string" || !e["justification"].trim()) {
      throw new Error(`config.allowlist[${index}].justification is required`);
    }
    typedAllowlist.push({
      path: e["path"],
      ...(e["line"] !== undefined ? { line: e["line"] as number } : {}),
      ...(e["rule"] !== undefined ? { rule: e["rule"] as string } : {}),
      ...(e["match"] !== undefined ? { match: e["match"] as string } : {}),
      justification: e["justification"],
    });
  }

  return {
    include: include as string[],
    allowlist: typedAllowlist,
    ...(userSurface === "none" ? { userSurface: "none" as const } : {}),
  };
}

function expandBraces(glob: string): string[] {
  const match = glob.match(/^(.*)\{([^{}]+)\}(.*)$/);
  if (!match) return [glob];
  const [, before, body, after] = match;
  if (before === undefined || body === undefined || after === undefined) return [glob];
  return body.split(",").flatMap((part) => expandBraces(`${before}${part}${after}`));
}

function globToRegExp(glob: string): RegExp {
  let source = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];
    if (char === "*") {
      if (next === "*") {
        const after = glob[i + 2];
        if (after === "/") {
          source += "(?:.*/)?";
          i += 2;
        } else {
          source += ".*";
          i += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char !== undefined && "\\^$+?.()|[]{}".includes(char)) {
      source += `\\${char}`;
    } else if (char !== undefined) {
      source += char;
    }
  }
  source += "$";
  return new RegExp(source);
}

function compileGlobs(globs: readonly string[]): RegExp[] {
  return globs.flatMap(expandBraces).map((glob) => globToRegExp(normalizeRel(glob)));
}

function* walkFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walkFiles(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      yield path.join(dir, entry.name);
    }
  }
}

function matchingFiles(searchRoot: string, include: readonly string[]): FileEntry[] {
  const matchers = compileGlobs(include);
  const files: FileEntry[] = [];
  for (const file of walkFiles(searchRoot)) {
    const rel = normalizeRel(path.relative(searchRoot, file));
    if (matchers.some((matcher) => matcher.test(rel))) files.push({ abs: file, rel });
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

function lineForIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await", "default", "extends",
]);

function regexAllowedBeforeIndex(text: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(text[j] ?? "")) j -= 1;
  if (j < 0) return true;
  const prevChar = text[j];
  if (prevChar !== undefined && /[\w$]/.test(prevChar)) {
    let start = j;
    while (start >= 0 && /[\w$]/.test(text[start] ?? "")) start -= 1;
    const word = text.slice(start + 1, j + 1);
    return REGEX_PRECEDING_KEYWORDS.has(word);
  }
  if (prevChar === ")" || prevChar === "]") return false;
  return true;
}

function tryReadRegexLiteral(text: string, i: number): number {
  const nextNewline = text.indexOf("\n", i);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  let inClass = false;
  let j = i + 1;
  while (j < lineEnd) {
    const current = text[j];
    if (current === "\\") {
      j += 2;
      continue;
    }
    if (current === "[") {
      inClass = true;
      j += 1;
      continue;
    }
    if (current === "]") {
      inClass = false;
      j += 1;
      continue;
    }
    if (current === "/" && !inClass) {
      let end = j + 1;
      while (end < text.length && /[a-z]/i.test(text[end] ?? "")) end += 1;
      return end;
    }
    j += 1;
  }
  return -1;
}

function extractStringLiterals(text: string): StringLiteral[] {
  const literals: StringLiteral[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "/" && next === "/") {
      i = text.indexOf("\n", i + 2);
      if (i === -1) break;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (char === "/" && regexAllowedBeforeIndex(text, i)) {
      const end = tryReadRegexLiteral(text, i);
      if (end !== -1) {
        i = end;
        continue;
      }
    }
    if (char !== '"' && char !== "'" && char !== "`") {
      i += 1;
      continue;
    }

    const quote = char;
    const start = i;
    let value = "";
    i += 1;
    while (i < text.length) {
      const current = text[i];
      if (current === "\\") {
        value += current;
        if (i + 1 < text.length) value += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (current === quote) {
        i += 1;
        break;
      }
      value += current ?? "";
      i += 1;
    }
    literals.push({ value, line: lineForIndex(text, start) });
  }
  return literals;
}

function isAllowed(finding: Finding, allowlist: readonly AllowlistEntry[]): boolean {
  return allowlist.some((entry) => {
    if (!compileGlobs([entry.path]).some((matcher) => matcher.test(finding.path))) return false;
    if (entry.line !== undefined && entry.line !== finding.line) return false;
    if (entry.rule !== undefined && entry.rule !== finding.rule) return false;
    if (entry.match !== undefined && entry.match !== finding.match) return false;
    return true;
  });
}

function collectFindings(
  targetRoot: string,
  config: Config,
): { files: readonly FileEntry[]; findings: readonly Finding[] } {
  const files = matchingFiles(targetRoot, config.include);
  const findings: Finding[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file.abs, "utf8");
    const referencedEnvVars = referencedEnvironmentVariables(text);
    for (const literal of extractStringLiterals(text)) {
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        for (const match of literal.value.matchAll(rule.pattern)) {
          if (
            rule.id === "env-var" &&
            !isEnvironmentVariableLeak(match[0], referencedEnvVars)
          ) {
            continue;
          }
          findings.push({
            path: file.rel,
            line: literal.line,
            rule: rule.id,
            match: match[0],
            description: rule.description,
          });
        }
      }
    }
    for (const rule of SOURCE_RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of text.matchAll(rule.pattern)) {
        findings.push({
          path: file.rel,
          line: lineForIndex(text, match.index ?? 0),
          rule: rule.id,
          match: match[0].trim(),
          description: rule.description,
        });
      }
    }
  }
  return { files, findings: findings.filter((finding) => !isAllowed(finding, config.allowlist)) };
}

export function runLint({
  root: targetRoot,
  configPath,
  stdout = console.log,
  stderr = console.error,
}: {
  readonly root: string;
  readonly configPath: string;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
}): number {
  const resolvedRoot = path.resolve(targetRoot);
  const resolvedConfig = path.resolve(resolvedRoot, configPath);
  const config = readConfig(resolvedConfig);

  if (config.include.length === 0) {
    if (config.userSurface === "none") {
      stdout(
        'user-surface-lint: user surface explicitly declared none (userSurface: "none"); nothing to scan',
      );
      return 0;
    }
    stderr(
      [
        "user-surface-lint: user surface has not been declared.",
        `Set "include" in ${configPath} to one or more globs covering user-visible strings/responses,`,
        "or, if this repository truly has no user-facing surface, explicitly opt out with",
        '"userSurface": "none".',
      ].join(" "),
    );
    return 2;
  }

  const { files, findings } = collectFindings(resolvedRoot, config);
  if (files.length === 0) {
    stdout("user-surface-lint: no files matched configured user surface globs");
    return 0;
  }

  if (findings.length === 0) {
    stdout(`user-surface-lint: scanned ${files.length} file(s); no developer/operator leaks found`);
    return 0;
  }

  stderr(`user-surface-lint: found ${findings.length} possible user-surface leak(s)`);
  for (const finding of findings) {
    stderr(
      `${finding.path}:${finding.line}: ${finding.rule}: ${finding.description}: ${JSON.stringify(
        finding.match,
      )}`,
    );
  }
  return 1;
}

export function selfTest(targetRoot = process.cwd(), stdout = console.log): void {
  const fixtureRoot = path.resolve(targetRoot, "tests/fixtures/user-surface-lint");
  const cases = [
    {
      name: "good fixture passes",
      root: path.join(fixtureRoot, "good"),
      configPath: "config.json",
      wantCode: 0,
      want: "no developer/operator leaks found",
    },
    {
      name: "API error-code keys are not environment-variable leaks",
      root: path.join(fixtureRoot, "error-codes"),
      configPath: "config.json",
      wantCode: 0,
      want: "no developer/operator leaks found",
    },
    {
      name: "bad fixture fails all required rules",
      root: path.join(fixtureRoot, "bad"),
      configPath: "config.json",
      wantCode: 1,
      want: ["env-var", "restart the Docker stack", "absolute-path"],
    },
    {
      name: "source fixture catches stack passthrough under any catch-variable binding",
      root: path.join(fixtureRoot, "source-leak"),
      configPath: "config.json",
      wantCode: 1,
      want: ["internal-error", "err.stack", "e.stack"],
    },
    {
      name: "allowlisted fixture passes",
      root: path.join(fixtureRoot, "allowlisted"),
      configPath: "config.json",
      wantCode: 0,
      want: "no developer/operator leaks found",
    },
    {
      name: "regex literal containing an apostrophe does not open a phantom string",
      root: path.join(fixtureRoot, "regex-safe"),
      configPath: "config.json",
      wantCode: 0,
      want: "no developer/operator leaks found",
    },
    {
      name: "a real leak after a regex literal on an earlier line is still caught",
      root: path.join(fixtureRoot, "regex-leak"),
      configPath: "config.json",
      wantCode: 1,
      want: ["env-var", "FEATURE_GATE"],
    },
    {
      name: "empty include with no declaration is rejected (fail closed)",
      root: path.join(fixtureRoot, "empty"),
      configPath: "config.json",
      wantCode: 2,
      want: "user surface has not been declared",
    },
    {
      name: "explicit userSurface: none opt-out passes",
      root: path.join(fixtureRoot, "declared-none"),
      configPath: "config.json",
      wantCode: 0,
      want: "explicitly declared",
    },
  ];

  for (const testCase of cases) {
    const output: string[] = [];
    const code = runLint({
      root: testCase.root,
      configPath: testCase.configPath,
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line),
    });
    const joined = output.join(os.EOL);
    if (code !== testCase.wantCode) {
      throw new Error(`${testCase.name}: expected exit ${testCase.wantCode}, got ${code}\n${joined}`);
    }
    const expectations = Array.isArray(testCase.want) ? testCase.want : [testCase.want];
    for (const expected of expectations) {
      if (!joined.includes(expected)) {
        throw new Error(`${testCase.name}: expected output to include ${JSON.stringify(expected)}\n${joined}`);
      }
    }
  }
  stdout("user-surface-lint: self-test passed");
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined &&
  pathToFileURL(path.resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.selfTest) {
      selfTest();
    } else {
      process.exitCode = runLint({ root: process.cwd(), configPath: args.configPath });
    }
  } catch (error) {
    console.error(`user-surface-lint: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
