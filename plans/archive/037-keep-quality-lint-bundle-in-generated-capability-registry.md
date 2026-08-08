# Plan 037: Keep quality-lint bundle in generated capability registry

> **Planning SSOT (read this before editing Priority / Depends):** Within-repo selection and
> dependency inheritance read the **linked GitHub issue**, not this plan file.
>
> | Concern | Authoritative surface | Plan markdown |
> |---|---|---|
> | Fleet / repo priority | GH labels `priority:fleet:pN` / `priority:repo:pN` (via `gh issue-edit` / intake) | `- **Priority:**` is a **legacy mirror only** — changing it alone does **not** change selection |
> | Dependencies | GH native `--blocked-by` / `--blocking` on the linked issue | `- **Depends:**` is a **legacy plan-local gate** (QUEUE still honors it) — prefer mirroring onto GH |
>
> **When planning discovers a priority or dependency change, update the GitHub issue in the same
> turn** (labels and/or `blocked-by` edges). Do not leave the truth only in plan markdown. Planning
> may refine edges as the chain becomes clearer; selection consumes whatever GH currently says.
> See [issue-work-spine](https://github.com/spencer-shadley/code/blob/master/docs/guides/issue-work-spine.md)
> · [github-best-practices](https://github.com/spencer-shadley/code/blob/master/docs/guides/github-best-practices.md).

- **Project:** repo-template
- **Branch:** feat/037-keep-quality-lint-bundle-in-generated-capability-registry
- **Status:** merged
- **Issue:** Fixes #126
- **WorkItemId:** aaeb0704-2eca-47fa-9dd9-21d8010ef76c
- **Priority:** P1   <!-- LEGACY MIRROR ONLY — selection SSOT is the linked GH issue's
     `priority:fleet:pN` / `priority:repo:pN`, then GH `blocked-by` inheritance, effort, weighted
     unblock leverage, furthest work:*, oldest createdAt, then Pending FIFO. If priority changes
     during planning, **edit the GH issue labels this turn**; do not rely on this field. Historical
     P1|P2|P3 remain fallback only when GH dims are missing. -->
<!-- Optional: `- **Depends:** 083, 085` — LEGACY plan-local gate (QUEUE still admits on it).
     **Prefer** GH native `--blocked-by` / `--blocking` on the linked issue (SSOT for selection
     inheritance + unblock leverage). When you add/change Depends during planning, **also** set the
     matching GH edges this turn. This plan never starts before every listed plan-dep has MERGED
     (archived). enqueue-plan rejects unknown/cyclic/dead deps. Omit or `none` => no plan-local deps.
     Cross-repo (AO#5063): also accept `projectId/NNN` tokens, e.g. `Depends: 083, repo-template/028`,
     or `- **Cross-Depends:** repo-template/028`. Drain skips with `cross-repo-dep-unmet` until the
     foreign plan is archived/merged/retired. QUEUE.md comment prose ("sequence AFTER …") is NEVER a dep. -->
- **Effort:** low
     (NOT size). Start LOW for simple/mechanical changes (CSS, copy, a small handler) for fast turns;
     medium for typical features; high for genuinely tricky logic. A review failure auto-escalates +1
     rung, so under-shooting self-corrects. Omit => medium. -->
<!-- Rarely needed: `- **Model:** pro` starts the implementer at gpt-5.5-pro. Starting at pro should be
     HIGHLY RARE — almost never set it. The ladder REACHES pro on its own (gpt-5.5 low→medium→high→xhigh,
     THEN pro) when a plan repeatedly fails review, so let escalation decide instead of pre-selecting it.
     pro is slower, pricier, and has weaker code-editing tools, so a wrong pro start is costly both ways.
     Default = omit (gpt-5.5) and pick Effort by complexity. Reserve an upfront pro ONLY for a genuinely
     unknown, deeply-hard root cause where you want to skip the climb — and even then, prefer the ladder. -->
- **Tier:** auto
- **Concurrency:** parallel-safe   <!-- exclusive | parallel-safe. EXCLUSIVE IS THE SAFE DEFAULT and means
     "this plan takes full-repo custody" — identical to how every plan without this block already
     behaves. Only declare `parallel-safe` when you can enumerate EVERY path this plan writes, below.
     A WRONG declaration is far worse than no declaration: absent means "run me alone", wrong means
     "two lanes write the same file believing they are disjoint". -->
- **Scope-write:** tools/generate-contract-fixtures.ts, tools/artifact-build.ts, contracts/adoption-shell-v2/capability-bundle-registry.json, artifacts/adoption-shell-v2/artifact-manifest.json, packages/adoption-shell/test, plans   <!-- `none`, or a comma-separated list of LITERAL repo-relative paths this
     plan may write, e.g. `lib/foo.ts,lib/foo.test.mjs`. A directory covers everything under it.
     NO GLOBS: the lease comparator is literal prefix matching, so `lib/*` would be treated as a file
     literally named `lib/*` and judged disjoint from `lib/foo.mjs` (#4675) — globs are rejected at
     parse time. Must be exhaustive: anything you write that is not listed escapes custody. Remember
     this plan's own file if its Status will be updated. -->
- **Scope-read:** package.json, template-manifest.json, docs/QUALITY-LINT.md, eslint.config.mjs, eslint.quality.mjs, scripts/verify-quality-lint-required.mjs   <!-- Literal paths this plan reads but never writes. Advisory only; not leased. -->
- **Scope-resource:** none   <!-- Named non-path resources this plan needs exclusively, e.g. a port or
     an external service handle. Leased separately from paths. -->
- **Service class:** medium   <!-- short | medium | long — expected HOLD DURATION of this plan's
     custody, used for verification scheduling. Not the same axis as Effort. -->
<!-- The five fields above are ONE block and are parsed together: a partial block does not parse at all
     and is silently ignored (#4678). Keep all five, or delete all five. Check your plan with
     `node tools/validate-plan-scope.mjs` — it exits non-zero on a malformed declaration. -->


## Risk

- **Tier:** auto
## Objective

Make Repo Template's generated capability registry reproducibly retain the required quality-lint
bundle so the canonical verifier is green and routine generation cannot remove the portable gate.

## Context

Current master commits `repo-template/quality-lint` in
`contracts/adoption-shell-v2/capability-bundle-registry.json`, but
`tools/generate-contract-fixtures.ts` constructs the registry without it. `pnpm build:check` fails;
`pnpm build` deletes the bundle. Preserve the current exact bundle contract and make the generator
its repeatable producer. Issue: https://github.com/spencer-shadley/repo-template/issues/126.

## Changes

1. `tools/generate-contract-fixtures.ts` — declare the `repo-template/quality-lint` v1.0.0 bundle
   with the exact four committed artifacts and its existing `config` / `presence` modes; include it
   in the portable capability registry.
2. `tools/artifact-build.ts` — include the quality-lint artifacts in the portable capability closure
   so generated output and materialization validation preserve the bundle.
3. Regenerate the affected contract/artifact bytes and add a focused regression assertion that
   generation retains the quality-lint bundle.

## Out of scope

- Do not change quality-lint rules, thresholds, package dependencies, PlanRecord semantics, release
  version, or any unrelated capability bundle.
- Do not weaken or baseline the existing verifier.

## Acceptance criteria

- [ ] `pnpm build:check` passes from a clean generated state.
- [ ] The generated registry contains exactly one `repo-template/quality-lint` v1.0.0 bundle with
      the four current artifacts and `config` / `presence` modes.
- [ ] `artifacts/adoption-shell-v2/artifact-manifest.json` contains exactly one `fixtures-closure`
      row for each of `docs/QUALITY-LINT.md`, `eslint.config.mjs`, `eslint.quality.mjs`, and
      `scripts/verify-quality-lint-required.mjs`, with mode, byte count, and SHA-256 matching the
      live file; a focused test under `packages/adoption-shell/test` asserts this registry-to-
      manifest closure and runs through `pnpm test`.
- [ ] `pnpm build` no longer deletes the quality-lint bundle.
- [ ] `pnpm verify` passes.

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
corepack.cmd pnpm install --frozen-lockfile --ignore-scripts &&
corepack.cmd pnpm verify
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

## Forced exits

- **Success:** full verify passes and regeneration is byte-stable.
- **Terminal failure:** the committed bundle cannot be represented by the current schema; preserve
  evidence and stop without deleting it.
- **Absolute TTL:** 2026-08-09T23:59:00-07:00.
- **Repair rounds:** two.

## Notes / risks

- **Risk:** auto. Deterministic repo-local generator parity repair with no external effects.
- **Rollback:** ordinary revert.
