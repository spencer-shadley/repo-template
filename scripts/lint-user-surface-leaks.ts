#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_CONFIG = ".user-surface-lint.json";
const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "dist", "build", "coverage"]);

interface Rule { readonly id: string; readonly description: string; readonly pattern: RegExp; }
interface AllowlistEntry { readonly path: string; readonly line?: number; readonly rule?: string; readonly match?: string; readonly justification: string; }
interface Config { readonly include: readonly string[]; readonly allowlist: readonly AllowlistEntry[]; readonly userSurface?: "none"; }
interface Finding { readonly path: string; readonly line: number; readonly rule: string; readonly match: string; readonly description: string; }
interface StringLiteral { readonly value: string; readonly line: number; }
interface FileEntry { readonly abs: string; readonly rel: string; }

const RULES: readonly Rule[] = [
  { id: "env-var", description: "environment-variable name in user-visible literal", pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g },
  { id: "infra-noun", description: "infra/operator noun in user-visible literal", pattern: /\b(?:docker|compose|pg_dump)\b|restart the .{0,80}\bstack\b|\.env\b/gi },
  { id: "absolute-path", description: "absolute host path in user-visible literal", pattern: /\b[A-Z]:\\|\/(?:home|var|srv)\//g },
  { id: "internal-error", description: "internal error detail in user-visible literal", pattern: /\b(?:stack trace|internal server error|unhandled exception)\b/gi },
];

const SOURCE_RULES: readonly Rule[] = [
  {
    id: "internal-error",
    description: "stack/internal error passthrough to a response",
    pattern: /\b(?:res\.(?:send|json)|reply\.(?:send|code)|new Response)\s*\([^;\n]*\b[A-Za-z_$][\w$]*\.stack\b/g,
  },
];

const HIGH_CONFIDENCE_ENV_VAR_SUFFIXES = [
  "ACCESS_TOKEN", "API_KEY", "CLIENT_ID", "CLIENT_SECRET", "CONNECTION_STRING",
  "DATABASE_URI", "DATABASE_URL", "PRIVATE_KEY", "REFRESH_TOKEN", "SIGNING_KEY", "WEBHOOK_SECRET",
] as const;

const ENV_VAR_REFERENCE_PATTERNS = [
  /\b(?:process|Bun)\.env(?:\?\.|\.)(?<name>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g,
  /\b(?:process|Bun)\.env\s*\[\s*(['"`])(?<name>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\1\s*\]/g,
  /\bimport\.meta\.env(?:\?\.|\.)(?<name>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g,
  /\b(?:Deno\.env\.get|getenv)\s*\(\s*(['"`])(?<name>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\1/g,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

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
  return "Usage: node scripts/lint-user-surface-leaks.ts [--config <path>] [--self-test]";
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
      throw new Error(`unknown argument: ${String(arg)}`);
    }
  }
  return args;
}

function normalizeRel(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function requiredNonBlankString(value: unknown, error: string): string {
  if (!isString(value) || !value.trim()) throw new Error(error);
  return value;
}

function optionalPositiveInteger(value: unknown, error: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error(error);
  return value;
}

function optionalKnownRule(value: unknown, error: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value) || RULES.every((candidate) => candidate.id !== value)) throw new Error(error);
  return value;
}

function optionalString(value: unknown, error: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value)) throw new Error(error);
  return value;
}

function validateAllowlistRecord(entry: Record<string, unknown>, index: number): AllowlistEntry {
  const line = optionalPositiveInteger(entry["line"], `config.allowlist[${String(index)}].line must be a positive integer`);
  const rule = optionalKnownRule(entry["rule"], `config.allowlist[${String(index)}].rule is not a known rule`);
  const match = optionalString(entry["match"], `config.allowlist[${String(index)}].match must be a string`);
  return {
    path: requiredNonBlankString(entry["path"], `config.allowlist[${String(index)}].path must be a non-empty string`),
    ...(line !== undefined ? { line } : {}),
    ...(rule !== undefined ? { rule } : {}),
    ...(match !== undefined ? { match } : {}),
    justification: requiredNonBlankString(entry["justification"], `config.allowlist[${String(index)}].justification is required`),
  };
}

function validateAllowlistEntry(entry: unknown, index: number): AllowlistEntry {
  if (!isRecord(entry)) {
    throw new Error(`config.allowlist[${String(index)}] must be an object`);
  }
  return validateAllowlistRecord(entry, index);
}

function validateConfigObject(config: Record<string, unknown>): Config {
  const include = config["include"];
  if (!Array.isArray(include) || !include.every(isString)) {
    throw new Error("config.include must be an array of glob strings");
  }
  const allowlist = config["allowlist"] ?? config["allow"] ?? [];
  if (!Array.isArray(allowlist)) {
    throw new Error("config.allowlist must be an array");
  }
  const userSurface = config["userSurface"];
  if (userSurface !== undefined && userSurface !== "none") {
    throw new Error('config.userSurface must be "none" when present');
  }
  if (userSurface === "none" && include.length > 0) {
    throw new Error(
      'config.userSurface "none" conflicts with a non-empty config.include; declare one or the other',
    );
  }
  return {
    include,
    allowlist: allowlist.map((entry, index) => validateAllowlistEntry(entry, index)),
    ...(userSurface === "none" ? { userSurface: "none" } : {}),
  };
}

function readConfig(configPath: string): Config {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    throw new Error(
      `failed to read config ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error("config must be a JSON object");
    return validateConfigObject(parsed);
  } catch (error) {
    throw new Error(
      `failed to parse config ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function expandBraces(glob: string): string[] {
  const match = /^(.*)\{([^{}]+)\}(.*)$/.exec(glob);
  if (!match) return [glob];
  const [, before, body, after] = match;
  if (before === undefined || body === undefined || after === undefined) return [glob];
  return body.split(",").flatMap((part) => expandBraces(`${before}${part}${after}`));
}

function convertGlobChar(glob: string, i: number): { segment: string; skip: number } {
  const char = glob[i];
  const next = glob[i + 1];
  if (char === "*") {
    if (next === "*") {
      return glob[i + 2] === "/" ? { segment: "(?:.*/)?", skip: 2 } : { segment: ".*", skip: 1 };
    }
    return { segment: "[^/]*", skip: 0 };
  }
  if (char === "?") return { segment: "[^/]", skip: 0 };
  if (char !== undefined && String.raw`\^$+?.()|[]{}`.includes(char)) return { segment: `\\${char}`, skip: 0 };
  return { segment: char ?? "", skip: 0 };
}

function globToRegExp(glob: string): RegExp {
  let source = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const { segment, skip } = convertGlobChar(glob, i);
    source += segment;
    i += skip;
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
  return files.toSorted((a, b) => a.rel.localeCompare(b.rel));
}

function lineForIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.codePointAt(i) === 10) line += 1;
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
  return prevChar !== ")" && prevChar !== "]";
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

function readQuotedString(text: string, start: number, quote: string): { value: string; nextIndex: number } {
  let value = "";
  let i = start + 1;
  while (i < text.length) {
    const current = text[i];
    if (current === "\\") {
      value += current;
      if (i + 1 < text.length) value += text[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (current === quote) {
      return { value, nextIndex: i + 1 };
    }
    value += current ?? "";
    i += 1;
  }
  return { value, nextIndex: i };
}

function skipCommentOrRegex(text: string, i: number): number {
  const char = text[i];
  const next = text[i + 1];
  if (char === "/" && next === "/") {
    const nextNewline = text.indexOf("\n", i + 2);
    return nextNewline === -1 ? text.length : nextNewline;
  }
  if (char === "/" && next === "*") {
    const end = text.indexOf("*/", i + 2);
    return end === -1 ? text.length : end + 2;
  }
  if (char === "/" && regexAllowedBeforeIndex(text, i)) {
    const end = tryReadRegexLiteral(text, i);
    if (end !== -1) return end;
  }
  return -1;
}

function extractStringLiterals(text: string): StringLiteral[] {
  const literals: StringLiteral[] = [];
  let i = 0;
  while (i < text.length) {
    const skipIndex = skipCommentOrRegex(text, i);
    if (skipIndex !== -1) {
      i = skipIndex;
      continue;
    }
    const char = text[i];
    if (char !== '"' && char !== "'" && char !== "`") {
      i += 1;
      continue;
    }
    const { value, nextIndex } = readQuotedString(text, i, char);
    literals.push({ value, line: lineForIndex(text, i) });
    i = nextIndex;
  }
  return literals;
}

function isAllowed(finding: Finding, allowlist: readonly AllowlistEntry[]): boolean {
  return allowlist.some((entry) => {
    if (compileGlobs([entry.path]).every((matcher) => !matcher.test(finding.path))) return false;
    if (entry.line !== undefined && entry.line !== finding.line) return false;
    if (entry.rule !== undefined && entry.rule !== finding.rule) return false;
    if (entry.match !== undefined && entry.match !== finding.match) return false;
    return true;
  });
}

function checkLiteralRule(
  literal: StringLiteral,
  rule: Rule,
  refEnvVars: Set<string>,
  relPath: string,
  findings: Finding[],
): void {
  rule.pattern.lastIndex = 0;
  for (const match of literal.value.matchAll(rule.pattern)) {
    if (rule.id === "env-var" && !isEnvironmentVariableLeak(match[0], refEnvVars)) {
      continue;
    }
    findings.push({
      path: relPath,
      line: literal.line,
      rule: rule.id,
      match: match[0],
      description: rule.description,
    });
  }
}

function checkSourceRules(text: string, relPath: string, findings: Finding[]): void {
  for (const rule of SOURCE_RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({
        path: relPath,
        line: lineForIndex(text, match.index),
        rule: rule.id,
        match: match[0].trim(),
        description: rule.description,
      });
    }
  }
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
        checkLiteralRule(literal, rule, referencedEnvVars, file.rel, findings);
      }
    }
    checkSourceRules(text, file.rel, findings);
  }
  return { files, findings: findings.filter((finding) => !isAllowed(finding, config.allowlist)) };
}

function runLint({
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
      stdout('user-surface-lint: user surface explicitly declared none (userSurface: "none"); nothing to scan');
      return 0;
    }
    stderr('user-surface-lint: user surface has not been declared. Set "include" or "userSurface": "none".');
    return 2;
  }

  const { files, findings } = collectFindings(resolvedRoot, config);
  if (files.length === 0) {
    stdout("user-surface-lint: no files matched configured user surface globs");
    return 0;
  }

  if (findings.length === 0) {
    stdout(`user-surface-lint: scanned ${String(files.length)} file(s); no developer/operator leaks found`);
    return 0;
  }

  stderr(`user-surface-lint: found ${String(findings.length)} possible user-surface leak(s)`);
  for (const finding of findings) {
    stderr(`${finding.path}:${String(finding.line)}: ${finding.rule}: ${finding.description}: ${JSON.stringify(finding.match)}`);
  }
  return 1;
}

const TEST_CASES = [
  { name: "good fixture passes", subDir: "good", wantCode: 0, want: "no developer/operator leaks found" },
  { name: "API error-code keys are not environment-variable leaks", subDir: "error-codes", wantCode: 0, want: "no developer/operator leaks found" },
  { name: "bad fixture fails all required rules", subDir: "bad", wantCode: 1, want: ["env-var", "restart the Docker stack", "absolute-path"] },
  { name: "source fixture catches stack passthrough", subDir: "source-leak", wantCode: 1, want: ["internal-error", "err.stack", "e.stack"] },
  { name: "allowlisted fixture passes", subDir: "allowlisted", wantCode: 0, want: "no developer/operator leaks found" },
  { name: "regex literal containing apostrophe is safe", subDir: "regex-safe", wantCode: 0, want: "no developer/operator leaks found" },
  { name: "real leak after regex is caught", subDir: "regex-leak", wantCode: 1, want: ["env-var", "FEATURE_GATE"] },
  { name: "empty include fails closed", subDir: "empty", wantCode: 2, want: "user surface has not been declared" },
  { name: "explicit userSurface: none passes", subDir: "declared-none", wantCode: 0, want: "explicitly declared" },
] as const;

function selfTest(targetRoot = process.cwd(), stdout = console.log): void {
  const fixtureRoot = path.resolve(targetRoot, "tests/fixtures/user-surface-lint");
  for (const tc of TEST_CASES) {
    const output: string[] = [];
    const code = runLint({
      root: path.join(fixtureRoot, tc.subDir),
      configPath: "config.json",
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line),
    });
    const joined = output.join(os.EOL);
    if (code !== tc.wantCode) {
      throw new Error(`${tc.name}: expected exit ${String(tc.wantCode)}, got ${String(code)}\n${joined}`);
    }
    const expectations: readonly string[] = typeof tc.want === "string" ? [tc.want] : tc.want;
    for (const expected of expectations) {
      if (!joined.includes(expected)) {
        throw new Error(`${tc.name}: expected output to include ${JSON.stringify(expected)}\n${joined}`);
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
