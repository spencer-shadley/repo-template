# Plan 014: Fill in repo-template in the live QUEUE.md header

- **Project:** repo-template
- **Branch:** feat/014-fill-in-repo-template-in-the-live-queue-md-header
- **Status:** ready for codex
- **Requeue-reason:** manual: CEO survey approval 2026-07-10 (.ops/human-survey record) - machine-recovery unblock
- **Stall-retries:** 3
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

1. Replace `<project-name>` with `repo-template` in plans/QUEUE.md's header (this repo's live queue); leave the TODO(setup) risk-tier comment intact

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] plans/QUEUE.md header names repo-template; no `<project-name>` placeholder remains in the file

## Verify

```bash
grep -q 'Run queue — repo-template' plans/QUEUE.md && ! grep -q '<project-name>' plans/QUEUE.md
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
