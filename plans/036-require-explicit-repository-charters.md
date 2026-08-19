# Plan 036: Require explicit repository charters

- **Project:** repo-template
- **Branch:** feat/036-require-explicit-repository-charters
- **Status:** ready for implement
- **Priority:** P2
- **Effort:** medium
- **Issue:** https://github.com/spencer-shadley/repo-template/issues/116
- **Hard execution TTL:** 3 hours from source-worker acquisition; no extension
- **Absolute TTL:** 2026-08-15T23:59:00-07:00; no extension
- **Repair rounds:** maximum 1 implementation/review repair round; no extension

## Risk

- **Tier:** human
- **Gates:** none
- **Rationale:** The change is repo-contained, reversible, pure/offline, and has no runtime or external effects, but it adds portable template structure and a validation contract intended for future cross-repository consumption. Per this repo's charter, executable or cross-repository template changes use the human merge lane. Implementation and verification may proceed autonomously; merge parks for operator review.

## Objective

Make every future repository charter explicitly state its Mission, Responsibilities, and Non-responsibilities, and publish a pure validator that distinguishes an intentional template source from a concrete repository whose charter must be complete.

## Context

- `AGENTS.md` currently uses an unheaded `{{ONE_LINE_DESCRIPTION}}` plus a combined `## Responsibilities & non-goals` section with `{{RESPONSIBILITIES}}` and `{{NON_GOALS}}` placeholders. The setup comments are prose-only; no machine check proves that an instantiated repo filled them.
- `tools/verify-template-self.ts` validates other portable defaults but has no repository-charter contract.
- `packages/adoption-shell/src/materialize.ts` selects authenticated template payload entries and validates payload structure/documentation links; it does not receive target-specific mission/scope values and must not pretend raw template placeholders are a concrete charter.
- Repo Template owns portable semantics and structure. Repo Factory consumption/enforcement is separately owned by https://github.com/spencer-shadley/repo-factory/issues/63. Existing-fleet backfill is separately owned by https://github.com/spencer-shadley/fleet-registry/issues/18.
- Current pending Plan 035 is a held, separately scoped PlanRecord/Product-SLI release attempt. It overlaps common generated/release bookkeeping paths but does not cover charter semantics. Preserve its terminal evidence and do not amend, absorb, or depend on it; rebase on the then-current master and regenerate only this plan's outputs.

## Changes

1. `AGENTS.md` — replace the implicit one-line description and combined boundary section in portable content with three explicit sections: `## Mission`, `## Responsibilities`, and `## Non-responsibilities`. Give each one a distinct required setup placeholder and concise examples/guidance. Preserve the template-self block and all unrelated policy.
2. `packages/adoption-shell/src/repository-charter.ts` — add a pure, provider-neutral charter parser/validator with an explicit template-source mode and materialized-repository mode. Source mode accepts exactly the documented placeholders; materialized mode requires one non-empty concrete section of each kind and rejects missing, duplicated, empty, or unresolved-placeholder content. Return stable reason codes/diagnostics; perform no filesystem, GitHub, network, or mutation effects.
3. `packages/adoption-shell/src/index.ts` and required public types — export the charter validator as a Template-owned portable contract without adding Factory-specific lifecycle semantics.
4. `packages/adoption-shell/test/repository-charter.test.ts` plus focused fixtures if useful — cover a valid template source, a valid concrete charter, every missing section, duplicate headings, empty content, legacy combined headings, and unresolved placeholders. Include a removal test proving each required section is independently enforced.
5. `tools/verify-template-self.ts` — invoke the source-mode validator against portable `AGENTS.md` so template structure cannot silently regress. Do not apply materialized mode to the intentional template source.
6. `template-manifest.json`, artifact build outputs under `artifacts/adoption-shell-v2/`, and release payload metadata — classify/export the new source, tests/fixtures, validator, and generated public surface according to existing manifest/reproducible-build rules.
7. `README.md`, `docs/MIGRATION.md`, and `CHANGELOG.md` — document the three-part charter, the two validation modes, the Repo Factory consumer boundary, and the additive unreleased structural change. Do not publish or tag a release in this plan.

## Out of scope

- Editing any consumer repository, existing leaf `AGENTS.md`, Fleet Registry data, Repo Factory source, Agent Orchestrator source, queue runtime, schedule, or GitHub issue beyond normal plan linkage.
- Inventing mission or scope content for existing repositories.
- Making Repo Template responsible for Factory custody release, repository lifecycle effects, or leaf-specific charter meaning.
- Requiring a raw template release payload to pass concrete materialized-repository validation before target-specific values exist.
- Amending, resuming, superseding, or rewriting Plan 035 or its preserved PR/review evidence.
- Publishing a version, creating a tag/release, running a canary, or adopting the contract fleet-wide.
- Refactoring unrelated validation, documentation, generated artifacts, or template sections.

## Acceptance criteria

- [ ] Portable `AGENTS.md` contains exactly one explicit Mission, Responsibilities, and Non-responsibilities section, each with a distinct documented setup placeholder.
- [ ] Source mode accepts the canonical template and fails when any required section/placeholder is removed, duplicated, or renamed.
- [ ] Materialized mode accepts a concrete three-part charter and rejects missing, duplicated, empty, legacy-combined-only, or placeholder-filled charters with stable reason codes.
- [ ] The validator is pure/offline, exported from the adoption-shell public surface, included in reproducibly generated artifacts, and carries no Factory lifecycle authority.
- [ ] Documentation names Repo Factory issue 63 as the future enforcement consumer and Fleet Registry issue 18 as existing-fleet backfill owner.
- [ ] Template manifest, generated artifact, and tracked source remain synchronized; no Plan 035 evidence or consumer repo is changed.
- [ ] Full Repo Template verification passes.

## Verify

No e2e: portable Markdown, pure TypeScript validation, unit fixtures, and reproducible generated artifacts only; no runtime service, UI, deployment, or external effect.

```bash
corepack.cmd pnpm install --frozen-lockfile --ignore-scripts &&
corepack.cmd pnpm verify
```

## Notes / risks

- Immediate focus: Class — the portable standard does not mechanically require the three-part charter.
- Higher ranks are durably split: Repo Factory issue 63 owns enforcement at lifecycle release; Fleet Registry issue 18 owns existing-fleet backfill.
- Success is one exact-head human-lane PR whose diff stays inside the declared paths, passes the full gate, receives an independent terminal review, and parks ready for operator merge before the absolute TTL.
- Terminal failure is the first of: absolute TTL expiry, unresolved applicable blocker after one repair round, source/base collision with active Plan 035 work, or inability to preserve the producer/consumer authority boundary. Preserve exact branch/head/diff/check/review evidence and update issue 116; do not extend TTL or broaden scope.
- Rollback is an ordinary revert of the eventual charter-contract commit; no consumer is activated by this plan.
