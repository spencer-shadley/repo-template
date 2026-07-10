# Plan 019: Harden template verify-gate grep so grep errors aren't masked without set -e

- **Project:** repo-template
- **Branch:** feat/019-harden-template-verify-gate-grep-so-grep-errors-aren-t-maske
- **Status:** ready for user approval
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #48

## Context

Discovery triage accepted #48 after checking the issue against the named code context.
Origin: fleet.
Relevant files: `AGENTS.md`.

## Changes

1. In AGENTS.md TEMPLATE-SELF verify gate, replace `grep -rn '^<''<<<<<<' ... . && exit 1; ec=$?; [ "$ec" -eq 1 ]` with an explicit-capture form, e.g. `ec=0; grep -rn '^<''<<<<<<' ... . || ec=$?; if [ "$ec" -ne 1 ]; then exit 1; fi`, so a conflict match OR a grep execution error (ec>=2) halts immediately, independent of `set -e`.
2. Confirm docs/adr/0002-verify-gate-contract.md and any {{VERIFY_GATE_CMD}} guidance don't duplicate the old pattern; align them if they do.

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Gate exits nonzero on a present conflict marker (unchanged) and zero on a clean tree (unchanged).
- [ ] Gate exits nonzero when grep itself errors (exit>=2, e.g. unreadable path) even when the block is run without `set -e`.
- [ ] No masking: the grep-error failure is not overwritten by the subsequent `node -e` check.

## Verify

```bash
bash -c 'ec=0; grep -rn ZZZNOMATCH /nonexistent 2>/dev/null || ec=$?; if [ "$ec" -ne 1 ]; then echo GATE_FAILS_ON_ERROR; else echo would_pass; fi'
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
