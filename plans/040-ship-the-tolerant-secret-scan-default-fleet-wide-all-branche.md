# Plan 040: Ship the tolerant secret-scan default fleet-wide, all branches (rt#302)

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
- **Branch:** feat/040-ship-the-tolerant-secret-scan-default-fleet-wide-all-branche
- **Status:** stalled - obsolete (duplicate path-scope of 039)
- **Stall-retries:** 1
- **Last-stall:** duplicate-path-scope
- **Issue:** spencer-shadley/repo-template#302
- **WorkItemId:** 1d0dab6e-b1c7-4903-9bee-4b6bfd57b6e0
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
- **Scope-write:** packages/repo-quality
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

Ship a tolerant secret-scan default to every fleet repository, on all branches, so false
positives stop blocking delivery.

## Context

Spencer, 2026-08-26, verbatim: "security is rarely an issue - only false positives. we should
tune to be more tolerant" and "in all branches and by default I almost never care about
security. it's almost always way too strict."

That is a standing CEO ruling and it applies fleet-wide and to all branches - not a per-repo
opt-in and not main-branch-only. A secret-scan false positive is never an operator audit ask.

**Note on the detector names in this plan.** They are described by family rather than by literal
prefix on purpose: an earlier round of this plan quoted the literal prefixes, the plan critic echoed
them back inside a finding, and its own output-schema validator rejected that quote as unsafe
evidence - killing the enqueue after six seated attempts. That is the same over-strict
false-positive behavior this work item exists to fix, reproduced one layer up in the toolchain.
Tracked separately; do not reintroduce literal prefixes here.

## Changes

Make the tolerant profile the default **in repo-template**. Keep only high-signal detectors with
low false-positive rates - vendor API-key prefixes, GitHub personal-access-token prefixes, AWS access-key identifiers,
PEM private-key blocks, and JWTs - and drop the fuzzy
entropy-style heuristics that generate the noise. Configure it to apply on all branches, not only
the default branch.

## Applicable governance (material choices only)

- [ ] Considered where relevant: `PRIORITIES.md`; `DOCTRINE.md`; architecture/decision records; and
  the full applicable `AGENTS.md` breadcrumb chain from `C:\code\AGENTS.md` through every ancestor
  `AGENTS.md` between the workspace root and each changed path.

Delete this section when the change presents no material governance tradeoff and recording it would
add no decision-relevant evidence. Applicability follows actual hazards and choices, not an
enumerated change-type allowlist. Do not add per-principle prose merely to fill the template.

## Out of scope

**Adoption in downstream fleet repositories.** Propagating this default to other repos is a
separate, individually verified plan per DOCTRINE section 11; this work item changes repo-template
only and is verified inside repo-template's own custody.

Also out of scope: removing secret scanning entirely, and any change to real leak-response
procedure in SECURITY.md.

## Acceptance criteria

- The tolerant profile is the template default in repo-template.
- It applies on all branches, not only the default branch.
- The named high-signal detectors still fire; the fuzzy heuristics do not.
- A fixture with a known false-positive shape passes, and a fixture with a real AWS access-key identifier, GitHub token, or PEM private-key block still fails.

## Verify

```bash
corepack pnpm verify
```

`pnpm verify` (local-ci.json) is repo-template's authoritative gate and exercises
`packages/repo-quality` and secret-scan verification; `pnpm test` alone only runs
`packages/adoption-shell/test/*.test.ts` and would not cover this change.

## Risk

- **Tier:** auto
- **Rationale:** Reversible source change with tests and no external or production effect;
  ordinary revert restores the prior behavior.

## Work-item bounds

- **Success:** acceptance criteria met and the change is on `origin/master`.
- **Terminal failure:** typed block recorded as a comment on the linked issue.
- **Deadline:** 2026-08-31T00:00:00Z
- **Repair-round budget:** 2
- **TTL:** implement -> verify -> at most 2 repair rounds -> land.
- **Rollback:** ordinary revert; branch and receipts remain.

## Notes / risks

<Optional: edge cases, rollback plan, perf or security considerations, follow-ups to file later.>
