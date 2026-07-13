#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CONFIG = '.user-surface-lint.json';
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage']);

const RULES = [
  {
    id: 'env-var',
    description: 'environment-variable-shaped token in user-visible literal',
    pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g,
  },
  {
    id: 'infra-noun',
    description: 'infra/operator noun in user-visible literal',
    pattern: /\b(?:docker|compose|pg_dump)\b|restart the .{0,80}\bstack\b|\.env\b/gi,
  },
  {
    id: 'absolute-path',
    description: 'absolute host path in user-visible literal',
    pattern: /\b[A-Z]:\\|\/(?:home|var|srv)\//g,
  },
  {
    id: 'internal-error',
    description: 'internal error detail in user-visible literal',
    pattern: /\b(?:stack trace|internal server error|unhandled exception)\b/gi,
  },
];

const SOURCE_RULES = [
  {
    id: 'internal-error',
    description: 'stack/internal error passthrough to a response',
    pattern:
      /\b(?:res\.(?:send|json)|reply\.(?:send|code)|new Response)\s*\([^;\n]*(?:err|error)\.stack\b/g,
  },
];

function usage() {
  return [
    'Usage: node scripts/lint-user-surface-leaks.mjs [--config <path>] [--self-test]',
    '',
    'Config shape:',
    '{',
    '  "include": ["src/**/*.{js,jsx,ts,tsx}"],',
    '  "allowlist": [',
    '    {',
    '      "path": "src/status.ts",',
    '      "line": 12,',
    '      "rule": "env-var",',
    '      "match": "SSO_ID",',
    '      "justification": "Shown as an integration acronym, not setup guidance."',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { configPath: DEFAULT_CONFIG, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-test') {
      args.selfTest = true;
    } else if (arg === '--config') {
      i += 1;
      if (!argv[i]) throw new Error('--config requires a path');
      args.configPath = argv[i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function normalizeRel(filePath) {
  return filePath.split(path.sep).join('/');
}

function readConfig(configPath) {
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new Error(`failed to read config ${configPath}: ${error.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    throw new Error(`failed to parse config ${configPath}: ${error.message}`);
  }

  const include = config.include;
  const allowlist = config.allowlist ?? config.allow ?? [];
  if (!Array.isArray(include) || include.some((entry) => typeof entry !== 'string')) {
    throw new Error('config.include must be an array of glob strings');
  }
  if (!Array.isArray(allowlist)) {
    throw new Error('config.allowlist must be an array');
  }

  for (const [index, entry] of allowlist.entries()) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`config.allowlist[${index}] must be an object`);
    }
    if (typeof entry.path !== 'string' || !entry.path.trim()) {
      throw new Error(`config.allowlist[${index}].path must be a non-empty string`);
    }
    if (entry.line !== undefined && (!Number.isInteger(entry.line) || entry.line < 1)) {
      throw new Error(`config.allowlist[${index}].line must be a positive integer`);
    }
    if (entry.rule !== undefined && !RULES.some((rule) => rule.id === entry.rule)) {
      throw new Error(`config.allowlist[${index}].rule is not a known rule`);
    }
    if (entry.match !== undefined && typeof entry.match !== 'string') {
      throw new Error(`config.allowlist[${index}].match must be a string`);
    }
    if (typeof entry.justification !== 'string' || !entry.justification.trim()) {
      throw new Error(`config.allowlist[${index}].justification is required`);
    }
  }

  return { include, allowlist };
}

function expandBraces(glob) {
  const match = glob.match(/^(.*)\{([^{}]+)\}(.*)$/);
  if (!match) return [glob];
  const [, before, body, after] = match;
  return body.split(',').flatMap((part) => expandBraces(`${before}${part}${after}`));
}

function globToRegExp(glob) {
  let source = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];
    if (char === '*') {
      if (next === '*') {
        const after = glob[i + 2];
        if (after === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if ('\\^$+?.()|[]{}'.includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  source += '$';
  return new RegExp(source);
}

function compileGlobs(globs) {
  return globs.flatMap(expandBraces).map((glob) => globToRegExp(normalizeRel(glob)));
}

function* walkFiles(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walkFiles(path.join(root, entry.name));
    } else if (entry.isFile()) {
      yield path.join(root, entry.name);
    }
  }
}

function matchingFiles(root, include) {
  const matchers = compileGlobs(include);
  const files = [];
  for (const file of walkFiles(root)) {
    const rel = normalizeRel(path.relative(root, file));
    if (matchers.some((matcher) => matcher.test(rel))) files.push({ abs: file, rel });
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

function lineForIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function extractStringLiterals(text) {
  const literals = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '/' && next === '/') {
      i = text.indexOf('\n', i + 2);
      if (i === -1) break;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (char !== '"' && char !== "'" && char !== '`') {
      i += 1;
      continue;
    }

    const quote = char;
    const start = i;
    let value = '';
    i += 1;
    while (i < text.length) {
      const current = text[i];
      if (current === '\\') {
        value += current;
        if (i + 1 < text.length) value += text[i + 1];
        i += 2;
        continue;
      }
      if (current === quote) {
        i += 1;
        break;
      }
      value += current;
      i += 1;
    }
    literals.push({ value, line: lineForIndex(text, start) });
  }
  return literals;
}

function isAllowed(finding, allowlist) {
  return allowlist.some((entry) => {
    if (!compileGlobs([entry.path]).some((matcher) => matcher.test(finding.path))) return false;
    if (entry.line !== undefined && entry.line !== finding.line) return false;
    if (entry.rule !== undefined && entry.rule !== finding.rule) return false;
    if (entry.match !== undefined && entry.match !== finding.match) return false;
    return true;
  });
}

function collectFindings(root, config) {
  const files = matchingFiles(root, config.include);
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(file.abs, 'utf8');
    for (const literal of extractStringLiterals(text)) {
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        for (const match of literal.value.matchAll(rule.pattern)) {
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

function runLint({ root, configPath, stdout = console.log, stderr = console.error }) {
  const resolvedRoot = path.resolve(root);
  const resolvedConfig = path.resolve(resolvedRoot, configPath);
  const config = readConfig(resolvedConfig);

  if (config.include.length === 0) {
    stdout('user-surface-lint: no user surface configured (config.include is empty)');
    return 0;
  }

  const { files, findings } = collectFindings(resolvedRoot, config);
  if (files.length === 0) {
    stdout('user-surface-lint: no files matched configured user surface globs');
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

function selfTest() {
  const fixtureRoot = path.resolve('tests/fixtures/user-surface-lint');
  const cases = [
    {
      name: 'good fixture passes',
      root: path.join(fixtureRoot, 'good'),
      configPath: 'config.json',
      wantCode: 0,
      want: 'no developer/operator leaks found',
    },
    {
      name: 'bad fixture fails all required rules',
      root: path.join(fixtureRoot, 'bad'),
      configPath: 'config.json',
      wantCode: 1,
      want: ['env-var', 'restart the Docker stack', 'absolute-path'],
    },
    {
      name: 'allowlisted fixture passes',
      root: path.join(fixtureRoot, 'allowlisted'),
      configPath: 'config.json',
      wantCode: 0,
      want: 'no developer/operator leaks found',
    },
    {
      name: 'empty include no-ops explicitly',
      root: path.join(fixtureRoot, 'empty'),
      configPath: 'config.json',
      wantCode: 0,
      want: 'no user surface configured',
    },
  ];

  for (const testCase of cases) {
    const output = [];
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
  console.log('user-surface-lint: self-test passed');
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
  } else {
    process.exitCode = runLint({ root: process.cwd(), configPath: args.configPath });
  }
} catch (error) {
  console.error(`user-surface-lint: ${error.message}`);
  process.exitCode = 2;
}
