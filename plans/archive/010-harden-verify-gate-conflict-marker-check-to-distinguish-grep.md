# Plan 010: Harden verify-gate conflict-marker check to distinguish grep exit 1 from exit 2

- **Project:** repo-template
- **Branch:** feat/010-harden-verify-gate-conflict-marker-check-to-distinguish-grep
- **Status:** parked - stalled x3 (needs triage)
- **Stall-retries:** 3
- **Last-stall:** stalled - needs attention
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #33

## Context

Discovery triage accepted #33 after checking the issue against the named code context.
Relevant files: `AGENTS.md`.

## Changes

1. In the TEMPLATE-SELF verify-gate block of AGENTS.md, replace '! grep -rn ...' with a form that passes only on exit code 1, e.g.: grep -rn '<''<<<<<<' --include=... .; [ $? -eq 1 ]
2. Do NOT touch the {{VERIFY_GATE_CMD}} placeholder block below the /TEMPLATE-SELF marker — placeholders there are intentional template content

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Verify gate fails (non-zero) when grep exits 2, still fails when markers are found, and passes when grep exits 1
- [ ] The {{VERIFY_GATE_CMD}} placeholder section is unchanged

## Verify

```bash
grep -n 'eq 1' AGENTS.md && grep -c '{{VERIFY_GATE_CMD}}' AGENTS.md | grep -q '^1$'
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
