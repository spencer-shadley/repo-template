# Plan 041: Red master: fix the knip stage of pnpm verify (rt#306)

> **Planning SSOT (read this before editing Priority / Depends):** Within-repo selection and
> dependency inheritance read the **linked GitHub issue**, the **plan DAG**, and **WorkProjection**,
> not this plan file.
>
> | Concern | Authoritative surface | Plan markdown |
> |---|---|---|
> | Fleet / repo priority | GH labels `priority:fleet:pN` / `priority:repo:pN` (via `gh issue-edit` / intake) | `- **Priority:**` is a **legacy mirror only** — changing it alone does **not** change selection |
> | Dependencies | GH native `--blocked-by` / `--blocking` on the linked issue; plan DAG + WorkProjection | `- **Depends:**` is a **plan-DAG projection input** — the GitHub-native edge is authoritative |
>
> **When planning discovers a priority or dependency change, update the GitHub issue in the same
> turn** (labels and/or `blocked-by` edges). Do not leave the truth only in plan markdown. Planning
> may refine edges as the chain becomes clearer; selection consumes whatever GH currently says.
> See [issue-work-spine](https://github.com/spencer-shadley/code/blob/master/docs/guides/issue-work-spine.md)
> · [github-best-practices](https://github.com/spencer-shadley/code/blob/master/docs/guides/github-best-practices.md).

- **Project:** repo-template
- **Branch:** feat/041-red-master-fix-the-knip-stage-of-pnpm-verify-rt-306
- **Status:** blocked - stalled (needs triage)
- **Conservation-outcome:** blocked-visible: no-successor-reference
- **Escalated:** 2026-08-30
- **Stall-retries:** 1
- **Last-stall:** ExplicitRunLoopError: issue attempt admit refused (scope_write_required): formal Concurrency/Scope-write block is invalid (invalid-service-class) [sha256:bf46b73ed2e11115]
- **Issue:** spencer-shadley/repo-template#306
- **WorkItemId:** ae19c7b4-79d1-4523-9b78-c669d1d57dc2
     it, stamps a stable UUID `WorkItemId` when absent, and treats this relationship as `fixes`. -->
<!-- Preserve an existing `- **WorkItemId:** <uuid>` exactly across retries/successors. Additional
     relationships use explicit `Fixes owner/repo#N`, `Partially addresses owner/repo#N`, or
     `Relates-to owner/repo#N`. Never use an unqualified cross-repository issue number. -->
- **Priority:** P1
     `priority:fleet:pN` / `priority:repo:pN`, then GH `blocked-by` inheritance, effort, weighted
     unblock leverage, furthest work:*, oldest createdAt, then Pending FIFO. If priority changes
     during planning, **edit the GH issue labels this turn**; do not rely on this field. Historical
     P1|P2|P3 remain fallback only when GH dims are missing. -->
<!-- Optional: `- **Depends:** 083, 085` — plan-DAG projection input. The GitHub-native
     `--blocked-by` / `--blocking` edge on the linked issue is authoritative for selection
     inheritance + unblock leverage (WorkProjection + plan DAG). When you add/change Depends
     during planning, **also** set the matching GH edges this turn. This plan never starts
     before every listed plan-dep has MERGED (archived). enqueue-plan rejects
     unknown/cyclic/dead deps. Omit or `none` => no plan-local deps.
     Cross-repo (AO#5063): also accept `projectId/NNN` tokens, e.g. `Depends: 083, repo-template/028`,
     or `- **Cross-Depends:** repo-template/028`. Drain skips with `cross-repo-dep-unmet` until the
     foreign plan is archived/merged/retired. Comment prose ("sequence AFTER …") is NEVER a dep. -->
- **Effort:** medium
     (NOT size). Start LOW for simple/mechanical changes (CSS, copy, a small handler) for fast turns;
     medium for typical features; high for genuinely tricky logic. A review failure auto-escalates +1
     rung, so under-shooting self-corrects. Omit => medium. -->
<!-- Rarely needed: `- **Model:** pro` starts the implementer at gpt-5.5-pro. Starting at pro should be
     HIGHLY RARE — almost never set it. The ladder REACHES pro on its own (gpt-5.5 low→medium→high→xhigh,
     THEN pro) when a plan repeatedly fails review, so let escalation decide instead of pre-selecting it.
     pro is slower, pricier, and has weaker code-editing tools, so a wrong pro start is costly both ways.
     Default = omit (gpt-5.5) and pick Effort by complexity. Reserve an upfront pro ONLY for a genuinely
     unknown, deeply-hard root cause where you want to skip the climb — and even then, prefer the ladder. -->
- **Concurrency:** exclusive
     "this plan takes full-repo custody" — identical to how every plan without this block already
     behaves. Only declare `parallel-safe` when you can enumerate EVERY path this plan writes, below.
     A WRONG declaration is far worse than no declaration: absent means "run me alone", wrong means
     "two lanes write the same file believing they are disjoint". -->
- **Scope-write:** package.json, pnpm-lock.yaml, scripts
     plan may write, e.g. `lib/foo.ts,lib/foo.test.mjs`. A directory covers everything under it.
     NO GLOBS: the lease comparator is literal prefix matching, so `lib/*` would be treated as a file
     literally named `lib/*` and judged disjoint from `lib/foo.mjs` (#4675) — globs are rejected at
     parse time. Must be exhaustive: anything you write that is not listed escapes custody. Remember
     this plan's own file if its Status will be updated. -->
- **Scope-read:** none   <!-- Literal paths this plan reads but never writes. Advisory only; not leased. -->
- **Scope-resource:** none   <!-- Named non-path resources this plan needs exclusively, e.g. a port or
     an external service handle. Leased separately from paths. -->
- **Service class:** medium   <!-- short | medium | long — expected HOLD DURATION of this plan's
     custody, used for verification scheduling. Not the same axis as Effort. -->
<!-- The five fields above are ONE block and are parsed together: a partial block does not parse at all
     and is silently ignored (#4678). Keep all five, or delete all five. Check your plan with
     `node tools/validate-plan-scope.mjs` — it exits non-zero on a malformed declaration. -->

## Objective

Turn the shared land gate green on origin/master so repo-template changes stop requiring
--allow-pre-existing break-glass.

## Context

A red shared gate is P1 by construction (DOCTRINE section 46), and this one fails at the first
stage of `verify`, so nothing after knip is ever validated for any repo-template PR.

The linked issue carries the full error, a base differential that ran twice and agreed
(classification pre-existing, verdict same-failure), and a repro. Read it first.

There are two candidate roots and the issue documents both. `oxc-parser` cannot load its
platform binding; separately, every stack frame resolves under an unrelated sibling worktree's
`node_modules` rather than the one the gate is running in. Establish which is the root before
changing anything.

## Changes

Make knip run. Fix the cause rather than silencing the stage - do not widen an ignore, skip
knip, or disable the binding check to reach green. If the sibling-worktree resolution turns out
to be the root, fix the resolution; if it is the missing optional dependency, fix the install.

## Applicable governance (material choices only)

- [ ] Considered where relevant: `PRIORITIES.md`; `DOCTRINE.md`; architecture/decision records; and
  the full applicable `AGENTS.md` breadcrumb chain from `C:\code\AGENTS.md` through every ancestor
  `AGENTS.md` between the workspace root and each changed path.

Delete this section when the change presents no material governance tradeoff and recording it would
add no decision-relevant evidence. Applicability follows actual hazards and choices, not an
enumerated change-type allowlist. Do not add per-principle prose merely to fill the template.

## Out of scope

Changing what knip checks. The tolerant secret-scan work in repo-template#302 / plan 040 is a
separate candidate and must not be folded in here.

## Acceptance criteria

- `corepack pnpm verify` exits 0 on a fresh worktree at origin/master.
- knip resolves oxc-parser's platform binding; the failure is fixed, not ignored.
- Tooling invoked by `verify` resolves within the worktree it runs in, not a sibling.
- No `node_modules` junction shared with the canonical install was purged to achieve it.
- The next repo-template change lands without `--allow-pre-existing`.

## Verify

```bash
corepack pnpm verify
```

`pnpm verify` (local-ci.json) is repo-template's authoritative gate and is exactly what is red.

**Do not reinstall blind.** The error text suggests removing `node_modules` and reinstalling;
worktree `node_modules` here are junctions to a canonical install, so purging one can damage
the shared tree. Determine the root before deleting anything.

## Risk

- **Tier:** auto
- **Rationale:** Reversible dependency/script change restoring an existing gate to green; no
  external or production effect. The one genuine hazard - purging a shared junctioned install -
  is called out explicitly in Verify and excluded by an acceptance criterion.

## Work-item bounds

- **Success:** gate green on origin/master; obligation issue closed.
- **Terminal failure:** typed block recorded as a comment on the linked issue.
- **Deadline:** 2026-08-31T00:00:00Z
- **Repair-round budget:** 2
- **TTL:** implement -> verify -> at most 2 repair rounds -> land.
- **Rollback:** ordinary revert; branch and receipts remain.

## Notes / risks

<Optional: edge cases, rollback plan, perf or security considerations, follow-ups to file later.>
