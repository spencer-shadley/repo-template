# Plan 011: Harden TEMPLATE-SELF verify-gate conflict-marker check to pass only on grep exit 1

- **Project:** repo-template
- **Branch:** feat/011-harden-template-self-verify-gate-conflict-marker-check-to-pa
- **Status:** stalled - obsolete
- **Stall-retries:** 1
- **Last-stall:** stalled - obsolete
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #33

## Context

Discovery triage accepted #33 after checking the issue against the named code context.
Relevant files: `AGENTS.md`.

## Changes

1. In the TEMPLATE-SELF verify-gate block of AGENTS.md, replace the `! grep -rn ...` conflict-marker line with a set-e-safe form that passes only on grep exit code 1, e.g. `grep -rn '<''<<<<<<' --include=... . && exit 1; test $? -eq 1` or `{ grep -rn ... .; test $? -eq 1; }` — verify behavior under `set -e` (see #38)
2. Do not touch the {{VERIFY_GATE_CMD}} placeholder block below the /TEMPLATE-SELF marker
3. Disposition the obsolete plan 010 file (archive it) so it does not linger in plans/

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Gate fails when markers exist, fails when grep exits 2, passes when grep exits 1, including under `set -e`
- [ ] {{VERIFY_GATE_CMD}} placeholder section unchanged

## Verify

```bash
bash -ec 'cd /tmp && mkdir -p vg && cd vg && printf x > a.md && grep -rn zzz --include="*.md" . ; test $? -eq 1' && grep -c '{{VERIFY_GATE_CMD}}' AGENTS.md | grep -q '^1$'
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
