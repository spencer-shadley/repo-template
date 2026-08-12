#!/usr/bin/env node
// Fail closed if a runtime artifact is gitignored without being registered, or
// registered without being gitignored (issue #131 item 4). This replaces the
// advisory-prose runtime-artifact rule the orchestrator plan template carried --
// the rule that named its own two outages and still recurred, because nothing
// checked it. Every `.gitignore` line meant to suppress a specific tool's
// runtime output must be tagged with the line immediately above it:
//   # runtime-artifact: owner=<repo-or-tool> incident=<ref-or-none>
// and every tagged pattern must have a matching entry in
// .runtime-artifact-registry.json (and vice versa).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TAG_PATTERN = /^#\s*runtime-artifact:\s*owner=(\S+)\s+incident=(\S+)\s*$/;

export function parseGitignoreTags(text) {
  const lines = text.split(/\r?\n/);
  const tagged = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = TAG_PATTERN.exec(lines[i] ?? '');
    if (!match) continue;
    const patternLine = lines[i + 1];
    if (patternLine === undefined || patternLine.trim().length === 0 || patternLine.trim().startsWith('#')) {
      throw new Error(`runtime-artifact tag at .gitignore:${i + 1} is not immediately followed by a pattern line`);
    }
    tagged.push({
      pattern: patternLine.trim(),
      owner: match[1],
      incident: match[2] === 'none' ? null : match[2],
      line: i + 1,
    });
  }
  return tagged;
}

export function checkRegistry({ gitignoreText, registry }) {
  const errors = [];
  const tagged = parseGitignoreTags(gitignoreText);
  const taggedByPattern = new Map(tagged.map((row) => [row.pattern, row]));
  const registeredByPattern = new Map(registry.entries.map((row) => [row.pattern, row]));

  const seen = new Set();
  for (const row of tagged) {
    if (seen.has(row.pattern)) {
      errors.push(`.gitignore:${row.line}: duplicate runtime-artifact tag for pattern ${row.pattern}`);
    }
    seen.add(row.pattern);
    const registered = registeredByPattern.get(row.pattern);
    if (!registered) {
      errors.push(
        `.gitignore:${row.line}: pattern ${row.pattern} is tagged runtime-artifact but has no entry in .runtime-artifact-registry.json`,
      );
      continue;
    }
    if (registered.owner !== row.owner) {
      errors.push(
        `${row.pattern}: owner mismatch between .gitignore (${row.owner}) and registry (${registered.owner})`,
      );
    }
    if (registered.incident !== row.incident) {
      errors.push(
        `${row.pattern}: incident mismatch between .gitignore (${row.incident}) and registry (${registered.incident})`,
      );
    }
  }

  for (const row of registry.entries) {
    if (!taggedByPattern.has(row.pattern)) {
      errors.push(
        `.runtime-artifact-registry.json: pattern ${row.pattern} is registered but is not gitignored with a matching runtime-artifact tag`,
      );
    }
  }

  return errors;
}

function loadRegistry(root) {
  const registryPath = join(root, '.runtime-artifact-registry.json');
  if (!existsSync(registryPath)) {
    throw new Error('missing .runtime-artifact-registry.json');
  }
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  if (registry.contractId !== 'repo-template/runtime-artifact-registry-v1') {
    throw new Error('.runtime-artifact-registry.json has an unexpected contractId');
  }
  return registry;
}

function selfTest() {
  const goodGitignore = [
    '# runtime-artifact: owner=repo-template incident=none',
    'scratch/state.json',
    '',
  ].join('\n');
  const goodRegistry = {
    entries: [{ pattern: 'scratch/state.json', owner: 'repo-template', reason: 'x', incident: null }],
  };
  const goodErrors = checkRegistry({ gitignoreText: goodGitignore, registry: goodRegistry });
  if (goodErrors.length !== 0) {
    throw new Error(`self-test failed: matched tag+registry pair reported errors: ${JSON.stringify(goodErrors)}`);
  }

  const untaggedButRegistered = checkRegistry({
    gitignoreText: '',
    registry: goodRegistry,
  });
  if (!untaggedButRegistered.some((e) => e.includes('is not gitignored'))) {
    throw new Error('self-test failed: a registered-but-untagged path was not detected');
  }

  const taggedButUnregistered = checkRegistry({
    gitignoreText: goodGitignore,
    registry: { entries: [] },
  });
  if (!taggedButUnregistered.some((e) => e.includes('no entry in .runtime-artifact-registry.json'))) {
    throw new Error('self-test failed: a tagged-but-unregistered path was not detected');
  }

  const ownerMismatch = checkRegistry({
    gitignoreText: goodGitignore,
    registry: { entries: [{ pattern: 'scratch/state.json', owner: 'agent-orchestrator', reason: 'x', incident: null }] },
  });
  if (!ownerMismatch.some((e) => e.includes('owner mismatch'))) {
    throw new Error('self-test failed: an owner mismatch was not detected');
  }

  console.log('check-runtime-artifact-registry: self-test passed');
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  if (process.argv.includes('--self-test')) {
    try {
      selfTest();
    } catch (error) {
      console.error(`check-runtime-artifact-registry: ${error.message}`);
      process.exitCode = 1;
    }
  } else {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    try {
      const gitignoreText = readFileSync(join(root, '.gitignore'), 'utf8');
      const registry = loadRegistry(root);
      const errors = checkRegistry({ gitignoreText, registry });
      if (errors.length > 0) {
        console.error('check-runtime-artifact-registry: FAIL');
        for (const e of errors) console.error(`  - ${e}`);
        process.exitCode = 1;
      } else {
        console.log(`check-runtime-artifact-registry: ok -- ${registry.entries.length} runtime artifact(s) registered and gitignored`);
      }
    } catch (error) {
      console.error(`check-runtime-artifact-registry: ${error.message}`);
      process.exitCode = 2;
    }
  }
}
