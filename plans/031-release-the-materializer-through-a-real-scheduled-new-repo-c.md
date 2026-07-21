# Plan 031: Release the materializer through a real scheduled new-repo canary

- **Project:** repo-template
- **Branch:** feat/031-release-the-materializer-through-a-real-scheduled-new-repo-c
- **Status:** draft - blocked on 030 -> Code 059 -> 020 and exact external prerequisite receipts
- **Priority:** P1
- **Depends:** 030, 020
- **Effort:** high
- **Issue:** Relates to repo-template #85; the terminal runner closes it only after every receipt is
  green.

## Risk

**Tier: human.** This plan publishes an immutable template release, creates and enrolls a private
canary repository, changes committed/live schedule state, enables one experimental drain, and closes
an issue. Use the governed human lane. Spencer's commission is approval provenance for this exact
terminal route; it does not require repeated approvals at each reversible step.

The canary is intentionally trial-by-fire. Once every deterministic prerequisite is green, run the
real production schedule and learn from the first automatic merge. Do not replace that proof with
another synthetic readiness review. On failure, retreat the canary schedule to disabled, preserve
all evidence, and leave #85 open; do not weaken verification or target autonomy.

## Objective

Publish the first released version of the new-only materializer only after it:

1. resolves current Node/pnpm versions from official live metadata;
2. produces an exact clean candidate repository;
3. is consumed through the production adoption skill;
4. enrolls a private experimental canary with repo-local CI and external operational state;
5. proves post-enrollment worker capacity and committed schedule truth;
6. automatically merges and archives one harmless plan through a real scheduled Windmill tick;
7. remains checkout-clean on the next tick while external `.ops` publication advances; and
8. binds the immutable release tag, source SHA, receipts, and issue closure in that order.

## Same-repository dependency

Plans 030 and 020 must be archived as landed. Plans 028 and 029 are inherited transitively through
030. The refreshed Plan 020 must bind Code Plan 059's exact landed label-reconciliation receipt.

## External prerequisites

This plan is intentionally non-executable until a governed amendment commits
`plans/031.prerequisites.json`, validated by
the already-landed Plan-030 `schemas/release-prerequisites.schema.json` through the Plan-030
production validator, and changes Status to `ready for codex`.
That file must contain the exact landed plan numbers, origin SHAs, schema versions, and
content/receipt hashes below. The terminal runner reads that one file, re-derives each identity from
origin/live readback, and rejects mismatch. Issue/plan status or prose is never sufficient.

1. **AO Plan 423 — registry contract**
   - landed producer SHA;
   - validation-receipt digest;
   - technology/component registry digests; and
   - resolution request/receipt schema version.
2. **AO Plan 424 — repo-local CI**
   - landed shared-resolver SHA;
   - production `effectiveVerifyGate` and `localCiGreen` readbacks; and
   - transition/malformed/deletion proof. Plan 425 cleanup is desirable evidence but does not block
     this canary when Plan 424's authority is already singular and fail-closed.
3. **Code Plan 059 — adoption consumer**
   - landed SHA for the one-shot materialize→private-origin→staged-ready
     transaction;
   - packet and staged-receipt schema hashes; and
   - disabled-schedule activation patch contract;
   - reusable external-ops new-repository initialization receipt; and
   - idempotent `.github/labels.yml` reconciliation receipt consumed by Plan 020.
4. **Workspace resolver**
   - AO Plan 389 landed SHA plus a nonlegacy path/relocation test proving logical resolution without
     physical `C:\code\<repo>` assumptions. Closing repo-template #84 is audit-only if this proof is
     green.
5. **External operations state**
   - AO Plans 418 and 419 landed plus the exact P3 projection receipt owned by AO #1678;
   - exact P4-P8 serialized publish, dormant routing, proof, prepared-generation, per-repo cutover,
     reader/writer redirection, rollback, and checkout-clean receipts owned by AO #1679;
   - the reusable new-repository initializer used by Code Plan 059;
   - canonical `ops-store-activation/v1` journal and publication-HWM schema hashes; and
   - repo-template, code, and AO cutover green. Any `.store-active` file is a derived cache/receipt,
     never activation authority. P9/P10 historical cleanup is not release-blocking.
6. **Schedule truth and capacity**
   - the committed-YAML one-way reconciler/kill-switch chain (Plan 270 and exact landed
     prerequisites/successor receipts);
   - AO Plan 384 or its exact successor proving live flow-worker capacity is at least the
     post-enrollment drainable-repository count; and
   - no untracked live-only schedule.

Missing/mismatched prerequisites produce `terminal-prerequisite-red` with zero release, tag,
schedule-enable, or issue-close effects.

## Changes

### 1. Freeze the terminal input and release candidate

Add:

- `schemas/release-canary-input.schema.json`;
- `schemas/template-release-receipt.schema.json`;
- `fixtures/release-canary/input.json`;
- `scripts/release-materializer.mjs` as the thin terminal state-machine CLI; and
- `scripts/lib/release-candidate-source.mjs` as the exact-SHA private candidate adapter.

Register every new Plan-031 schema, fixture, and script in `template-manifest.json` with mode `self`;
none may appear in a materialized product repository.

The closed `release-canary-input/v1` fixture names:

- exact Plan-030 source SHA and content tree;
- exact external prerequisite receipts above;
- a dedicated hyphen-case canary identity and private GitHub owner;
- experimental/low-criticality autonomy posture;
- no UI, customer, external service, port, database, secret, billing, DNS, or deployment
  requirement;
- one harmless auto-tier smoke change and bounded `corepack pnpm verify` gate;
- committed schedule cadence/timezone;
- expected post-enrollment capacity; and
- evidence store identities.

The canary identity must be unused across workspace registry, GitHub, Windmill, external ops store,
and local destination. Any collision is a loud no-op; never adopt or delete an existing identity.

### 2. Resolve the exact release version and live toolchain

At one injected clock instant:

1. fetch Node's official release `schedule.json` and distribution `index.json`;
2. select the current Active-LTS major and newest exact release in that major;
3. fetch npm registry metadata for pnpm and select `dist-tags.latest` plus exact integrity;
4. enforce timeout, retry, media type, response-size, schema, semver, raw hash, and selected-record
   canonical hash rules from Plan 030; and
5. store raw evidence and canonical selection receipts without local-installed fallback.

First reconcile the historical release ledger: remote `v2.6.0` must point to the exact Plan-028
release commit. If absent, create/push it once after verifying the commit and changelog; if it points
elsewhere, fail closed and never move it.

Compute the terminal version as the next minor above the exact source `TEMPLATE_VERSION` with patch
zero—expected `2.7.0`, never hardcoded. Fail if the changelog heading or remote/local tag already
exists with a different identity.

### 3. Build and verify an exact candidate

From a clean immutable source worktree:

- stamp the live toolchain and exact external producer identities;
- flip compatibility from `unreleased` to `released` only in the terminal candidate;
- set `TEMPLATE_VERSION` and changelog to the computed next minor;
- compute `releaseContentDigest` over the sorted path/mode/blob tuples for every tracked path except
  `plans/**` and `.ops/**`; this is the stable product/template identity across governed
  squash-merge bookkeeping;
- run frozen install, docs lint, validator, focused tests, and bootstrap canary;
- run production-mode materialization once through a terminal-private candidate-source adapter
  bound to the exact SHA; and
- validate the generated pre-Git tree, receipt inventory, absence of template self-state, and
  current source/version/guide/registry/toolchain stamps.

The public materializer still rejects an untagged/unreleased source. The private candidate adapter
exists only inside the terminal runner, accepts one exact candidate SHA, and cannot be invoked by a
normal adoption. No public `--allow-unreleased` escape hatch is added.

### 4. Adopt one private canary through the production skill

Invoke Code Plan 059's adoption transaction with the complete input packet and the terminal-private
candidate-source adapter:

- call the materializer exactly once;
- create a private GitHub repository with only `master` as published default;
- publish the validated initial tree;
- generate and land the separately governed AO enrollment plan;
- commit the registry row and `enabled: false` schedule together;
- provision/read back post-enrollment capacity;
- reconcile/read back the live schedule as disabled;
- prove the generated repo-local `local-ci.json` is authoritative;
- reconcile/read back every label in the generated `.github/labels.yml` catalog and prove a canary
  feedback issue receives `human-feedback` automatically;
- establish agy/read-only permission/telemetry integration; and
- leave exactly one harmless automatic smoke plan pending.

Require the staged receipt's negative assertions:
`scheduleEnabled=false`, `drainDispatched=false`, and `automaticMergeObserved=false`.

### 5. Activate once and prove the real scheduled lane

Apply the generated one-line committed schedule change `enabled: false` → `enabled: true` through
the canonical governed route. Then:

1. reconcile and read back the exact committed/live schedule identity;
2. wait for the next real scheduled `drain_queue` Windmill job—never invoke a manual drain;
3. prove it selected the expected smoke plan, used the generated local-CI contract, implemented,
   reviewed, squash-merged, and archived plan/result/log evidence;
4. bind job ID, schedule revision, plan/branch/PR/merge/archive SHAs, gate IDs/results, models, and
   timestamps;
5. observe the following scheduled tick and prove the queue is empty, checkout is clean, no lease
   or process remains, and no duplicate execution occurred; and
6. prove external `.ops` shards/publication advanced their HWM while no telemetry dirt touched the
   product checkout or raced the merge.

On deterministic plan failure, schedule mismatch, capacity loss, dirty checkout, duplicate writer,
or ops-publication ambiguity, immediately commit/reconcile `enabled: false`, record a terminal-red
receipt, keep every artifact, and leave #85 open. The retreat changes only execution state; it does
not lower the canary's declared autonomy policy, verification contract, or future eligibility.

### 6. Cross the governed merge boundary, then publish

After both scheduled ticks and external-state proofs are green:

1. The pre-merge terminal phase writes an immutable `premerge-canary-green/v1` receipt containing
   the reviewed candidate head SHA, `releaseContentDigest`, prerequisite set, scheduled canary/tick
   evidence, and exact review result; then it returns `merge-required` without merging, checking out,
   committing, or pushing the candidate branch.
2. The governed human lane alone merges the exact reviewed head and emits a merge receipt containing
   PR/head/merged SHAs and the normalized content digest. The terminal runner never merges its own
   PR.
3. A post-merge resume reads origin and requires the merged commit's `releaseContentDigest` to equal
   the pre-merge candidate digest. Candidate SHA and squash-merged SHA remain distinct recorded
   identities; plan/queue/archive bookkeeping is excluded from the digest, not ignored by review.
4. Create the computed annotated tag locally on the exact merged commit, but do not push it.
5. Run the full local deterministic gate and materialize once through the normal tagged production
   entrypoint using that local immutable tag. Compare its normalized receipt/tree identity to the
   canary candidate.
6. Only after that final gate is green, push the annotated tag once and verify the remote tag resolves
   to the merged SHA. Any failure before push leaves no public release tag.
7. Create-only publish `template-release-receipt/v1` to the immutable external evidence store at
   `template-release-receipts/<tag>/<merged-sha>/<release-content-digest>.json`. The receipt contains
   every prerequisite, toolchain, candidate/merged identity, adoption, schedule, job, ops-HWM, local
   tag, remote tag, and final materialization identity. Conflicting existing bytes are red.
8. Post only the receipt digest and immutable evidence-store pointer to repo-template #85, then close
   #85 last.

The release PR must not contain `Fixes #85`; premature PR merge must not close the issue.

## Out of scope

- Enabling autonomy for the operator's future product repository; this plan enables only the
  disposable/dedicated release canary.
- Product application code, services, credentials, deployment, billing, DNS, or customer effects.
- Existing-repository migration through the new-only materializer.
- Broad #1278 critic/audit rollout unrelated to materialization.
- Physical repo-template relocation when canonical resolver/path-independence proof is green.
- P9/P10 cleanup of historical in-repo `.ops` evidence.
- Historical plan cleanup; the 2026-07-21 disposition ledger already owns and preserves it.

## Acceptance criteria

- [ ] Every prerequisite is immutable, exact, landed, and schema/hash validated.
- [ ] Historical `v2.6.0` and the dynamic next-minor release ledger are coherent; no tag is moved.
- [ ] Official live Node/pnpm resolution is bounded, hashed, exact, and reproducible.
- [ ] The candidate produces a marker-free, pre-Git repository with current immutable stamps.
- [ ] The production adoption transaction—not bespoke hand edits—creates and stages the canary.
- [ ] Plan 020's feedback form/catalog is present in the candidate; Code Plan 059 reconciles its
      labels idempotently and a canary filing receives `human-feedback`.
- [ ] Registry, disabled schedule, resolver, local-CI, permissions, telemetry, and capacity receipts
      are green before activation.
- [ ] A real scheduled Windmill tick automatically merges and archives the smoke plan.
- [ ] The following scheduled tick is clean/idle with exactly one writer and no duplicate.
- [ ] External ops publication advances while the checkout remains clean before, during, and after
      merge.
- [ ] Failure retreats to disabled without weakening autonomy, verification, or evidence.
- [ ] Reviewed candidate SHA and squash-merged SHA are recorded separately and share the exact
      normalized `releaseContentDigest`; version, changelog, compatibility, tag, materialization,
      and receipt all agree.
- [ ] The terminal runner returns at the merge boundary; only the governed human lane merges the
      reviewed head, and post-merge release resumes from immutable pre-merge/merge receipts.
- [ ] The remote tag is absent until normal tagged production materialization passes locally.
- [ ] The authoritative receipt is create-only in the external evidence store; #85 contains only its
      digest/pointer and closes last.
- [ ] #85 remains open on any failure and closes only after the remote tag/final receipt readback.
- [ ] Re-running against the same completed identities is a no-op; any conflicting identity is red.

## Verify

Local deterministic gate:

```bash
set -e
corepack pnpm install --frozen-lockfile
corepack pnpm docs:lint
corepack pnpm validate
corepack pnpm test
corepack pnpm bootstrap:canary
git diff --check
```

The resumable terminal state machine additionally performs the authenticated GitHub, AO registration,
committed/live schedule, capacity, Windmill scheduled-job, local-CI provenance, two-tick,
external-ops HWM, pre-merge receipt, governed-merge handoff, local-tag gate, remote-tag, immutable
release-receipt, and #85 closure readbacks above. Tests cover every phase transition and prove the
runner has no merge action. Those live receipts are acceptance evidence, not replaced by the local
gate.

The terminal remains one plan because the candidate-source override, staged canary identity,
activation, immutable pre-merge receipt, governed merge handoff, content-equivalent release commit,
tag, and final production materialization form one fail-closed identity chain. The runner itself is
phased and yields git authority at `merge-required`; keeping the contract in one plan does not give it
merge ownership. Splitting at `staged-ready` would strand a private override/candidate whose later
plan could no longer prove it is the tested release input. The state machine persists a receipt before
each boundary and resumes without repeating effects.

## Rollback and idempotency

- Before canary origin creation: remove only the owned OS-temp stage/transaction through its API.
- After private origin creation: never auto-delete it; preserve/resume by node ID and exact ref.
- After enrollment but before activation: leave schedule disabled and halt. If rollback is actually
  commissioned, the operator authors a separately numbered AO de-enrollment plan through the
  governed queue only after proving there is no job, lease, or writer; this release plan neither
  invents that plan preemptively nor mutates the registry during rollback.
- After activation failure: first retreat committed/live schedule to disabled, then diagnose.
- After tag publication: tags are immutable. Correct forward with a new version; never force-move.
- Same packet/tag/SHA/closed-issue receipt is success/no-op; any mismatch is deterministic red.
