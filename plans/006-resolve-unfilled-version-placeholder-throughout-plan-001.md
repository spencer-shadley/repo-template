# Plan 006: Resolve unfilled version placeholder throughout plan 001

- **Project:** repo-template
- **Branch:** feat/006-resolve-unfilled-version-placeholder-throughout-plan-001
- **Status:** ready for codex
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #2

## Context

Discovery triage accepted #2 after checking the issue against the named code context.
Relevant files: `plans/001-workspace-context-section-every-repo-lives-under-the-code-wo.md`.

## Changes

1. Replace every occurrence of the literal 'the next MINOR above the current TEMPLATE_VERSION at implementation time' with the concrete next-MINOR semver resolved from the current TEMPLATE_VERSION at write time (title, Changes step 3 CHANGELOG heading, Changes step 4 TEMPLATE_VERSION value, all acceptance-criteria bullets).
2. Fix the inverted verify grep so it asserts a real semver is present (e.g. grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' TEMPLATE_VERSION) instead of matching the placeholder literal.

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Plan file contains no occurrence of the placeholder literal.
- [ ] TEMPLATE_VERSION target and CHANGELOG heading are a concrete semver.
- [ ] Verify gate asserts a real semver in TEMPLATE_VERSION and passes only after the plan is applied.

## Verify

```bash
{{VERIFY_GATE_CMD}}
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
