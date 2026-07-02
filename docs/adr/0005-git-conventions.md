# ADR-0005: Git conventions (workspace standard)

- **Status:** accepted (workspace default)
- **Date:** 2026-07-02
- **Deciders:** Spencer Shadley, autonomous-loop maintainers

## Decision

1. **Branches:** work lands via `feat/NNN-<slug>` branches (NNN = plan number); one plan = one
   branch = one PR. Branches are loop-owned single-writer.
2. **Merges:** squash-merge to master; PR title = plan title. Merge FIRST, then archive/bookkeep —
   never archive a plan whose PR is unmerged (it conflicts the PR; cost us twice on 2026-07-02).
3. **Force-push:** `--force-with-lease` is allowed ONLY on `feat/*` branches (loop-owned; local
   state after an approved run is authoritative). NEVER on master — tooling must refuse.
4. **WIP preservation commits use `--no-verify`** — safety-net commits must never be blockable by
   lint/scan hooks (a gitleaks hook once wedged a repo's queue for hours). Hooks still run on
   normal commits.
5. **Never mutate a shared working tree that a loop might be using**: idle-check first; inspect
   via `origin/<branch>` reads or isolated worktrees (`git worktree add --detach`). Bot commits to
   busy repos go through a temp worktree + push. Read-only agents (reviewers, auditors) go
   further: operate on dedicated MIRRORS (fetch + reset, never the live checkout) — convention
   proven by the agent-review system.
6. **Multi-writer pushes** (queue bookkeeping): fetch + rebase-retry loops, or single-commit
   atomic bookkeeping — never blind force.

## Context
Every rule above is a scar from the 2026-07 hardening run (see workspace INCIDENTS): checkout
during a live loop leaked WIP across branches; archive-before-merge conflicted two PRs; a hook
rejection wedged a queue; stale-origin branch reuse false-stalled approved work.
