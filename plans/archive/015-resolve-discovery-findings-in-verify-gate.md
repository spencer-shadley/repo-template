# Plan 015: Resolve discovery findings in verify-gate

- **Project:** repo-template
- **Branch:** feat/015-resolve-discovery-findings-in-verify-gate
- **Status:** ready for user approval
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issues from GitHub triage so the queue can implement the verified finding.

Fixes #33
Fixes #45

## Context

Discovery triage accepted #33, #45 after checking the issue against the named code context.
Relevant files: `AGENTS.md`, `template-manifest.json`.

## Changes

1. Replace `! grep -rn ...` in the TEMPLATE-SELF verify gate with an explicit exit-code check that treats 0 (found) and >=2 (error) as failure and only 1 (not found) as pass, e.g. run grep and branch on `$?`.
2. Extend the missing-manifest exclusion in the node -e gate to skip dynamically-generated queue artifacts under plans/ (e.g. add `!f.startsWith('plans/')` alongside the existing `.ops/archive/` skip), OR make plan enrollment auto-append the plan path to the manifest
3. Ensure the chosen approach stays consistent with adopt-project's wholesale plans/ reset so nothing is orphaned on instantiation

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Gate exits non-zero when a conflict marker is present
- [ ] Gate exits non-zero when grep itself errors (exit 2)
- [ ] Gate passes only when grep exits 1 (no markers)
- [ ] Adding a new plan file under plans/ no longer fails the verify gate
- [ ] Non-plan tracked files are still enforced against the manifest
- [ ] adopt-project reset behavior for plans/ is unaffected

## Verify

```bash
bash -c 'grep -rn "^<""<<<<<<" --include="*.md" . && exit 1; ec=$?; [ "$ec" -eq 1 ]'
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
