# Plan 013: Resolve incidents.jsonl tracked-in-git vs auto-append drain wedge

- **Project:** repo-template
- **Branch:** feat/013-resolve-incidents-jsonl-tracked-in-git-vs-auto-append-drain-
- **Status:** ready for user approval
- **Priority:** P2
- **Effort:** medium

## Objective

Resolve the accepted discovery issue from GitHub triage so the queue can implement the verified finding.

Fixes #40

## Context

Discovery triage accepted #40 after checking the issue against the named code context.
Relevant files: `AGENTS.md`, `.gitignore`.

## Changes

1. Decide and document the wedge-free policy in AGENTS.md's Incident log section: either (a) drain auto-commits a dirty .ops/incidents.jsonl before proceeding (document the expected `ops: incidents (auto)` commit), or (b) untrack the active log (gitignore it) and track only rotated .ops/archive/ files — update template-manifest.json accordingly if (b)
2. State WHICH incident motivates the change (fingerprint 43efffab9ecedf82, repeated abort-dirty drains) per change discipline
3. Update CHANGELOG [Unreleased]

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] AGENTS.md no longer prescribes a combination where an auto-appended active log blocks drains
- [ ] Chosen policy is internally consistent across AGENTS.md, .gitignore, and template-manifest.json

## Verify

```bash
grep -n 'incidents.jsonl' AGENTS.md .gitignore template-manifest.json
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
