# Plan 034: Publish portable PlanRecordV1 schema and migration contract

- **Project:** repo-template
- **Branch:** feat/034-publish-portable-planrecordv1-schema-and-migration-contract
- **Status:** ready for codex
- **Requeue-reason:** verify-failed: use Windows-native corepack.cmd under the shared no-path-conversion verify environment
- **Priority:** P1
- **Issue:** repo-template#97
- **Effort:** high

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
