# Plan 007: Define a machine-checkable canary-green criterion for fleet rollout

- **Project:** repo-template
- **Branch:** feat/007-define-a-machine-checkable-canary-green-criterion-for-fleet-
- **Status:** stalled - obsolete
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
{{VERIFY_GATE_CMD}}
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
