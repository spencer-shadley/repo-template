#!/usr/bin/env node
// @stack-waiver id="theme-dual-mode-lint" reason="Reference detector fixture for proof-of-detection meta-gate"
// Reference detector used only to prove the proof-of-detection meta-gate works
// (issue #131). It is NOT a product gate of this repo -- repo-template ships no
// themed UI. It exists solely as the fixture-runnable reproduction of the exact
// historical blindness the meta-gate must catch: a hex-only dark-surface regex
// that silently missed every `rgb()` dark surface until 22 of them shipped.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const HEX_PATTERN = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_PATTERN =
  /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)/gi;
const DARK_LUMINANCE_THRESHOLD = 0.2;

function hexToRgb(hex) {
  let body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    body = body.split('').map((c) => c + c).join('');
  }
  return [
    Number.parseInt(body.slice(0, 2), 16),
    Number.parseInt(body.slice(2, 4), 16),
    Number.parseInt(body.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]) {
  const channel = (raw) => {
    const value = raw / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// mode: "luminance" (current, correct) scans hex AND rgb()/rgba() colors.
// mode: "hex-only" (historical, blind) reproduces the exact regression that let
// 22 dark `rgb()` surfaces ship undetected: /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g
function scanForDarkSurfaces(cssText, { mode = 'luminance' } = {}) {
  const findings = [];
  for (const match of cssText.matchAll(HEX_PATTERN)) {
    const luminance = relativeLuminance(hexToRgb(match[0]));
    if (luminance < DARK_LUMINANCE_THRESHOLD) {
      findings.push({ index: match.index, value: match[0], luminance, kind: 'hex' });
    }
  }
  if (mode === 'luminance') {
    for (const match of cssText.matchAll(RGB_PATTERN)) {
      const luminance = relativeLuminance([Number(match[1]), Number(match[2]), Number(match[3])]);
      if (luminance < DARK_LUMINANCE_THRESHOLD) {
        findings.push({ index: match.index, value: match[0], luminance, kind: 'rgb' });
      }
    }
  } else if (mode !== 'hex-only') {
    throw new Error(`unknown mode: ${mode}`);
  }
  return findings.sort((a, b) => a.index - b.index);
}

function runCli(filePath, mode) {
  const text = fs.readFileSync(filePath, 'utf8');
  const findings = scanForDarkSurfaces(text, { mode });
  if (findings.length === 0) {
    console.log(`theme-dual-mode-lint(${mode}): darkFingerprintCss: 0`);
    return 0;
  }
  console.error(`theme-dual-mode-lint(${mode}): darkFingerprintCss: ${findings.length}`);
  for (const finding of findings) {
    console.error(`  ${finding.kind} ${JSON.stringify(finding.value)} luminance=${finding.luminance.toFixed(4)}`);
  }
  return 1;
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined &&
  pathToFileURL(path.resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  const args = process.argv.slice(2);
  const modeArg = args.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'luminance';
  const filePath = args.find((a) => !a.startsWith('--'));
  if (!filePath) {
    console.error('usage: node theme-dual-mode-lint.mjs <css-file> [--mode=luminance|hex-only]');
    process.exit(2);
  }
  process.exitCode = runCli(filePath, mode);
}
