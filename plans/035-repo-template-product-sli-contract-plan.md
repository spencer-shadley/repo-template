# Plan: Publish the portable local-priority and product-SLI probe contract

- **Project:** repo-template
- **Branch:** feat/035-repo-template-product-sli-contract-plan
- **Status:** hold - critic unavailable (retry: critic-available)
- **Requeue-reason:** manual: #110 is a distinct portable local-priority/ProductSliProbeV1 successor consuming immutable v3.0.1; Plan 034's source/release is landed and its lingering live status is stale projection, not an active writer
- **Priority:** P1
- **Depends:** none
- **Effort:** high
- **Merge tier:** human
- **Issue:** Fixes #110; enables gmail-markdown#554, sharingan#140, task-dag#686, and agent-orchestrator#2867.

## Approval provenance

- **sourceKind:** human-chat
- **human:** Spencer Shadley
- **approvedAt:** 2026-07-29T21:25:00-07:00
- **scopeFingerprint:** sha256:7a7f8cf299bb20cc3becd9bd8480916fc4c0a7d3d6a035ec3a423d2dcac61e74
- **approvalRef:** human-chat:2026-07-29:review-all-issues-root-fixes:product-sli-contract
- **decision:** approve

## Objective

Make sibling `PRIORITIES.md` the single portable home for local priorities and SLI/SLO definitions,
and publish a strict runtime-neutral product-probe declaration that leaf repositories and the
orchestrator can share without duplicating schedule or breach machinery.

## Context

- Fleet `NORMS.md` assigns local SLI/SLO rows exclusively to sibling `PRIORITIES.md`.
- The current portable `AGENTS.md` instead requires SLI/SLO-bearing
  `{{PRODUCT_PRINCIPLES}}`, while portable `PRIORITIES.md` contains only an empty placeholder. That
  produces two claimed homes and no executable observability contract.
- Gmail Markdown and Sharingan demonstrate the escape: ratified local SLI/SLO definitions remain
  in `AGENTS.md` while `PRIORITIES.md` says `_(none yet)_`. Task DAG has no local rows at all.
- Open product issues gmail-markdown#554, sharingan#140, and task-dag#686 all ask for declarations
  plus continuous core-flow probes. Issue #110 preserves the cross-repo evidence and causal ladder.
- Agent Orchestrator #2867 owns the eventual shared schedule/evaluation/incident runtime. This
  repository owns only the portable declaration, validation, migration, fixtures, and release.
- Plan 034's source and the follow-up manifest closure are already landed and immutably published as
  `v3.0.1` (`eaab5f9d16e01b8c97ecfc25a11aad3ee4ae1057`; annotated tag object
  `2ed2e10bad46f9916a07caab5fa8f2e331f86082`). Repo-template#97 is closed after its consumer
  canary. The lingering live Plan 034 `implementing` header is stale lifecycle projection, not an
  active writer or prerequisite; this plan consumes the exact published release and must rebase
  rather than resume Plan 034.

## Changes

1. `PRIORITIES.md` and `AGENTS.md` template payload:
   - replace the empty-only local table with a required `{{LOCAL_PRIORITIES}}` setup surface
     containing stable local IDs, principle binding, SLI, SLO, status, decider, and decision date;
   - make `AGENTS.md` point to `PRIORITIES.md` for local priorities and remove the competing
     SLI/SLO-bearing `{{PRODUCT_PRINCIPLES}}` authority;
   - retain stack, risk, command, responsibility, non-goal, and navigation material in `AGENTS.md`;
   - do not copy or restate fleet CEO/P-series content.
2. `contracts/product-sli-probe/v1/` — add strict JSON Schema, examples, and positive/negative
   fixtures for `ProductSliProbeV1`:
   - schema version, repository and stable local SLI ID, contract generation, principle binding;
   - sample/gauge/counter semantics, numerator/denominator/window where applicable, SLO comparator
     and target, cadence/freshness, and report-only state;
   - one fixed repository-relative probe entrypoint and structural argv;
   - declared `read-only | fixture-only` effect class, named capability requirements, timeout and
     resource ceiling;
   - typed observation receipt version and breach owner;
   - no arbitrary shell strings, outside-repo paths, secrets, live-write, destructive, or direct
     notification fields.
3. Adoption-shell package, generated artifacts, manifest, and tests:
   - parse and validate local `PRIORITIES.md` rows and probe bindings deterministically;
   - reject local SLI/SLO definitions stranded in `AGENTS.md`;
   - require exactly one compatible probe per active row, or an explicit evidence-backed
     report-only/non-mechanizable disposition with owner and review date;
   - reject duplicate IDs, missing targets, invalid comparators, path escape, shell metacharacters,
     undeclared capabilities, future schema versions, destructive/live-write effects, and
     declaration/priority drift;
   - preserve pure/offline validation with zero execution or network effects.
4. Add two dissimilar portable canaries:
   - browser-extension fixture/corpus probe with no account or live Gmail mutation;
   - deployed-service read-only health/core-flow probe with unavailable-dependency and stale-sample
     outcomes;
   - validate observation payloads without implementing the AO runner.
5. `docs/MIGRATION.md`, README, setup interview, ADR, and CHANGELOG:
   - migrate existing ratified local definitions from `AGENTS.md` to `PRIORITIES.md` without
     changing IDs, wording, targets, decider, or decision date;
   - require reviewable before/after semantic hashes and leave ambiguous rows blocked;
   - define the responsibility split: template declares, leaf implements, AO schedules/routes;
   - document report-only baselining, capability boundaries, rollback, and consumer versioning.
6. Release under the repository's structural SemVer rules after Plan 034:
   - classify the authority move as breaking and set the correct next major version;
   - build deterministic artifacts, verify manifest/tree reproducibility, create the exact reviewed
     release/tag only after merge, and publish an immutable release receipt;
   - no consumer repository is auto-migrated by this plan.

## Out of scope

- Choosing product-specific SLI targets or changing any ratified meaning.
- Implementing Gmail, Sharingan, or Task DAG probes.
- Running probes, creating Windmill schedules, granting credentials, writing incidents, paging,
  or changing AO signal routing.
- Silently migrating consumer repositories or weakening an SLO to make a fixture green.
- Reimplementing Plan 034's PlanRecordV1 contract.

## Acceptance criteria

- [ ] Portable `PRIORITIES.md` is the single local-priority/SLI/SLO authority.
- [ ] Portable `AGENTS.md` contains no competing local SLI/SLO definition surface.
- [ ] `ProductSliProbeV1` is strict, versioned, runtime-neutral, path-safe, and limited to
      `read-only | fixture-only`.
- [ ] Every active local row is probe-bound or has an explicit owned/review-dated report-only
      disposition.
- [ ] Split-brain, duplicate IDs, target drift, arbitrary shell, path escape, future version,
      undeclared capability, and destructive/live-write fixtures fail closed.
- [ ] Browser-extension and deployed-service canaries pass deterministically.
- [ ] Migration preserves ratified semantic hashes and blocks ambiguous transformations.
- [ ] Adoption-shell generated artifacts and manifests are reproducible and complete.
- [ ] The exact reviewed release/tag is published under structural SemVer with an immutable receipt.
- [ ] No consumer, runtime, schedule, credential, incident, page, or product effect occurs.

## Verify

```bash
corepack.cmd pnpm install --frozen-lockfile --ignore-scripts && corepack.cmd pnpm verify
```

No application e2e: portable schema, generator, validator, and fixtures are fully exercised by the
template's deterministic aggregate gate.

## Forced exits

- **Success:** the exact published `v3.0.1` prerequisite remains immutable; exact reviewed PR head merges; aggregate Verify and both
  dissimilar canaries pass; the correct next-major tag is created only after merge and exactly read
  back; #110 receives commit/PR/test/release/no-effect receipts.
- **Terminal failure:** the published prerequisite identity drifts; existing ratified semantics
  cannot migrate without invention; the contract cannot exclude live-write/destructive probes; generated artifacts
  are nondeterministic; any verification has no verdict; release/tag readback fails; or a second
  predicate-valid blocking review remains after one repair.
- **Absolute TTL:** 2026-08-08T04:25:00Z.
- **Repair rounds:** maximum 1; no extension. Preserve exact branch/PR/review/failure evidence for a
  freshly grounded successor.

## Notes / risks

- The safe rollback is the prior template release; consumer repos remain unchanged until their own
  reviewed migrations.
- Moving local principles out of `AGENTS.md` is a breaking structural change even when semantic
  bytes are preserved; do not publish it as a minor cleanup.
- A probe declaration is not execution authority. AO must independently validate and capability-gate
  every consumer effect.

## Retry history

- 2026-07-30T04:15:17.793Z manual (manual): #110 is a distinct portable local-priority/ProductSliProbeV1 successor consuming immutable v3.0.1; Plan 034's source/release is landed and its lingering live status is stale projection, not an active writer

## Notes

- 2026-08-06T21:43:20.301Z approval-revalidation KEEP-LIVE stage 2 rung=deterministic: no prior scopeMaterial stored; standing policy treats unproven delta as non-CEO-gate (restamp stores material) | delta: unknown-no-prior: no prior scopeMaterial stored; standing policy treats unproven delta as non-CEO-gate (restamp stores material). Freshly covered delta: unknown-no-prior: no prior scopeMaterial stored; standing policy treats unproven delta as non-CEO-gate (restamp stores material). Fingerprint now sha256:b87dfb6730547267f1473fadab28d7ac649b5539f87b44465e84752139826f55. Prior human-chat:2026-07-29:review-all-issues-root-fixes:product-sli-contract. Not a new CEO click; do not re-judge this fingerprint.

## Approval provenance

- **sourceKind:** human-chat
- **human:** Spencer Shadley
- **approvedAt:** 2026-08-06T21:43:20.301Z
- **scopeFingerprint:** sha256:b87dfb6730547267f1473fadab28d7ac649b5539f87b44465e84752139826f55
- **scopeMaterial:** "\nMake sibling `PRIORITIES.md` the single portable home for local priorities and SLI/SLO definitions, and publish a strict runtime-neutral product-probe declaration that leaf repositories and the orchestrator can share without duplicating schedule or breach machinery.\n1. `PRIORITIES.md` and `AGENTS.md` template payload: - replace the empty-only local table with a required `{{LOCAL_PRIORITIES}}` setup surface containing stable local IDs, principle binding, SLI, SLO, status, decider, and decision date; - make `AGENTS.md` point to `PRIORITIES.md` for local priorities and remove the competing SLI/SLO-bearing `{{PRODUCT_PRINCIPLES}}` authority; - retain stack, risk, command, responsibility, non-goal, and navigation material in `AGENTS.md`; - do not copy or restate fleet CEO/P-series content. 2. `contracts/product-sli-probe/v1/` — add strict JSON Schema, examples, and positive/negative fixtures for `ProductSliProbeV1`: - schema version, repository and stable local SLI ID, contract generation, principle binding; - sample/gauge/counter semantics, numerator/denominator/window where applicable, SLO comparator and target, cadence/freshness, and report-only state; - one fixed repository-relative probe entrypoint and structural argv; - declared `read-only | fixture-only` effect class, named capability requirements, timeout and resource ceiling; - typed observation receipt version and breach owner; - no arbitrary shell strings, outside-repo paths, secrets, live-write, destructive, or direct notification fields. 3. Adoption-shell package, generated artifacts, manifest, and tests: - parse and validate local `PRIORITIES.md` rows and probe bindings deterministically; - reject local SLI/SLO definitions stranded in `AGENTS.md`; - require exactly one compatible probe per active row, or an explicit evidence-backed report-only/non-mechanizable disposition with owner and review date; - reject duplicate IDs, missing targets, invalid comparators, path escape, shell metacharacters, undeclared capabilities, future schema versions, destructive/live-write effects, and declaration/priority drift; - preserve pure/offline validation with zero execution or network effects. 4. Add two dissimilar portable canaries: - browser-extension fixture/corpus probe with no account or live Gmail mutation; - deployed-service read-only health/core-flow probe with unavailable-dependency and stale-sample outcomes; - validate observation payloads without implementing the AO runner. 5. `docs/MIGRATION.md`, README, setup interview, ADR, and CHANGELOG: - migrate existing ratified local definitions from `AGENTS.md` to `PRIORITIES.md` without changing IDs, wording, targets, decider, or decision date; - require reviewable before/after semantic hashes and leave ambiguous rows blocked; - define the responsibility split: template declares, leaf implements, AO schedules/routes; - document report-only baselining, capability boundaries, rollback, and consumer versioning. 6. Release under the repository's structural SemVer rules after Plan 034: - classify the authority move as breaking and set the correct next major version; - build deterministic artifacts, verify manifest/tree reproducibility, create the exact reviewed release/tag only after merge, and publish an immutable release receipt; - no consumer repository is auto-migrated by this plan.\n- Choosing product-specific SLI targets or changing any ratified meaning. - Implementing Gmail, Sharingan, or Task DAG probes. - Running probes, creating Windmill schedules, granting credentials, writing incidents, paging, or changing AO signal routing. - Silently migrating consumer repositories or weakening an SLO to make a fixture green. - Reimplementing Plan 034's PlanRecordV1 contract.\n"
- **approvalRef:** human-chat:revalidation:stage2:human-chat:2026-07-29:review-all-issues-root-fixes:product-sli-contract
- **decision:** approve
- **revalidationStage:** 2
- **revalidationRationale:** no prior scopeMaterial stored; standing policy treats unproven delta as non-CEO-gate (restamp stores material) | delta: unknown-no-prior: no prior scopeMaterial stored; standing policy treats unproven delta as non-CEO-gate (restamp stores material)
- **revalidatedDelta:** unknown-no-prior: no prior scopeMaterial stored; standing policy treats unproven delta as non-CEO-gate (restamp stores material)
- **intelligenceRung:** deterministic
- **priorApprovalRef:** human-chat:2026-07-29:review-all-issues-root-fixes:product-sli-contract
