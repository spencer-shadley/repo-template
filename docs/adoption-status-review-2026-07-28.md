# Adoption-status review

Status date: **2026-07-28**

## Why this note exists

The requested destination, `docs/adoption-status.md`, was already a tracked file when this task
began. The task's absolute additive-only rule prohibits modifying or replacing it, so it was left
untouched. This note is the permitted deliverable: it records the current revalidation and the
exact update that would otherwise have been made.

This fail-closed disposition follows fleet principle **P1.1 — Conserve evidence and fail closed
under uncertainty**. Limiting the result to reversible documentation follows **P2.1 — Prefer the
smallest reversible working source**.

## Revalidated facts

The existing canonical page already documents the requested scope:

- what the template provides, including released capability history and unreleased
  `adoption-shell-v2` machinery;
- every canonical repository's declared template version and exact synced commit; and
- released-version, same-version commit, path, skip-record, and unclassifiable content drift.

The 2026-07-28 rescan used these primary local sources:

- `TEMPLATE_VERSION`, `CHANGELOG.md`, and `template-manifest.json`;
- `../agent-orchestrator/projects.json`; and
- each canonical repository's root `.template-sync.json` and current path inventory.

The rescan found no substantive census change:

| Fact | Current result |
|---|---:|
| Declared template release | 2.6.0 |
| Manifest paths | 162 |
| Portable paths (`copy` + `merge`) | 47 |
| Template-only paths (`self`) | 114 |
| Generated paths | 1 |
| Anchored adopters | 16 |
| Adopters declaring 2.6.0 | 13 |
| Adopters declaring 2.3.0 | 2 |
| Adopters declaring 2.2.0 | 1 |

`repo-template` remains the producer rather than an adopter. The canonical `.github` repository
and archived `windmill-pilot` still have no adoption anchor.

The material drift findings also remain unchanged:

- `task-dag` is four minor releases behind 2.6.0;
- `agent-orchestrator` and `dotfiles` are three minor releases behind;
- the 13 repositories declaring 2.6.0 still point at five different synced commits;
- current-manifest gaps remain concentrated in unreleased user-surface-lint fixture closure,
  plus the repository-specific governance and lifecycle gaps already listed in the canonical page;
- seven adopters still use at least one bare string `skipPaths` entry without a per-path reason;
  three adopters have no skips despite missing portable paths; and
- only `code` records `syncedFileHashes`, so content-level drift remains unclassifiable for the
  other 15 adopters.

## Exact canonical-page update that was blocked

If existing-file edits had been allowed, `docs/adoption-status.md` would have been refreshed to:

1. advance its status date from 2026-07-27 to 2026-07-28;
2. distinguish the original census snapshot
   (`63246489d458fa71ccfee1357b369daecaa1ba4b`) from the currently verified template checkout
   (`b45ecfe64d17a450982c352e6e67ee48ca2d442a`); and
3. state that the only paths added between those commits are adoption-status documentation files,
   so the manifest, released version, adopter anchors, and summarized drift results did not change.

Normal template discipline would also decide whether adoption-status documentation belongs in
`template-manifest.json` and record the structural addition in `CHANGELOG.md` Unreleased. Both are
existing files, so neither change was made.

## What could not be determined

- No remote state was queried, so remote branches, annotated tags, and publication authority were
  not verified.
- Missing setup-lifecycle files cannot be classified as accidental or completed without a durable
  skip or receipt.
- Semantic content drift cannot be reconstructed for adopters without file-hash baselines or a
  signed materialization/release receipt.
- No migration priority or ownership decision was inferred.

The first local draft of this note, `docs/adoption-status-additive-review.md`, is hidden by the
checkout's `.git/info/exclude` rule `docs/*additive*`. The safety rule forbids deleting it, so this
visible copy was created under a non-excluded name.

No existing source, test, configuration, documentation, Git state, issue, or external system was
changed. Nothing was deleted, committed, pushed, or closed.
