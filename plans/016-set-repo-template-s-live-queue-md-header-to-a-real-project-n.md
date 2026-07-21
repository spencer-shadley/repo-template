# Plan 016: Set repo-template's live QUEUE.md header to a real project name

- **Project:** repo-template
- **Branch:** feat/016-set-repo-template-s-live-queue-md-header-to-a-real-project-n
- **Status:** superseded - objective already satisfied on master (QUEUE.md header reads 'Run queue - repo-template', verified origin 2026-07-20); stall-lifecycle triage AO#1666
- **Requeue-reason:** manual: CEO survey approval 2026-07-10 (.ops/human-survey record) - machine-recovery unblock
- **Stall-retries:** 4
- **Last-stall:** stalled - plan staleness drift
- **Priority:** P3
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #15

## Context

Discovery triage accepted #15 after checking the issue against the named code context.
Relevant files: `plans/QUEUE.md`.

## Changes

1. Replace `<project-name>` in the QUEUE.md header with `repo-template`

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Header reads `# Run queue — repo-template`
- [ ] No `<project-name>` placeholder remains in plans/QUEUE.md

## Verify

```bash
{{VERIFY_GATE_CMD}}
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.

## Retry history

- 2026-07-11T22:49:57.701Z manual (manual): CEO survey approval 2026-07-10 (.ops/human-survey record) - machine-recovery unblock
