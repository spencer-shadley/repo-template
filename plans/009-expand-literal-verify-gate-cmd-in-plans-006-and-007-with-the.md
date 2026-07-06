# Plan 009: Expand literal {{VERIFY_GATE_CMD}} in plans 006 and 007 with the real verify gate and reset their statuses

- **Project:** repo-template
- **Branch:** feat/009-expand-literal-verify-gate-cmd-in-plans-006-and-007-with-the
- **Status:** ready for codex
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #31

## Context

Discovery triage accepted #31 after checking the issue against the named code context.
Relevant files: `plans/006-resolve-unfilled-version-placeholder-throughout-plan-001.md`, `plans/007-define-a-machine-checkable-canary-green-criterion-for-fleet-.md`.

## Changes

1. Replace the {{VERIFY_GATE_CMD}} literal in the ## Verify block of plans/006-*.md and plans/007-*.md with this repo's actual verify gate from the TEMPLATE-SELF block of AGENTS.md (conflict-marker grep + manifest node check)
2. Reset plan 006 status from 'stalled - env: ...' to 'ready for codex'
3. Reset plan 007 status from 'stalled - obsolete' to 'ready for codex' (its underlying issue #21 remains unimplemented; the stall was caused by the placeholder, not obsolescence)

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Neither plan file contains any {{...}} token
- [ ] Both plans' Verify blocks contain the repo's real gate commands
- [ ] Both plans' Status fields no longer read stalled

## Verify

```bash
! grep -n '{{' plans/006-resolve-unfilled-version-placeholder-throughout-plan-001.md plans/007-define-a-machine-checkable-canary-green-criterion-for-fleet-.md && ! grep -n 'Status.*stalled' plans/006-resolve-unfilled-version-placeholder-throughout-plan-001.md plans/007-define-a-machine-checkable-canary-green-criterion-for-fleet-.md
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
