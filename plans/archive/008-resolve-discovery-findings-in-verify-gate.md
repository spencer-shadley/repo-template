# Plan 008: Resolve discovery findings in verify-gate

- **Project:** repo-template
- **Branch:** feat/008-resolve-discovery-findings-in-verify-gate
- **Status:** ready for user approval
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issues from GitHub triage so the queue can implement the verified finding.

Fixes #27
Fixes #28

## Context

Discovery triage accepted #27, #28 after checking the issue against the named code context.
Relevant files: `AGENTS.md`.

## Changes

1. Add --include='*.jsonl' to the conflict-marker grep in the TEMPLATE-SELF verify gate.
2. Update the inline node manifest check to skip tracked paths under .ops/archive/ when computing the unmanifested (missing) set, so rotated incident logs don't fail the gate.

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] The verify-gate conflict-marker grep scans *.jsonl files.
- [ ] A conflict marker in .ops/incidents.jsonl fails the gate.
- [ ] A tracked .ops/archive/incidents-*.jsonl file does not cause the manifest verify gate to fail.
- [ ] Non-archive tracked files still require a manifest entry.

## Verify

```bash
grep -n "include='\*.jsonl'" AGENTS.md
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
