# Plan 034: Publish portable PlanRecordV1 schema and migration contract

- **Project:** repo-template
- **Branch:** feat/034-publish-portable-planrecordv1-schema-and-migration-contract
- **Status:** hold - terminal R3 repair exhausted; retry:manual owner:repo-template#97 by:2026-07-30
- **Requeue-reason:** verify-failed: use Windows-native corepack.cmd under the shared no-path-conversion verify environment
- **Priority:** P1
- **Issue:** repo-template#97
- **Effort:** high

## Exit contract — attempt 034-R3

- **attemptId:** `034-R3`
- **candidatePr:** [#98](https://github.com/spencer-shadley/repo-template/pull/98)
- **candidateHead:** `3b96d25e768c09d5ec53aaba7dc0ebf7e6062dac` is the preserved
  substantive source head at R3 entry. The plan-only control successor pushed to the same PR is the
  exact head that must be reviewed and is bound by the PR review receipt.
- **currentBase:** `4ed1eb5ef676894df4991c85047eb7fdad93ed5e`
- **reviewDeadlineAt:** `2026-07-29T05:15:00Z`
- **deadlineAt:** `2026-07-29T06:00:00Z`
- **maxRepairRounds:** `1`
- **repairRoundsUsed:** `1/1` — exhausted
- **Blocking review receipt:** exact head
  [`1b0a4e50b8675b78c0455ecc9895cd1b5fb2e53a`](https://github.com/spencer-shadley/repo-template/commit/1b0a4e50b8675b78c0455ecc9895cd1b5fb2e53a)
  received terminal `BLOCK` in
  [review 4803862406](https://github.com/spencer-shadley/repo-template/pull/98#pullrequestreview-4803862406).
  Repair `1/1` is limited to the three compiled inline findings:
  [future schema fail-closed](https://github.com/spencer-shadley/repo-template/pull/98#discussion_r3670878990),
  [landed-commit tag receipt](https://github.com/spencer-shadley/repo-template/pull/98#discussion_r3670878993),
  and [manifest scope cleanup](https://github.com/spencer-shadley/repo-template/pull/98#discussion_r3670878996).
  No second repair is authorized.
- **Repair `1/1` verification chronology:** fresh
  `corepack.cmd pnpm install --frozen-lockfile --ignore-scripts` completed; typecheck,
  reproducible build/check, artifact verification, and `55/55` tests passed. A temporary
  pre-commit trial that removed the nine manifest classifications requested by finding 3670878996
  then made unchanged mandatory template self-verification exit `1` on those exact nine
  pre-existing tracked files. The removal was therefore reverted before commit: keeping their
  non-behavioral manifest bookkeeping is required to avoid a candidate regression, and none of
  their file contents changed. The final fresh aggregate Verify result is bound to the exact PR
  repair head in its review receipt; this plan does not predict or overclaim that later result.
- **Candidate receipt:** substantive commits
  `905f312705ced036f13129809dbb67033de0646c`,
  `a10e0817e9bf349742de9b8350268151e3fa9034`,
  `80e1dcf8f0266c04baf217426d1e6f3e78fd594f`, and
  `3b96d25e768c09d5ec53aaba7dc0ebf7e6062dac` are preserved. The approved Windows-native
  `corepack.cmd pnpm verify` gate passed `54/54`, including typecheck, reproducible build, artifact
  verification, and template self-check; R3 does not rerun or overclaim a new full-suite receipt
  for this plan-only control amendment.
- **Success exit:** fresh Windows-native `corepack.cmd` Verify evidence passes on repair `1/1`; the
  repaired successor is pushed to PR #98 by `reviewDeadlineAt`; an independent reviewer reviews
  that exact PR head directly on GitHub and records a scope-bound terminal `APPROVE`; that exact
  approved head squash-merges; only after merge, an annotated `v3.0.0` tag is created on the exact
  landed squash commit, pushed, and read back from origin; and an immutable release receipt binds
  the PR head, landed commit, tag object/target, verification, and readback before `deadlineAt`.
- **Review cycle:** the four existing substantive commits and every local or pre-PR review are
  advisory evidence only. Review 4803862406 compiled the complete blocking set on exact head
  `1b0a4e50b8675b78c0455ecc9895cd1b5fb2e53a`; the responding implementer commit/push consumes
  repair `1/1`, after which only exact-head re-review on PR #98 is permitted.
- **Blocking findings:** only an unmet approved acceptance criterion, a candidate-introduced or
  worsened regression, candidate scope escape or drive-by work, or a materially false
  safety/verification/acceptance claim may block. Every unrelated, pre-existing, or newly desired
  finding is scope creep: conserve it as a governed GitHub issue with evidence, owner, priority, and
  dedupe receipt. Such a finding cannot expand this plan or PR, consume a repair round, delay
  approval, or extend either deadline.
- **Terminal failure:** the first observation at or after `deadlineAt`; no exact-head terminal
  review by `reviewDeadlineAt`; origin/base movement or writer-custody collision; invalidation of
  the existing `corepack.cmd` gate evidence by a substantive candidate change; inability to publish
  or review the exact PR head; a permitted repair that does not restore the approved acceptance
  contract; failure after merge to create, push, or read back annotated tag `v3.0.0` on the exact
  landed squash commit or to record its immutable release receipt; or any block after exhaustion of
  repair `1/1`. TTL is failure and is never extended. The tag must not be created before merge.
- **Failure conservation:** stop mutation; preserve the PR, branch, exact head/tree, four substantive
  commits, plan-control commit, gate and review evidence, and the unchanged paused-human-review
  sentinel. Atomically retain Plan 034 outside `plans/QUEUE.md` in a tracked §22-valid terminal hold
  owned by `repo-template#97` with a live manual revisit trigger, record the terminal receipt, and
  release all writer/review/merge/tag custody. If merge landed but tag publication failed, preserve
  the exact untagged landed commit and tag failure/readback evidence; never move or synthesize the
  tag after TTL. R3 and its review lineage may not resume unchanged.
- **Effect boundary:** repair commit, same-branch push, PR metadata/replies, exact-head PR review,
  squash merge, and only after merge one annotated `v3.0.0` tag on that exact landed commit plus
  its push/readback/immutable release receipt. No new PR, source executor, branch reset, candidate
  discard, queue drain, runtime/deployment effect, pause removal, or external issue is authorized.

## Approval provenance

- **sourceKind:** human-chat
- **human:** Spencer Shadley
- **approvedAt:** 2026-07-28T22:06:00Z
- **scopeFingerprint:** sha256:095d79dd2a5c23da3fee8e271ea01fd432bdb8e82107b39540508f829ea84f92
- **approvalRef:** human-chat:2026-07-28:execute-s0-record-schema-reconciliation
- **decision:** approve
- **gateAcks:** structural-major-release, canary-first, no-grandfathering, archive-sealed

## Objective

Publish the versioned portable `PlanRecordV1` contract that makes plan lifecycle, issue linkage,
enqueue time, risk, and disposition machine-readable, and define an idempotent migrate-or-retire
procedure that consumers can apply without rewriting sealed archives or manufacturing archive
issues.

## Context

- `repo-template#97` is the accountable owner for the portable schema, validator, fixtures,
  template payload, release, and migration semantics. `agent-orchestrator#2814` owns its runtime
  adapter and current AO corpus migration; it must consume this release rather than redefine it.
- `docs/architecture/fleet-throughput-2026-07-27.md:376-382` combines `Risk`/`Tier`, `Issue`,
  `enqueuedAt`, and a closed `Status` enum under one no-grandfathering ruling and excludes
  `Concurrency`.
- The same design at lines 1014-1026 makes blocked/stale computed overlays, not stored states; at
  1150-1165 it requires every live plan to migrate or retire, archives to remain sealed with one
  receipt, and `owner`, `trigger`, `retryReason`, and `supersededBy` to be structured fields rather
  than status prose.
- Fresh audit at authorization time found 264 top-level live plan bodies across managed repos:
  25/264 carry `Issue`, 0/264 carry `enqueuedAt`, 255/264 carry a `## Risk` section, and 200/264 have
  a parseable `Tier: auto|human`. All carry a Status header, but the values are an unbounded prose
  vocabulary. The archive holds 714 plan bodies; 513 fail the current terminal-status predicate.
- Plan 467 is a narrower AO-only additive pilot that explicitly excludes the enum, other repos,
  retirement, and archives. Its approval fingerprint does not authorize widening it. AO Plans 474
  and 475 separately own publication containment and stable record/occurrence identity; do not
  absorb them.
- Current `TEMPLATE_VERSION` is `2.6.0`. This is a breaking portable record contract, so the
  structural release is `3.0.0` and follows `docs/MIGRATION.md`'s canary-first major rollout.
- Before migrating to one-plan/one-issue authority, claim-time and land-time plan contract snapshots
  must be frozen and addressable. This plan specifies their portable record shape and validation;
  AO owns capture/serving implementation.

## Changes

1. `contracts/plan-record/v1/plan-record.schema.json` and
   `contracts/plan-record/v1/plan-record.example.json` — publish a strict JSON Schema and canonical
   example for `PlanRecordV1`. The record must include:
   - `schemaVersion: "plan-record/v1"`, project/repository identity, plan number, title, and plan
     source path;
   - lifecycle `status` drawn only from `planned | in-progress | implemented | closed |
     held-authority`;
   - `issue` as a typed GitHub repository/number reference or an explicit `plan-host` composition
     record that is never credited as a real-fixed issue;
   - RFC3339 `enqueuedAt`, required once a record is admitted and immutable thereafter;
   - one structured `risk` object with `tier: auto | human`, rationale, and declared effect classes;
   - separate optional `owner`, `trigger`, `retryReason`, and `supersededBy` fields;
   - terminal `disposition` for `closed` records (`completed | duplicate | not-planned | invalid`)
     and a landed/deployed receipt distinction for `implemented` versus `closed`;
   - immutable `contractSnapshots.claim` and `contractSnapshots.land` content-addressed references.
   `blocked`, `stale`, `queued`, and `eligible` are forbidden stored statuses because they are
   derived overlays.

2. `packages/adoption-shell/src/plan-record-v1.ts` plus focused tests under
   `packages/adoption-shell/test/` — add a pure offline parser/validator and legacy classifier.
   It must return typed `valid-v1 | migrate | retire | archive-receipt-only` decisions with stable
   reason codes, never guess an unknown status, and never perform filesystem, GitHub, or network
   mutation.

3. `contracts/plan-record/v1/fixtures/` — add positive and negative fixtures covering every
   lifecycle state, human and auto risk, plan-host issue composition, immutable enqueue time,
   claim/land snapshots, malformed issue/risk/timestamps, prose status values, stored blocked/stale
   overlays, missing exit triggers, supersession, archive/terminal disagreement, and an unknown
   future value that fails closed.

4. `docs/MIGRATION.md` — add the no-grandfather `PlanRecordV1` migration:
   - inventory every top-level plan and classify it as migrate or retire;
   - map legacy ready/draft/stall/park prose to `planned` plus structured retry/trigger fields only
     when evidence is complete; unknown or ambiguous values fail closed for explicit disposition;
   - map landed work to `implemented` and shipped/resolved work to `closed`, preserving the
     implemented-versus-shipped distinction;
   - derive historical `enqueuedAt` from the file-add commit only as an explicitly marked backfill;
   - link a real issue where one already owns the work, otherwise use a `plan-host` composition
     record for live migration instead of creating unearned real-fixed credit;
   - keep archives sealed and read-only, emit one content-addressed receipt per repository with
     counts/hashes/dispositions, and never bulk-create issues for archived plans;
   - require idempotent dry-run manifests, exact before/after counts, ordinary-revert rollback, and
     a halt on an unclassified record;
   - require a canary consumer before fleet rollout.

5. `contracts/plan-record/v1/work-migration-manifest.schema.json` and example — define the portable
   migration receipt consumed by AO and later fleet tooling: source commit/tree, schema release,
   per-record decision/reason, archive aggregate/hash, changed paths, verification, canary state,
   rollback ref, and zero-unclassified assertion. It carries occurrences without granting GitHub
   mutation authority.

6. Template plan payloads and `PLAN_TEMPLATE.md` — add the canonical header guidance/adapter mapping
   for `Issue`, enqueuer-stamped `enqueuedAt`, canonical `Status`, structured retry/trigger/
   supersession metadata, and one `Risk`/`Tier` representation. Keep the Markdown representation as
   a compatibility adapter to `PlanRecordV1`, not a competing schema.

7. `template-manifest.json`, artifact/adoption verification, and related fixtures — include every
   portable contract, validator, and migration artifact in generated/adopted output; prove the
   template self-check and artifact build remain synchronized.

8. `CHANGELOG.md` and `TEMPLATE_VERSION` — document and release structural major `3.0.0`, naming
   `gmail-markdown` as the default canary only after re-validating it has the smallest applicable
   verify surface. Record the exact AO consumer issue (`agent-orchestrator#2814`) and the
   canary-before-fleet gate.

## Out of scope

- No mutation of any consumer repository, live plan corpus, archive, queue, GitHub issue, schedule,
  or runtime state.
- No AO parser/enqueuer/drain implementation or AO corpus rewrite; `agent-orchestrator#2814` owns
  that consumer transaction after this immutable release.
- No runtime-signal containment, drift-writer migration, or historical issue consolidation; AO
  Plans 474/475 and a post-cutoff cleanup successor own those.
- No `Concurrency:` field or resource-scope inference.
- No GitHub Projects v2 dependency, provider/model invocation, production deployment, or new shared
  effect authority.
- No automatic conversion of ambiguous statuses and no weakening of sealed-archive rules.

## Acceptance criteria

- [ ] `PlanRecordV1` is a strict versioned schema with the five canonical statuses and separate
      structured owner/trigger/retry/supersession/disposition fields.
- [ ] Stored `blocked`, `stale`, `queued`, and `eligible` values are rejected as lifecycle statuses.
- [ ] `Issue`, immutable admitted `enqueuedAt`, and one structured `Risk`/`Tier` representation are
      validated at their lifecycle points.
- [ ] `implemented` and `closed` remain distinct and require the appropriate landed/deployed
      receipts.
- [ ] Claim-time and land-time plan-contract snapshots are content-addressed and required where the
      lifecycle transition needs them.
- [ ] The pure validator classifies positive, malformed, legacy, archive, and unknown fixtures
      without I/O or mutation; unknown input fails closed.
- [ ] Migration guidance requires every live record to migrate or retire, archives to remain sealed
      under one aggregate receipt per repo, and zero bulk issue creation for archive housekeeping.
- [ ] `WorkMigrationManifest` is strict, content-addressed, idempotent, and records zero
      unclassified rows before apply.
- [ ] Template payloads, manifest, generated artifact, validator, and documentation use one schema
      and pass self-verification.
- [ ] `TEMPLATE_VERSION` and `CHANGELOG.md` publish `3.0.0` with an exact canary and AO consumer gate.
- [ ] A second identical migration dry run over fixtures produces byte-identical manifests.
- [ ] Full repo-template verify gate passes.

## Verify

No e2e — portable schema, validator, fixtures, generated template artifact, and documentation only;
no UI, runtime service, or deployment surface.

```bash
corepack.cmd pnpm install --frozen-lockfile --ignore-scripts &&
corepack.cmd pnpm verify &&
node -e "JSON.parse(require('fs').readFileSync('contracts/plan-record/v1/plan-record.schema.json','utf8')); JSON.parse(require('fs').readFileSync('contracts/plan-record/v1/work-migration-manifest.schema.json','utf8'))" &&
test "$(tr -d '\r\n ' < TEMPLATE_VERSION)" = "3.0.0"
```

## Risk

- **Tier:** human
- **Rationale:** This is a breaking fleet-wide structural schema and migration contract. Incorrect
  lifecycle mapping could reject valid work, falsely terminalize work, or amplify GitHub effects.
  The transaction itself is repo-contained and reversible, but adoption is gated by exact release
  pins, a no-mutation validator, dry-run manifests, a canary, and ordinary revert.

## Notes / risks

- Stop if the schema cannot represent an existing record without inventing evidence. Add a fixture
  and an explicit migrate/retire reason instead of expanding `Status` with prose.
- Use the Windows-native `corepack.cmd` launcher because the shared verify runner deliberately
  disables MSYS argument conversion; the extensionless POSIX Corepack shim otherwise resolves
  `/c/Program Files/...` as the invalid native path `C:\c\Program Files\...`.
- Do not call the schema release a fleet migration. Delivery here only creates the immutable
  contract; AO consumption and the canary are separately governed transactions.
- Rollback is an ordinary revert of the release commit/tag before consumer adoption. After a
  consumer adopts it, rollback follows that consumer's recorded manifest and exact release pin.

## Retry history


- 2026-07-28T22:29:10.196Z verify-failed (manual): use Windows-native corepack.cmd under the shared no-path-conversion verify environment
- 2026-07-28T22:17:12.965Z manual (manual): scrub forbidden supervisor model authority before independent critic retry

## Terminal failure receipt — attempt 034-R3

- **attemptId:** `034-R3`
- **terminalOutcome:** `FAILURE` — exact-head review blocked after repair `1/1`; no second source
  repair is authorized.
- **observedAt:** `2026-07-29T04:18:21Z`
- **reviewDeadlineAt:** `2026-07-29T05:15:00Z`
- **deadlineAt:** `2026-07-29T06:00:00Z`
- **controlReadyDeadlineAt:** `2026-07-29T05:30:00Z`
- **conservationDeadlineAt:** `2026-07-29T06:00:00Z`; this TTL is immutable and cannot be
  extended.
- **currentBase:** `4ed1eb5ef676894df4991c85047eb7fdad93ed5e`
- **blockedPr:** [#98](https://github.com/spencer-shadley/repo-template/pull/98)
- **blockedHead:** `e38d81bfff0d0f278597b50e41424651909408da`
- **blockedTree:** `b7c1799efe6101c46e18629c337d9bef36e2dacd`
- **terminalReview:** exact-head
  [review 4803919796](https://github.com/spencer-shadley/repo-template/pull/98#pullrequestreview-4803919796)
  returned terminal `BLOCK` because the new `UNKNOWN_SCHEMA_VERSION` retirement reason is absent
  from `WorkMigrationManifestV1` runtime validation, generated runtime, and JSON Schema; the
  classifier-to-manifest integration repro therefore throws instead of producing a valid
  migrate-or-retire manifest row.
- **Review lineage:** the first exact-head review was
  [4803862406](https://github.com/spencer-shadley/repo-template/pull/98#pullrequestreview-4803862406).
  Its compiled inline findings were
  [future-version fail-closed](https://github.com/spencer-shadley/repo-template/pull/98#discussion_r3670878990),
  [post-merge tag receipt](https://github.com/spencer-shadley/repo-template/pull/98#discussion_r3670878993),
  and [manifest differential](https://github.com/spencer-shadley/repo-template/pull/98#discussion_r3670878996).
  Repair `1/1` produced the blocked head above; the exact-head re-review's remaining integration
  blocker is
  [discussion 3670924380](https://github.com/spencer-shadley/repo-template/pull/98#discussion_r3670924380).
- **Verification caveat:** fresh Windows-native install and full Verify passed `55/55`, typecheck,
  reproducible build/check, artifact verification, user-surface checks, and template self-check on
  the blocked head. The suite lacks the classifier-to-`WorkMigrationManifestV1` integration case,
  so that green receipt does not prove the failed accepted integration contract.
- **Repair disposition:** repair `1/1` is consumed and exhausted. The new integration blocker
  requires a separately re-grounded attempt with a new exit contract; R3 and its review lineage
  may not resume or expand.
- **Effects:** no merge, `v3.0.0` tag creation or push, release publication, runtime, deployment,
  queue execution, source reset, or candidate discard occurred. PR #98 remains open and the remote
  branch `feat/034-publish-portable-planrecordv1-schema-and-migration-contract` remains preserved at
  exact head `e38d81bfff0d0f278597b50e41424651909408da` with all source, gate, review, and reply evidence.
- **Conserved destination:** [repo-template#97](https://github.com/spencer-shadley/repo-template/issues/97)
  is the §22 successor and manual revisit owner, due `2026-07-30`. The terminal receipt is posted
  there and on PR #98 without closing the issue or blocked PR.
- **Queue disposition:** the exact Plan 034 row is removed atomically with this tracked terminal
  receipt; no queue executor is started.
- **Pause disposition:** the ignored canonical `plans/034.paused` paused-human-review sentinel is
  preserved byte-for-byte and remains in force through the terminal control merge. This control
  transaction does not edit or remove it; post-merge pause release requires the coordinator's
  landed-control readback.
- **Control scope/custody:** only this Plan 034 body and `plans/QUEUE.md` may differ from
  `origin/master`. The control writer stops after the two-path commit, push, ready PR publication,
  and immutable comments, then releases all writer/commit/push/PR-metadata custody.
