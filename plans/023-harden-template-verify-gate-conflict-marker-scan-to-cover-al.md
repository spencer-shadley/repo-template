# Plan 023: Harden template verify-gate conflict-marker scan to cover all tracked files

- **Project:** repo-template
- **Branch:** feat/023-harden-template-verify-gate-conflict-marker-scan-to-cover-al
- **Status:** ready for codex
- **Stall-retries:** 1
- **Last-stall:** stalled - needs attention
- **Priority:** P3
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #34

## Context

Discovery triage accepted #34 after checking the issue against the named code context.
Origin: fleet.
Relevant files: `AGENTS.md`.

## Changes

1. Replace the hardcoded --include extension whitelist in the TEMPLATE-SELF verify-gate conflict-marker grep with a scan over the tracked-file set (git ls-files), mirroring the manifest check, so every artifact type is covered automatically.
2. Preserve the existing exit-code contract (grep exit 1 = no markers = pass; any match = fail) and handle the no-files/binary edge cases (e.g. NUL-delimited xargs).

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] A conflict marker introduced into any tracked non-md/yml/json/jsonl file is caught by the gate.
- [ ] Adding a new artifact type to the repo requires no update to the conflict-marker check to gain coverage.
- [ ] The verify gate still exits 0 on a clean tree and non-zero when a marker is present.

## Verify

```bash
ec=0; git ls-files -z | xargs -0 grep -n '^<''<<<<<<' || ec=$?; if [ "$ec" -ne 1 ]; then exit 1; fi
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
