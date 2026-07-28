# Template adoption status

Status date: **2026-07-27**  
Template checkout: `C:\code\repos\infra\repo-template` at `63246489d458fa71ccfee1357b369daecaa1ba4b`  
Declared release: **2.6.0**

This page records three different facts that should not be collapsed into one:

1. what the current template checkout declares and supplies;
2. which semantic version and commit each canonical fleet repository says it adopted; and
3. observable differences between the current template manifest and each adopter.

The semantic version is the migration-policy anchor. The commit is the exact-content anchor.
Neither a matching version nor a matching path inventory proves that customized file contents are
current.

## Sources and scope

The inventory is derived from:

- [`TEMPLATE_VERSION`](../TEMPLATE_VERSION) and [`CHANGELOG.md`](../CHANGELOG.md);
- [`template-manifest.json`](../template-manifest.json);
- each repository's root `.template-sync.json`;
- the canonical project set in
  [`agent-orchestrator/projects.json`](../../agent-orchestrator/projects.json); and
- the overlay rules in [`MIGRATION.md`](MIGRATION.md).

Only the 19 projects named by `projects.json` are counted. Scratch directories, review artifacts,
and worktrees are excluded even when they contain copied `.template-sync.json` files. The scan found
229 anchors under `C:\code`; that larger number is not a repository-adoption count.

No network state was consulted. “Missing” below means absent from the local canonical checkout and
not covered by a matching `skipPaths` entry.

## What the template provides

The current manifest classifies 162 paths:

| Role | Paths | Meaning |
|---|---:|---|
| `copy` | 43 | Portable seed; add when genuinely missing, preserving existing operational truth |
| `merge` | 4 | Hand-merge only: `.gitignore`, `AGENTS.md`, `CHANGELOG.md`, and `README.md` |
| `self` | 114 | Template implementation/release machinery; not copied by the legacy overlay |
| `generated` | 1 | Template-owned generated queue/archive state |

The 47-path portable surface provides:

- agent entry points and steering: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `PRIORITIES.md`;
- architecture and operations documentation: architecture, migration, queue enrollment,
  observability, incidents, runbook, security, and ADR seeds;
- governance and delivery scaffolding: changelog, setup survey, subscription anchor, queue smoke
  plan, issue form, pull-request template, and advisory CI;
- operational evidence: the `.ops` incident-stream contract;
- model governance: `model-boundary.json`; and
- user-surface protection: lint configuration, schema, checker, and fixture trees.

The 114 `self` paths now also contain the unreleased `adoption-shell-v2`: closed schemas,
dependency-free compiled artifacts, deterministic materialization, capability bundles, digests,
release receipts, validation, fixtures, and tests. This is implementation and release machinery,
not another set of files that legacy adopters should copy directly.

### Released capability history

| Version | Structural capability |
|---|---|
| 1.0.0 | Baseline agent manual, ADRs, operations docs, queue scaffold, security, changelog, tool pointers, issue/CI seeds, setup audit, sync anchor, and SemVer |
| 1.1.0 | Authoritative verification declaration and workspace Git conventions |
| 2.0.0 | Structural manifest; standardized placeholders and setup markers; breaking setup/verify conventions |
| 2.1.0 | Existing-repository overlay playbook |
| 2.2.0 | Near-mandatory autonomous-queue enrollment guide |
| 2.3.0 | Canary-first rollout for major template upgrades |
| 2.4.0 | Model boundary, responsibilities/non-goals, product principles, and progressive disclosure |
| 2.5.0 | Deterministic user-surface leak lint |
| 2.6.0 | Binding product steer and measurable principle/SLO schema |

The current `Unreleased` section contains breaking `adoption-shell-v2` work, expands lint-fixture
closure, adds direct-L0 and delivery-measurement contracts, and changes release behavior. It must
not be described as released 2.6.0 capability.

## Adoption ledger

Summary: **16 adopters** — 13 at 2.6.0, 2 at 2.3.0, and 1 at 2.2.0. `repo-template` is the producer,
not an adopter. `.github` and archived `windmill-pilot` have no adoption anchor.

“Current-manifest gap” compares with today's 47-path portable manifest. `lint fixtures N/16`
compresses missing files below `tests/fixtures/user-surface-lint/`. `TODO.md` and the smoke plan are
lifecycle files that may legitimately disappear after setup/enrollment, but an intentional
omission should still be anchored.

| Repository | Adopted version | Synced commit | Synced at | Skips | Current-manifest gap |
|---|---:|---|---|---:|---|
| `task-dag` | 2.2.0 | `a75be3fd59cb` | 2026-07-02 | 2 reasoned | lint fixtures 16/16; `.user-surface-lint.json`; `.user-surface-lint.schema.json`; `docs/MIGRATION.md`; `docs/QUEUE-ENROLLMENT.md`; `model-boundary.json`; smoke plan; lint script |
| `gmail-markdown` | 2.6.0 | `eccb1af35300` | 2026-07-20 | 11 reasoned | lint fixtures 16/16 |
| `sharingan` | 2.6.0 | `a247068ad955` | 2026-07-27 | 5 reasoned | smoke plan |
| `agent-orchestrator` | 2.3.0 | `deca3c725307` | 2026-07-09 | 12 reasoned | lint fixtures 16/16; `.user-surface-lint.json`; `.user-surface-lint.schema.json`; `model-boundary.json`; lint script |
| `code` | 2.6.0 | `a247068ad955` | 2026-07-27 | 14 reasoned | lint fixtures 16/16 |
| `model-router` | 2.6.0 | `eccb1af35300` | 2026-07-20 | 0 | lint fixtures 16/16; `.ops/README.md`; `PRIORITIES.md`; `TODO.md` |
| `agent-review` | 2.6.0 | `157c98bb24ed` | 2026-07-22 | 1 reasoned | lint fixtures 16/16; `PRIORITIES.md` |
| `dotfiles` | 2.3.0 | `83c9ef70b56f` | 2026-07-10 | 1 bare | lint fixtures 16/16; `.user-surface-lint.json`; `.user-surface-lint.schema.json`; `model-boundary.json`; lint script; `TODO.md` |
| `model-gateway` | 2.6.0 | `75007a567ec5` | 2026-07-23 | 0 | advisory CI; ADR seeds 0000–0005; `docs/MIGRATION.md`; `TODO.md` |
| `fleet-registry` | 2.6.0 | `73853db0f594` | 2026-07-24 | 5 bare | lint fixtures 16/16; `.user-surface-lint.json`; `.user-surface-lint.schema.json`; ADR seeds 0000–0001; lint script; `TODO.md` |
| `repo-factory` | 2.6.0 | `73853db0f594` | 2026-07-24 | 6 bare | lint fixtures 8/16; PR template; changelog; ADR seeds 0000–0005; architecture, incidents, migration, observability, queue-enrollment, and runbook docs; `TODO.md` |
| `nextsolved` | 2.6.0 | `75007a567ec5` | 2026-07-23 | 13 bare | lint fixtures 9/16 |
| `fetchbranch-app-foundation` | 2.6.0 | `75007a567ec5` | 2026-07-22 | 12 bare | lint fixtures 4/16 |
| `fetchbranch-commerce` | 2.6.0 | `75007a567ec5` | 2026-07-23 | 13 bare | lint fixtures 9/16 |
| `fetchbranch-identity` | 2.6.0 | `75007a567ec5` | 2026-07-22 | 12 bare | lint fixtures 9/16 |
| `fetchbranch-model-gateway` | 2.6.0 | `75007a567ec5` | 2026-07-23 | 0 | lint fixtures 9/16; advisory CI; ADR seeds 0000–0005; `docs/MIGRATION.md`; `TODO.md` |
| `repo-template` | producer | — | — | — | Template source; its null sync fields are intentional |
| `.github` | not adopted | — | — | — | No `.template-sync.json` |
| `windmill-pilot` | not adopted | — | — | — | Archived; no `.template-sync.json` |

## Drift findings

### Released-version drift

- `task-dag` is four minor releases behind the declared 2.6.0 release. Its unanchored missing
  migration and queue-enrollment docs are especially notable because both should already be in the
  claimed 2.2.0 lineage.
- `agent-orchestrator` and `dotfiles` are three minor releases behind. Their current gaps align with
  later model-boundary and user-surface-lint capabilities.
- No adopter reports a different major version, but current unreleased work is explicitly breaking
  and therefore cannot be treated as silent patch drift.

Per the subscription comment, minor drift is “should adopt”; major drift is “must migrate”; patch
drift is silent. This inventory reports facts and does not enqueue migrations.

### Same-version commit drift

The 13 repositories claiming 2.6.0 point at five different commits:

| Commit | Repositories |
|---|---|
| `eccb1af35300` | `gmail-markdown`, `model-router` |
| `157c98bb24ed` | `agent-review` |
| `75007a567ec5` | `model-gateway`, `nextsolved`, and the four `fetchbranch-*` shared repos |
| `73853db0f594` | `fleet-registry`, `repo-factory` |
| `a247068ad955` | `code`, `sharingan` |

None equals the current template checkout `63246489d458`. A 2.6.0 label therefore does not identify
one payload. Exact drift review must use `syncedCommit`, not only `syncedVersion`.

The local template checkout contains tag refs for `v2.0.0`, `v2.1.0`, and `v2.2.0`, but no local
tag refs for `v2.3.0` through `v2.6.0`. The repository's versioning contract says a release includes
a matching Git tag. This local checkout cannot prove that the later changelog headings are tagged;
remote tag state was not checked.

### Unanchored structural gaps

Against today's manifest, the largest non-fixture, non-lifecycle gaps are:

- `repo-factory`: core governance and operations docs, the changelog, PR template, and ADR seeds;
- `model-gateway` and `fetchbranch-model-gateway`: advisory CI, ADR seeds, and migration guide;
- `task-dag`: migration/queue docs, model boundary, and lint capability;
- `agent-orchestrator` and `dotfiles`: model boundary and lint capability; and
- `fleet-registry`: lint capability and two ADR seeds.

These are candidates for review, not automatic defects. The current manifest includes unreleased
changes, and the overlay policy permits mature operational documents to win. A missing path becomes
intentional drift only when `skipPaths` records it with durable rationale.

The lint-fixture gaps are mostly unreleased capability-closure work. They show current-checkout
delta, not necessarily failure to adopt released 2.6.0.

### Intentional-drift record quality

Six adopters use object-form skips with a reason on every entry: `task-dag`, `gmail-markdown`,
`sharingan`, `agent-orchestrator`, `code`, and `agent-review`.

Seven use one or more bare string skips: `dotfiles`, `fleet-registry`, `repo-factory`, `nextsolved`,
`fetchbranch-app-foundation`, `fetchbranch-commerce`, and `fetchbranch-identity`. Bare entries do
not carry the per-path ADR or changelog citation required by the migration playbook, even when the
anchor has a general explanatory comment.

The other three adopters (`model-router`, `model-gateway`, and `fetchbranch-model-gateway`) have no
skips, so every missing portable path remains unanchored.

### Content drift that cannot be classified globally

Exact byte comparison with the current template is not a reliable compliance test:

- all four `merge` files are expected to differ;
- copied setup seeds are expected to replace placeholders with repository-specific truth; and
- the migration playbook explicitly preserves mature local operational documentation.

Only `code` records a `syncedFileHashes` baseline. Nine paths are covered; `.gitignore` and
`.user-surface-lint.json` have changed since that baseline, and none of the nine is missing. Those
changes may be legitimate local integration and need semantic review.

The other 15 adopters do not record file hashes, so this inventory cannot distinguish content
changed after adoption from content already customized during adoption.

## Follow-up work not performed

This task was additive-only. It did not edit adopters, update anchors, create migration plans,
modify the manifest/changelog, fetch tags, commit, push, or file/close issues.

Normal template discipline would require deciding whether this page is `copy` or `self` in
`template-manifest.json` and recording the structural addition under `CHANGELOG.md` Unreleased.
Those existing-file edits were prohibited here and remain explicit follow-up work.

Before using this page as an automated gate:

1. resolve and publish/fetch authoritative tags for every declared release;
2. define whether current-manifest comparison should target the latest release commit or template
   HEAD;
3. standardize reasoned `skipPaths` objects and wildcard semantics;
4. decide which lifecycle paths may disappear without a skip; and
5. add per-file sync hashes, or a signed materialization receipt, to every adopter that needs
   content-level drift detection.
