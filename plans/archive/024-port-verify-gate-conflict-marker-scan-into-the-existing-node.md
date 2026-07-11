# Plan 024: Port verify-gate conflict-marker scan into the existing Node script

- **Project:** repo-template
- **Branch:** feat/024-port-verify-gate-conflict-marker-scan-into-the-existing-node
- **Status:** ready for user approval
- **Priority:** P3
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #35

## Context

Discovery triage accepted #35 after checking the issue against the named code context.
Origin: fleet.
Relevant files: `AGENTS.md`.

## Changes

1. Replace the bash `grep -rn '^<<<<<<<'` scan and its `if [ "$ec" -ne 1 ]` exit-code negation with an equivalent conflict-marker scan folded into the existing `node -e` manifest check, so the whole gate is a single Node invocation with no bash-specific constructs.
2. Preserve the same file-type coverage the grep had (*.md, *.yml, *.json, *.jsonl, TEMPLATE_VERSION) and the same fail-on-marker semantics.
3. Update docs/adr/0002-verify-gate-contract.md and any {{VERIFY_GATE_CMD}} guidance if the gate shape changes.

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Verify gate detects a planted conflict marker and exits non-zero with no reliance on grep or bash exit-code negation.
- [ ] Gate runs successfully under Windows PowerShell with no bash shell present.
- [ ] Existing manifest check (unmanifested / invalid-mode detection) still passes unchanged.

## Verify

```bash
node -e "process.exit(0)" && echo gate-runs-under-node
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
