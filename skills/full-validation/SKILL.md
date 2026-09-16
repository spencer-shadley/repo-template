---
name: full-validation
description: >-
  Run the complete authoritative validation suite for spencer-shadley/repo-template at an exact
  commit SHA for asynchronous post-land/default-branch health validation and red recovery. This file
  is also the reference shape for repo-local full-validation skills; consumers must point at their
  own authoritative gate rather than blindly copying this repo's command.
---

# Full validation — repo-template

Fresh-read `AGENTS.md` and `package.json`, fetch the requested SHA, and validate from a clean isolated
checkout/worktree whose full HEAD SHA matches it. Never edit source/config/baselines, suppressions,
snapshots, generated expectations, or lockfiles to obtain green.

## Authoritative suite

`package.json` → `scripts.verify` is authoritative. Fresh-read it every run and execute the complete
entry point without pruning:

```text
corepack pnpm verify
```

Use the pinned package manager and lockfile-preserving dependency setup only when needed.

## Result

`PASS` = every authoritative step passed at the requested SHA. `FAIL` = the suite ran and an
authoritative step failed. `UNABLE` = environment/tooling/checkout prevented execution; include the
exact unblock. Older-SHA evidence never proves a newer default tip green.

Emit `full-validation-result-v1` with repository, requested SHA, tested SHA, command, result, exit
code, elapsed time, environment/host identity, and diagnostic evidence.

## Template rule

When Repo Factory or template adoption propagates this capability, each destination repo must replace
this repository-specific command/source section with its own authoritative full-suite entry point.
The stable contract is exact-SHA exhaustive validation plus the PASS/FAIL/UNABLE receipt, not a
particular package manager.