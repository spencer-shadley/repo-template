# ADR-0001: Design philosophies for this repo

- **Status:** proposed  <!-- TODO(setup): answer every survey question below, then mark accepted -->
- **Date:** <!-- TODO(setup) -->

These defaults come from fleet-wide learnings (2026-07 hardening run). Overriding any of them is
fine — record WHY here.

## Survey

1. **Error handling** — fail-fast or degrade-with-notice?
   <!-- TODO(setup): choose per surface. Workspace default: user-facing surfaces degrade with a
        visible notice; pipelines/batch fail fast. Silent catch blocks are always a defect. -->
2. **External side effects** (APIs, email, user data) — what confines them?
   <!-- TODO(setup): every external call site needs: rate limiting/backoff (429-aware), a circuit
        breaker for repeated failure, and a reversibility note. Lesson: a blocked provider token is
        EXISTENTIAL; bad code is revertible, consumed quota is not. Additionally (convention
        proven in sharingan): DESTRUCTIVE ops (delete/move/overwrite user data) require
        multi-attribute identity verification gates before acting (never single-key matching),
        fail-closed on any uncertainty, and write a JSONL audit ledger row for every action. -->
3. **Testing depth** — what layers, and what does the verify gate run?
   <!-- TODO(setup): the loop's verify gate is the REAL quality bar (merge-blocking, runs locally).
        It must cover every artifact type in the repo and be environment-honest: browser/docker/
        display-dependent steps must probe availability and skip-with-notice rather than hang
        (a 30-min hang burns ~5 codex turns; see workspace INCIDENTS 2026-07-02). -->
4. **CI posture** — GitHub Actions is ADVISORY in this workspace (quota-immune local worktree CI is
   the merge gate). <!-- TODO(setup): list what Actions still runs (security scans etc.) -->
5. **State & data** — pick the storage rung via ADR-0004's ladder; if a DB: declare disposable-vs-durable, and durable REQUIRES migrations+backups+restore recipe day one.
   <!-- TODO(setup) -->
6. **Dependency posture** — pinned? vendored (never lint/modify vendored code)? update cadence?
   <!-- TODO(setup) -->
7. **Hooks policy** — pre-commit hooks allowed, but they must never block the loop's
   WIP-preservation commits (which use --no-verify BY DESIGN — a lint hook once wedged a whole
   repo's queue for hours). <!-- TODO(setup): list hooks + what each enforces -->
8. **Post-merge obligations** — anything that must happen after a merge to be truly "done"?
   <!-- TODO(setup): e.g. container redeploy so localhost serves the new code; design-system sync;
        docs/tutorial refresh when user-facing behavior changes. -->

## Decision
<!-- TODO(setup): summarize the answers in 5 lines once accepted. -->
