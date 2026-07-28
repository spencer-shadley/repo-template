# Additive update note for `adoption-status.md`

Status date: **2026-07-28**

## Why this is a separate file

The requested target, `docs/adoption-status.md`, already existed when this task began. The task's
absolute safety rule permits creating new files only, so the existing page could not be updated.
This note records the current census and the exact edits that would have been made. No existing
source, test, configuration, documentation, Git state, issue, or external system was changed.

This fail-closed handling follows fleet principle **P1.1 — Conserve evidence and fail closed under
uncertainty**. Keeping the deliverable to one new documentation file also follows **P2.1 — Prefer
the smallest reversible working source**.

## Current verified template state

The local template checkout declares version **2.6.0** and currently points at commit
`22d2ffce1ef0a9d880b5d839d7d8a24f6ef67366`.

`template-manifest.json` classifies 162 paths:

| Role | Paths | Adoption meaning |
|---|---:|---|
| `copy` | 43 | Portable seed paths added when genuinely missing |
| `merge` | 4 | `.gitignore`, `AGENTS.md`, `CHANGELOG.md`, and `README.md`; merge by hand |
| `self` | 114 | Template implementation and release machinery; not legacy overlay payload |
| `generated` | 1 | Template-owned generated queue/archive state |

The 47-path portable surface provides:

- agent entry points, binding steer, responsibilities/non-goals, product principles, commands,
  validation policy, and tool pointers;
- architecture, migration, queue-enrollment, observability, incident, recovery, security, and ADR
  documentation;
- queue, setup-survey, issue-intake, pull-request, advisory-CI, changelog, and sync-anchor
  scaffolding;
- append-only operational incident evidence;
- a machine-readable model/provider boundary; and
- user-surface leak lint configuration, schema, checker, and deterministic fixtures.

Released structural capability history remains:

| Version | Capability added |
|---|---|
| 1.0.0 | Baseline agent manual, ADRs, operations docs, queue and security scaffolding, setup audit, sync anchor, and SemVer |
| 1.1.0 | Authoritative verification declaration and workspace Git conventions |
| 2.0.0 | Structural manifest plus breaking placeholder, setup-marker, and verify conventions |
| 2.1.0 | Existing-repository overlay playbook |
| 2.2.0 | Near-mandatory autonomous-queue enrollment guide |
| 2.3.0 | Canary-first rollout for major upgrades |
| 2.4.0 | Model boundary, responsibilities/non-goals, product principles, and progressive disclosure |
| 2.5.0 | Deterministic user-surface leak lint |
| 2.6.0 | Binding product steer and measurable principle/SLI/SLO schema |

The current `CHANGELOG.md` Unreleased section also contains breaking `adoption-shell-v2` work,
release receipts and closure validation, delivery-measurement contracts, direct-L0/heartbeat
rules, and expanded lint-fixture closure. Those are current-checkout capabilities, not released
2.6.0 capabilities.

## Canonical adoption ledger

The canonical scope is the 19 projects named in
`../agent-orchestrator/projects.json`, not worktrees or scratch directories. Sixteen repositories
have non-null adoption anchors: 13 declare 2.6.0, two declare 2.3.0, and one declares 2.2.0.
`repo-template` is the producer. `.github` and archived `windmill-pilot` have no adoption anchor.

| Repository | Adopted version | Synced commit | Synced at |
|---|---:|---|---|
| `task-dag` | 2.2.0 | `a75be3fd59cb` | 2026-07-02 |
| `gmail-markdown` | 2.6.0 | `eccb1af35300` | 2026-07-20 |
| `sharingan` | 2.6.0 | `a247068ad955` | 2026-07-27 |
| `agent-orchestrator` | 2.3.0 | `deca3c725307` | 2026-07-09 |
| `code` | 2.6.0 | `a247068ad955` | 2026-07-27 |
| `model-router` | 2.6.0 | `eccb1af35300` | 2026-07-20 |
| `agent-review` | 2.6.0 | `157c98bb24ed` | 2026-07-22 |
| `dotfiles` | 2.3.0 | `83c9ef70b56f` | 2026-07-10 |
| `model-gateway` | 2.6.0 | `75007a567ec5` | 2026-07-23 |
| `fleet-registry` | 2.6.0 | `73853db0f594` | 2026-07-24 |
| `repo-factory` | 2.6.0 | `73853db0f594` | 2026-07-24 |
| `nextsolved` | 2.6.0 | `75007a567ec5` | 2026-07-23 |
| `fetchbranch-app-foundation` | 2.6.0 | `75007a567ec5` | 2026-07-22 |
| `fetchbranch-commerce` | 2.6.0 | `75007a567ec5` | 2026-07-23 |
| `fetchbranch-identity` | 2.6.0 | `75007a567ec5` | 2026-07-22 |
| `fetchbranch-model-gateway` | 2.6.0 | `75007a567ec5` | 2026-07-23 |
| `repo-template` | producer | — | — |
| `.github` | not adopted | — | — |
| `windmill-pilot` | not adopted | — | — |

## Observed drift

### Released-version drift

- `task-dag` is four minor releases behind 2.6.0.
- `agent-orchestrator` and `dotfiles` are three minor releases behind 2.6.0.
- No adopter declares a different major version.
- The breaking Unreleased work must not be treated as silent 2.6.0 patch drift.

### Same-version commit drift

The 13 repositories declaring 2.6.0 point at five different commits:

| Commit | Repositories |
|---|---|
| `eccb1af35300` | `gmail-markdown`, `model-router` |
| `157c98bb24ed` | `agent-review` |
| `75007a567ec5` | `model-gateway`, `nextsolved`, and the four `fetchbranch-*` shared repositories |
| `73853db0f594` | `fleet-registry`, `repo-factory` |
| `a247068ad955` | `code`, `sharingan` |

None equals the current template checkout commit. A semantic version alone therefore does not
identify an exact adopted payload; `syncedCommit` is required for exact comparison.

### Current-manifest path gaps

These are unanchored missing paths compared with today's 47-path portable manifest. They are
review candidates, not automatically defects: today's manifest contains Unreleased changes, setup
lifecycle files can legitimately disappear, and mature local operational documents may replace
template stubs.

- `task-dag`: migration and queue-enrollment docs, model boundary, lint capability, smoke plan,
  and all 16 lint-fixture files.
- `agent-orchestrator` and `dotfiles`: model boundary, lint capability, and all 16 lint-fixture
  files; `dotfiles` also lacks `TODO.md`.
- `model-router`: `.ops/README.md`, `PRIORITIES.md`, `TODO.md`, and all 16 lint-fixture files.
- `agent-review`: `PRIORITIES.md` and all 16 lint-fixture files.
- `model-gateway`: advisory CI, ADR seeds 0000–0005, migration guide, and `TODO.md`.
- `fleet-registry`: issue/advisory-CI seeds, lint capability, ADR seeds 0000–0001, `TODO.md`, and
  all 16 lint-fixture files.
- `repo-factory`: issue/PR templates, changelog, ADR seeds, architecture/operations/migration
  documentation, smoke plan, `TODO.md`, and eight of the 16 lint-fixture files.
- `nextsolved`, `fetchbranch-commerce`, and `fetchbranch-identity`: nine lint-fixture files each.
- `fetchbranch-app-foundation`: four lint-fixture files.
- `fetchbranch-model-gateway`: advisory CI, ADR seeds, migration guide, `TODO.md`, and nine
  lint-fixture files.
- `gmail-markdown` and `code`: all 16 lint-fixture files.
- `sharingan`: smoke plan only.

Most lint-fixture gaps are Unreleased capability-closure delta and do not prove failure to adopt
released 2.6.0.

### Intentional-drift record quality

- Six adopters have object-form skip entries with a reason on every entry: `task-dag`,
  `gmail-markdown`, `sharingan`, `agent-orchestrator`, `code`, and `agent-review`.
- Seven use bare string skips that lack the migration playbook's required per-path durable
  rationale: `dotfiles`, `fleet-registry`, `repo-factory`, `nextsolved`,
  `fetchbranch-app-foundation`, `fetchbranch-commerce`, and `fetchbranch-identity`.
- `model-router`, `model-gateway`, and `fetchbranch-model-gateway` record no skips, so their missing
  portable paths remain unanchored.

### Content drift limits

Global byte equality is not a valid compliance rule because merge files and setup seeds are
supposed to become repository-specific, while the overlay policy preserves mature local
operational truth. Only `code` records a `syncedFileHashes` baseline. The other 15 adopters do not,
so their anchors cannot distinguish post-adoption content changes from customization performed
during adoption.

## Exact changes that were blocked

If editing `docs/adoption-status.md` had been allowed, the verified update would have:

1. changed its status date from 2026-07-27 to 2026-07-28;
2. changed the recorded template checkout commit from
   `63246489d458fa71ccfee1357b369daecaa1ba4b` to
   `22d2ffce1ef0a9d880b5d839d7d8a24f6ef67366`; and
3. changed the matching abbreviated current-checkout commit in the same-version drift section
   from `63246489d458` to `22d2ffce1ef0`.

The manifest counts, released version, adoption-version distribution, adopter anchors, summarized
path gaps, and skip-quality findings were rechecked and did not change.

Normal template discipline would also decide whether the adoption-status document belongs in
`template-manifest.json` and add an Unreleased `CHANGELOG.md` entry. Both are existing files, so
those follow-up changes were prohibited.

## What could not be determined

- Remote branches, tags, and publication state were not queried. The local checkout alone cannot
  prove that every declared release has an authoritative remote annotated tag.
- Content-level semantic drift cannot be classified for adopters without per-file baselines or a
  signed materialization/release receipt.
- Missing lifecycle paths such as `TODO.md` and the smoke plan cannot be classified as accidental
  or completed without a durable skip/receipt.
- No migration priority or ownership decision was inferred, and no plan or issue was created.
