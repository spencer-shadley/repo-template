# Plan 038: Publish deterministic npm artifact for repo-quality and verify real consumer install (#299)

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
- **Branch:** feat/038-publish-deterministic-npm-artifact-for-repo-quality-and-veri
- **Status:** draft   <!-- draft | ready for implement | ready for implement (legacy) | implemented | verified -->
- **Issue:** owner/repository#123   <!-- Primary lifecycle edge. enqueue-plan repository-qualifies
     it, stamps a stable UUID `WorkItemId` when absent, and treats this relationship as `fixes`. -->
<!-- Preserve an existing `- **WorkItemId:** <uuid>` exactly across retries/successors. Additional
     relationships use explicit `Fixes owner/repo#N`, `Partially addresses owner/repo#N`, or
     `Relates-to owner/repo#N`. Never use an unqualified cross-repository issue number. -->
- **Priority:** P2   <!-- LEGACY MIRROR ONLY — selection SSOT is the linked GH issue's
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
- **Effort:** medium   <!-- low | medium | high — STARTING reasoning effort by apparent complexity
     (NOT size). Start LOW for simple/mechanical changes (CSS, copy, a small handler) for fast turns;
     medium for typical features; high for genuinely tricky logic. A review failure auto-escalates +1
     rung, so under-shooting self-corrects. Omit => medium. -->
<!-- Rarely needed: `- **Model:** pro` starts the implementer at gpt-5.5-pro. Starting at pro should be
     HIGHLY RARE — almost never set it. The ladder REACHES pro on its own (gpt-5.5 low→medium→high→xhigh,
     THEN pro) when a plan repeatedly fails review, so let escalation decide instead of pre-selecting it.
     pro is slower, pricier, and has weaker code-editing tools, so a wrong pro start is costly both ways.
     Default = omit (gpt-5.5) and pick Effort by complexity. Reserve an upfront pro ONLY for a genuinely
     unknown, deeply-hard root cause where you want to skip the climb — and even then, prefer the ladder. -->
- **Concurrency:** exclusive   <!-- exclusive | parallel-safe. EXCLUSIVE IS THE SAFE DEFAULT and means
     "this plan takes full-repo custody" — identical to how every plan without this block already
     behaves. Only declare `parallel-safe` when you can enumerate EVERY path this plan writes, below.
     A WRONG declaration is far worse than no declaration: absent means "run me alone", wrong means
     "two lanes write the same file believing they are disjoint". -->
- **Scope-write:** none   <!-- `none`, or a comma-separated list of LITERAL repo-relative paths this
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

<1–2 sentences: the outcome this produces and why it matters. No implementation detail here.>

## Context

<What the implementer needs to know to do THIS task and nothing more:
- relevant files/paths (link them exactly)
- current behavior / where it lives
- constraints, related decisions, prior art>

## Changes

<Ordered, file-by-file. Describe intent and the shape of the change. Be specific enough to
remove ambiguity, but don't dictate every line unless a detail is load-bearing.>

1. `path/to/file` — <what changes and why>
2. `path/to/other` — <...>

## Applicable governance (material choices only)

- [ ] Considered where relevant: `PRIORITIES.md`; `DOCTRINE.md`; architecture/decision records; and
  the full applicable `AGENTS.md` breadcrumb chain from `C:\code\AGENTS.md` through every ancestor
  `AGENTS.md` between the workspace root and each changed path.

Delete this section when the change presents no material governance tradeoff and recording it would
add no decision-relevant evidence. Applicability follows actual hazards and choices, not an
enumerated change-type allowlist. Do not add per-principle prose merely to fill the template.

## Out of scope

<Explicitly list what NOT to touch. This is the guardrail against scope creep — be generous.>

- <...>

## Acceptance criteria

<Objectively verifiable checklist. If you can't test it, rewrite it until you can.>

- [ ] <observable behavior / state>
- [ ] <...>

## Verify


<!-- RULE (2026-07-02b): if your Changes introduce a NEW RUNTIME ARTIFACT (lock/state/log file the orchestrator writes while operating), you MUST register it in the shared transient-pattern list (see plan 083 / lib transient patterns) in the SAME plan. An unregistered runtime file makes drain preflights abort-dirty and starves the fleet — this caused two same-day outages (tree-lock, anomaly-sweep state, 2026-07-02). -->
<!-- RULE (2026-07-02): the gate must validate EVERY artifact type your Changes touch — yaml: parse it, json: parse it, sh: bash -n, cmd/vbs: exist, synced .ts: parse. A green gate that skips an artifact class ships broken files (learned from flow.yaml). Also: do NOT prefix verify with cd <project> — run-loop runs the gate INSIDE the project dir already (until #78 lands). -->
<!-- Verify gates pass Docker arguments unconverted; reference orchestrator tooling by canonical anchor, e.g. "$ORCH_DIR/queue-status.mjs", never by a workspace-relative path. -->
<The FIRST fenced bash block under this heading is the loop's HARD GATE — run-loop.mjs runs it
after every Codex turn and only proceeds to review if it exits 0. Put the full validation here,
not just unit tests. For any change that touches runtime/UI/routes, that means: static checks →
rebuild & redeploy the app → smoke the deployed server → end-to-end (Playwright). Copy the
project's real scripts so there's no guessing. Keep commands non-interactive and `&&`-chained so
the first failure stops the gate.>

```bash
# Static checks
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm build && corepack pnpm test
# Ensure the Docker engine is up (cold starts can take minutes), then rebuild + redeploy
until docker info >/dev/null 2>&1; do sleep 10; done
# Browser/CDP-dependent gates (chrome|chromium|msedge|playwright|puppeteer|test-extension):
# run-loop cheap-checks for a usable browser binary before the first implement turn and stalls
# as `browser unavailable in drain env` when absent — do not burn model iterations on CDP crashes.
# Mirror the docker wait pattern when you must keep a browser gate: document the host dependency.
docker compose up -d --build app
# Smoke the DEPLOYED server (retry until healthy), then run e2e against it
until curl -fs http://127.0.0.1:3000/health >/dev/null; do sleep 3; done
E2E_BASE_URL=http://127.0.0.1:3000 corepack pnpm e2e
```

<Playwright/e2e is OPUS'S CALL per plan — include it by DEFAULT, since most changes touch the UI or a
route the specs exercise. OMIT the deploy/e2e lines only when you're confident the change has no
user-facing or behavioral impact: docs, config/tooling, a pure non-UI refactor, or a trivial change
covered by unit tests. When in doubt, keep e2e. State the choice in one line (e.g. "no e2e — tooling
only" or "e2e included — touches the graph canvas") so the reviewer sees it was deliberate. The e2e
suite honors `PW_WORKERS` (parallelism is configurable; higher = faster but may flake — CI logs the
worker count and flaky specs), so a heavy/slow suite is not itself a reason to skip it. If the drain
host lacks Chrome/Edge/Chromium, browser-referencing Verify stalls immediately (AO#132) rather than
retrying; prefer omitting e2e on hosts that cannot provide a browser, or ensure one is installed.>

<Design-system sync: if the project keeps a synced design system (its AGENTS.md will say so — e.g.
a claude.ai/design project) and this change touches exported components, styles, or design tokens,
add the design-bundle rebuild to the gate so the bundle is proven to still build, and state in the
plan that a re-sync upload is required. The upload itself needs an interactive, authorized terminal,
so the loop flags it rather than performing it.>

After the gate, list any manual/visual checks (specific screens, viewports, interactions) the
reviewer or user should still confirm, plus any design re-sync the change requires.

## Risk

- **Tier:** auto   <!-- auto | human; use the effective-risk contract, not blast-radius intuition. -->
- **Rationale:** <named hazard and why this tier controls it>
<!-- If the plan performs a permanent-gate effect, declare it here, for example:
     `- **Permanent gates:** gate.external-publishing`.
     Include an `## Approval provenance` block with sourceKind, human, approvedAt, approvalRef,
     decision, and `gateAcks: gate.external-publishing`. The issue→plan and completed-lineage
     outboxes fail closed before GitHub when the declared gate lacks its approval reference. -->

## Work-item bounds

- **Success:** <exact terminal evidence, including required landing/obligation proof>
- **Terminal failure:** <typed terminal outcome and where preserved evidence/successor is recorded>
- **Deadline:** <absolute ISO-8601 timestamp>
- **Repair-round budget:** 2
- **TTL:** <descriptive bounded implementation/review/repair stages>
- **Rollback:** <safe reduced outcome that retains lineage and prior receipts>

Publication requires one future deadline and one finite repair-round budget. New plans use the
canonical `Repair-round budget` field. Compatibility parsing remains closed to `N repair rounds`,
`N scope-stable repair rounds`, and `at most N implementation/review repair rounds`; missing,
malformed, unsupported, or conflicting declarations are refused before WorkItem acceptance.

## Notes / risks

<Optional: edge cases, rollback plan, perf or security considerations, follow-ups to file later.>
