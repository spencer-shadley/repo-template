#!/usr/bin/env node
// The proof-of-detection meta-gate (issue #131). For every declared LocalCiContractV3
// command it plants the command's known-bad detectionProof fixture (or records its
// exemption), asserts the command exits non-zero on the planted defect, and restores
// the tree. A command that stays green (exit 0) on a planted defect fails the meta-gate:
// "the command ran" is never accepted as "the invariant holds."
//
// Restoration is crash-safe: every plant is recorded in an on-disk ledger BEFORE the
// command runs, so a killed process leaves a trail the next invocation self-heals from
// (see restoreOrphans). Planted paths must not already exist -- the meta-gate never
// overwrites real content, only ever a dedicated proof-of-detection scratch path.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LEDGER_PATH = '.ops/proof-of-detection-plant-ledger.json';

function readLedger(root) {
  const ledgerPath = path.join(root, LEDGER_PATH);
  if (!fs.existsSync(ledgerPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeLedger(root, ledger) {
  const ledgerPath = path.join(root, LEDGER_PATH);
  if (Object.keys(ledger).length === 0) {
    fs.rmSync(ledgerPath, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

// Self-heal: delete any planted path left behind by a crashed prior run and clear
// its ledger entry. Safe to call at the start of every invocation.
export function restoreOrphans(root, { stderr = console.error } = {}) {
  const ledger = readLedger(root);
  const orphans = Object.keys(ledger);
  for (const relativePath of orphans) {
    const absolute = path.join(root, relativePath);
    if (fs.existsSync(absolute)) {
      fs.rmSync(absolute, { force: true });
      stderr(`proof-of-detection: restored orphaned plant from a prior crashed run: ${relativePath}`);
    }
  }
  writeLedger(root, {});
  return orphans;
}

function plant(root, relativePath, sourceBytes) {
  const absolute = path.join(root, relativePath);
  if (fs.existsSync(absolute)) {
    throw new Error(
      `proof-of-detection: refusing to plant over an existing path: ${relativePath} ` +
        '(run restoreOrphans first, or this fixture path collides with real content)',
    );
  }
  const ledger = readLedger(root);
  ledger[relativePath] = { plantedAt: 'pending' };
  writeLedger(root, ledger);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, sourceBytes);
}

function restore(root, relativePath) {
  const absolute = path.join(root, relativePath);
  fs.rmSync(absolute, { force: true });
  const ledger = readLedger(root);
  delete ledger[relativePath];
  writeLedger(root, ledger);
}

function outcome(commandId, fields) {
  return {
    schemaId: 'https://schemas.repo-template.dev/local-ci-outcome-v1/local-ci-outcome-v1.schema.json',
    schemaVersion: '1.0.0',
    contractId: 'repo-template/local-ci-outcome-v1',
    commandId,
    detectionProofExercised: false,
    ...fields,
  };
}

// `bytesForFixture` resolves the known-bad content to plant: a function so callers can
// keep fixture bytes wherever fits the contract (checked-in file, inline buffer, ...).
export function runDetectionProofs(contract, { root, bytesForFixture, timestamp }) {
  restoreOrphans(root);
  const results = [];
  for (const [commandId, command] of Object.entries(contract.commands)) {
    const proof = command.detectionProof;
    if (proof.exempt !== undefined) {
      results.push(
        outcome(commandId, { outcome: 'skipped', exitCode: null, reason: proof.exempt, recordedAt: timestamp }),
      );
      continue;
    }
    const { fixture } = proof;
    const bytes = bytesForFixture(commandId, fixture);
    let planted = false;
    try {
      plant(root, fixture.path, bytes);
      planted = true;
      const spawnResult = spawnSync(command.executable, command.args, {
        cwd: path.join(root, command.cwd),
        shell: command.shell !== 'none' ? command.shell : undefined,
        timeout: command.timeoutSeconds * 1000,
        encoding: 'utf8',
      });
      if (spawnResult.error || spawnResult.status === null) {
        const reason = spawnResult.error
          ? spawnResult.error.message
          : `command timed out after ${command.timeoutSeconds}s or was killed by signal ${spawnResult.signal}`;
        results.push(
          outcome(commandId, {
            outcome: 'could-not-execute',
            exitCode: null,
            reason,
            recordedAt: timestamp,
            detectionProofExercised: true,
          }),
        );
        continue;
      }
      // Detection-proof inversion: exit 0 on a KNOWN-BAD fixture means the detector
      // stayed blind -- that is a FAIL of this proof, not a pass of the command.
      const detected = spawnResult.status !== 0;
      results.push(
        outcome(commandId, {
          outcome: detected ? 'pass' : 'fail',
          exitCode: spawnResult.status,
          reason: null,
          recordedAt: timestamp,
          detectionProofExercised: true,
        }),
      );
    } finally {
      if (planted) restore(root, fixture.path);
    }
  }
  return results;
}

export function summarizeDetectionProofs(results) {
  const counts = { pass: 0, fail: 0, skipped: 0, 'could-not-execute': 0 };
  for (const row of results) counts[row.outcome] += 1;
  const metaGateFailed = counts.fail > 0 || counts['could-not-execute'] > 0;
  return { counts, unprovenCount: counts.skipped, metaGateFailed };
}

function formatReceipt(results, summary) {
  const lines = [
    `proof-of-detection: ${results.length} command(s) declared; ` +
      `${summary.counts.pass} detected, ${summary.counts.fail} blind, ` +
      `${summary.counts.skipped} exempt (unproven), ${summary.counts['could-not-execute']} could-not-execute`,
  ];
  for (const row of results) {
    lines.push(
      `  ${row.commandId}: ${row.outcome}${row.reason ? ` (${row.reason})` : ''}${
        row.exitCode !== null ? ` [exit ${row.exitCode}]` : ''
      }`,
    );
  }
  return lines.join('\n');
}

// Acceptance test for the meta-gate itself (issue #131): wire the reference
// theme-dual-mode detector's REAL (luminance-aware) mode and its deliberately
// BLINDED (hex-only, historical) mode as two detectionProof fixtures against the
// exact `rgb(13 15 22 / 92%)` dark surface that shipped 22 times undetected.
// If the meta-gate cannot tell these apart -- passing the real detector and
// failing the blind one -- it does not work.
function selfTest() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const detectorScript = path.join(repoRoot, 'scripts', 'proof-of-detection', 'reference-detectors', 'theme-dual-mode-lint.mjs');
  const darkRgbCss = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'proof-of-detection', 'reference-detectors', 'fixtures', 'dark-rgb.css'),
  );

  function contractFor(mode) {
    return {
      commands: {
        'authoritative-gate': {
          name: 'theme-dual-mode-lint',
          executable: process.execPath,
          args: [detectorScript, 'tests/fixtures/proof-of-detection/self-test-planted.css', `--mode=${mode}`],
          shell: 'none',
          cwd: '.',
          timeoutSeconds: 30,
          expectedExitCode: 0,
          failureDisposition: 'fail-gate',
          detectionProof: {
            fixture: {
              path: 'tests/fixtures/proof-of-detection/self-test-planted.css',
              description: 'rgb() dark surface -- the exact historical hex-only blindness',
              expectation: 'non-zero-exit',
            },
          },
        },
      },
    };
  }

  const ownedTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-template-proof-of-detection-selftest-'));
  try {
    const luminanceResults = runDetectionProofs(contractFor('luminance'), {
      root: ownedTemp,
      bytesForFixture: () => darkRgbCss,
      timestamp: '2026-08-12T00:00:00Z',
    });
    const luminanceSummary = summarizeDetectionProofs(luminanceResults);
    if (luminanceResults[0]?.outcome !== 'pass' || luminanceSummary.metaGateFailed) {
      throw new Error(
        `self-test failed: the real luminance-aware detector must be PROVEN (outcome=pass); got ${JSON.stringify(luminanceResults)}`,
      );
    }
    if (fs.existsSync(path.join(ownedTemp, 'tests/fixtures/proof-of-detection/self-test-planted.css'))) {
      throw new Error('self-test failed: planted fixture was not restored after the luminance run');
    }

    const hexOnlyResults = runDetectionProofs(contractFor('hex-only'), {
      root: ownedTemp,
      bytesForFixture: () => darkRgbCss,
      timestamp: '2026-08-12T00:00:00Z',
    });
    const hexOnlySummary = summarizeDetectionProofs(hexOnlyResults);
    if (hexOnlyResults[0]?.outcome !== 'fail' || !hexOnlySummary.metaGateFailed) {
      throw new Error(
        `self-test failed: the meta-gate MUST fail when the detector is blinded to hex-only; got ${JSON.stringify(hexOnlyResults)}`,
      );
    }
    if (fs.existsSync(path.join(ownedTemp, 'tests/fixtures/proof-of-detection/self-test-planted.css'))) {
      throw new Error('self-test failed: planted fixture was not restored after the hex-only run');
    }
  } finally {
    fs.rmSync(ownedTemp, { recursive: true, force: true });
  }

  console.log(
    'proof-of-detection self-test: PASS -- luminance-aware detector proven (exit non-zero on rgb(13 15 22 / 92%)); ' +
      'hex-only (historical) detector correctly caught as BLIND by the meta-gate (stayed exit 0 on the same fixture)',
  );
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  if (process.argv.includes('--self-test')) {
    try {
      selfTest();
    } catch (error) {
      console.error(`proof-of-detection: ${error.message}`);
      process.exitCode = 1;
    }
  } else {
    const contractPathArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
    if (!contractPathArg) {
      console.error('usage: node scripts/proof-of-detection/run-meta-gate.mjs <local-ci-v3-contract.json> | --self-test');
      process.exit(2);
    }
    const root = process.cwd();
    const contract = JSON.parse(fs.readFileSync(contractPathArg, 'utf8'));
    const results = runDetectionProofs(contract, {
      root,
      bytesForFixture: (_commandId, fixture) => fs.readFileSync(path.join(root, `${fixture.path}.source`)),
      timestamp: process.env.PROOF_OF_DETECTION_TIMESTAMP ?? new Date().toISOString(),
    });
    const summary = summarizeDetectionProofs(results);
    console.log(formatReceipt(results, summary));
    console.log(`proof-of-detection: unproven-gate count = ${summary.unprovenCount}`);
    process.exitCode = summary.metaGateFailed ? 1 : 0;
  }
}
