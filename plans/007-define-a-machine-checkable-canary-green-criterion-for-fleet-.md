# Plan 007: Define a machine-checkable canary-green criterion for fleet rollout

- **Project:** repo-template
- **Branch:** feat/007-define-a-machine-checkable-canary-green-criterion-for-fleet-
- **Status:** ready for codex
- **Stall-retries:** 1
- **Last-stall:** stalled - obsolete
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #21

## Context

Discovery triage accepted #21 after checking the issue against the named code context.
Relevant files: `docs/MIGRATION.md`.

## Changes

1. Replace the honor-system 'green' definition in the Rollout order section with a concrete gate a fleet-rollout agent can block on: e.g. a timestamped sentinel file written by the canary's post-drain step, and/or a minimum elapsed time after the canary merge timestamp before fleet migration plans may be enqueued.
2. Specify what 'attributable to the migration' means in machine-checkable terms (e.g. incident lines tagged with the migration/plan id).

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] The Rollout order section defines a machine-readable or time-based signal that a fleet-rollout agent can wait on before enqueueing fleet plans.
- [ ] No remaining honor-system language for the canary-green gate.

## Verify

```bash
! grep -rn '<''<<<<<<' --include='*.md' --include='*.yml' --include='*.json' --include='*.jsonl' --include='TEMPLATE_VERSION' .
node -e "const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const {execSync}=require('child_process');const tracked=execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>`${k}:${v}`);if(missing.length||invalid.length){if(missing.length)console.error('unmanifested:',missing);if(invalid.length)console.error('invalid manifest modes:',invalid);process.exit(1)}"
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
