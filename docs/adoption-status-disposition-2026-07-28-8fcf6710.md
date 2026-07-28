# Adoption-status create-only disposition

Status date: **2026-07-28**

## Stop condition

The requested `docs/adoption-status.md` already existed when this task began. The absolute
create-only safety rule therefore prohibited refreshing or replacing it. This new file records the
verified current state and the exact existing-file update that was blocked.

This disposition follows fleet principles **P1.1 — Conserve evidence and fail closed under
uncertainty** and **P2.1 — Prefer the smallest reversible working source**.

## Template provision

The local template checkout declares release **2.6.0** and points at
`8fcf671088da462e1486d78d99bac3416e588501`.

`template-manifest.json` classifies 162 paths:

| Role | Count | Meaning |
|---|---:|---|
| `copy` | 43 | Portable seed paths, subject to overlay preservation rules |
| `merge` | 4 | `.gitignore`, `AGENTS.md`, `CHANGELOG.md`, and `README.md` |
| `self` | 114 | Template implementation/release machinery, not legacy overlay payload |
| `generated` | 1 | Template-owned generated state |

The 47 portable paths provide agent entry points and binding steer; architecture, migration,
queue-enrollment, observability, incident, recovery, security, and ADR documentation; queue,
setup, issue, pull-request, CI, changelog, and sync scaffolding; the append-only incident contract;
a model-boundary declaration; and user-surface leak lint configuration, schema, checker, and
fixtures.

The checkout also contains unreleased `adoption-shell-v2` materialization, capability, digest,
receipt, validation, delivery-measurement, fixture, and test machinery. Those `self` paths are not
released 2.6.0 portable capability.

## Canonical adoption ledger

The source of scope is the 19 projects in `../agent-orchestrator/projects.json`. Scratch
directories and worktrees are excluded.

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

There are 16 anchored adopters: 13 at 2.6.0, two at 2.3.0, and one at 2.2.0.

## Revalidated drift

- `task-dag` is four minor releases behind release 2.6.0.
- `agent-orchestrator` and `dotfiles` are three minor releases behind.
- The 13 repositories declaring 2.6.0 point at five different synced commits. Exact payload
  identity therefore requires `syncedCommit`, not only `syncedVersion`.
- Current-manifest gaps remain concentrated in unreleased lint-fixture closure, plus the
  repository-specific governance, operations, model-boundary, lint-capability, and setup-lifecycle
  gaps itemized in the existing canonical page.
- Six adopters reason every `skipPaths` entry. Seven use at least one bare string skip without a
  per-path reason. Three record no skips despite missing portable paths.
- Only `code` records `syncedFileHashes`; content changed after adoption cannot be separated from
  adoption-time customization for the other 15 adopters.

These are review candidates, not automatic defects. The current manifest includes unreleased work,
setup lifecycle files may legitimately disappear, and the migration overlay preserves mature local
operational truth.

## Exact refresh that was blocked

If existing-file edits had been allowed, `docs/adoption-status.md` would have been changed only to:

1. advance its status date from 2026-07-27 to 2026-07-28;
2. distinguish its original census snapshot
   (`63246489d458fa71ccfee1357b369daecaa1ba4b`) from the current checkout
   (`8fcf671088da462e1486d78d99bac3416e588501`); and
3. record that intervening commits add adoption-status documentation only, leaving
   `TEMPLATE_VERSION`, `template-manifest.json`, canonical adoption anchors, and substantive drift
   results unchanged.

Normal template discipline would also decide whether adoption-status documentation belongs in
`template-manifest.json` and add a `CHANGELOG.md` Unreleased entry. Both are existing files and were
not changed.

## Unknowns

- Remote branches, annotated tags, and publication authority were not queried.
- Local packed refs contain `v2.0.0`, `v2.1.0`, and `v2.2.0`, but no local tag refs for 2.3.0
  through 2.6.0; this does not establish remote tag absence.
- Missing lifecycle files cannot be classified as accidental or completed without a durable skip
  or receipt.
- Semantic content drift cannot be reconstructed without file-hash baselines or a signed
  materialization/release receipt.
- No migration priority, owner, plan, or issue was inferred or created.

No existing source, test, configuration, or documentation file was modified. Nothing was deleted,
committed, pushed, or closed.
