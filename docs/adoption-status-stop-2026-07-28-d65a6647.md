# Template adoption status — create-only stop

Status date: **2026-07-28**

Requested destination: [`docs/adoption-status.md`](adoption-status.md)

## Safety disposition

`docs/adoption-status.md` was already tracked when this task began. The task permits creating new
files only, so the existing page was not modified. This file is the required blocked-change
deliverable: it records the refresh that would have been made.

No existing source, test, configuration, documentation, Git state, issue, or external system was
changed. Nothing was deleted, committed, pushed, or closed.

## What the existing page already documents

The existing canonical page covers the requested subjects:

- the template's released and unreleased capabilities;
- the portable `copy` and `merge` surface versus template-only implementation files;
- every canonical repository's declared template version, commit, and sync date; and
- released-version lag, same-version commit divergence, portable-path gaps, intentional skip
  quality, and the limits of content-level drift detection.

A local recheck found these substantive figures unchanged:

| Fact | Current local evidence |
|---|---:|
| Declared template release | `2.6.0` |
| Manifest paths | 162 |
| Portable paths | 47 (`copy`: 43; `merge`: 4) |
| Template-only paths | 114 `self`; 1 `generated` |
| Canonical registered projects | 19 |
| Repositories with non-null adoption anchors | 16 |
| Adoption distribution | 13 at `2.6.0`; 2 at `2.3.0`; 1 at `2.2.0` |

The portable surface provides agent rules and priorities, architecture/operations/security/ADR
documentation, migration and queue-enrollment guidance, queue/setup/review scaffolding, the
template subscription anchor, incident-stream conventions, a provider-neutral model boundary, and
user-surface leak lint configuration, checker, and fixtures. The current checkout also contains
unreleased `adoption-shell-v2`, release-closure, delivery-measurement, direct-L0, and expanded lint
fixture work; those are not released `2.6.0` adopter requirements.

## Declared adoption versions

| Version/status | Canonical repositories |
|---|---|
| `2.6.0` | `gmail-markdown`, `sharingan`, `code`, `model-router`, `agent-review`, `model-gateway`, `fleet-registry`, `repo-factory`, `nextsolved`, `fetchbranch-app-foundation`, `fetchbranch-commerce`, `fetchbranch-identity`, `fetchbranch-model-gateway` |
| `2.3.0` | `agent-orchestrator`, `dotfiles` |
| `2.2.0` | `task-dag` |
| Producer, not adopter | `repo-template` |
| No adoption anchor | `github`, archived `windmill-pilot` |

The 13 repositories declaring `2.6.0` still identify five different template commits:

| Declared commit | Repositories |
|---|---|
| `eccb1af35300cba4759d7fa262f9c01a186d30f3` | `gmail-markdown`, `model-router` |
| `a247068ad95567e31e88a2b61d061a11f51e4415` | `sharingan`, `code` |
| `157c98bb24ed99e690d9daffdecdd752f132fc64` | `agent-review` |
| `75007a567ec5954c35cb497d0c4436f3c8178005` | `model-gateway`, `nextsolved`, and the four `fetchbranch-*` shared repositories |
| `73853db0f594cc354ec13a6d71e8c5764f2b5dfc` | `fleet-registry`, `repo-factory` |

## Drift that remains

- `task-dag` is four minor releases behind the declared `2.6.0` release.
- `agent-orchestrator` and `dotfiles` are three minor releases behind.
- Same-version commit drift exists among every `2.6.0` adopter; none identifies the pre-task
  template `HEAD`, `d65a66474a867e3bdc5cb3d41b94d24913613d15`.
- The current manifest includes unreleased portable changes, especially expanded user-surface-lint
  fixture closure. A current-manifest gap is therefore a review candidate, not proof that an
  adopter missed released `2.6.0`.
- Seven adopters use bare-string `skipPaths` entries rather than per-path reason objects, and three
  record no skips despite locally missing portable paths. Their intentional versus accidental drift
  is not fully evidenced.
- Byte equality is not a compliance rule: four manifest files must be merged, setup seeds are
  expected to become repository-specific, and the migration policy preserves mature local
  operational truth. Without per-file adoption baselines, semantic content drift cannot be
  reconstructed reliably.

## Existing-file refresh that was blocked

If existing-file edits had been allowed, `docs/adoption-status.md` would have been updated to:

1. advance its status date from `2026-07-27` to `2026-07-28`;
2. replace the recorded checkout commit
   `63246489d458fa71ccfee1357b369daecaa1ba4b` with the pre-task local `HEAD`
   `d65a66474a867e3bdc5cb3d41b94d24913613d15`; and
3. retain the manifest counts, adoption ledger, and substantive drift findings above.

Normal template discipline would also decide whether adoption-status documentation belongs in
`template-manifest.json` and record the structural documentation change in `CHANGELOG.md`
Unreleased. Both are existing files, so neither was changed.

## What could not be determined

- Remote branches, release tags, and publication authority were not queried.
- Missing setup-lifecycle files cannot be classified as accidental or completed without a durable
  skip or receipt.
- Adopter content that changed after adoption cannot be separated from intended setup
  customization where no per-file baseline exists.
- No migration priority or ownership decision was inferred.

The Codebase Memory project had no nodes for this template path, so checked-out files were the
source of truth. The initial PowerShell process launch was denied by the Windows sandbox; local
filesystem and read-only Git evidence were obtained through the available Node runtime instead.

Two initial new drafts,
`docs/adoption-status-additive-stop-2026-07-28-d65a6647.md` and
`docs/adoption-status-stop-note-2026-07-28-d65a6647.md`, are hidden by checkout-local
`.git/info/exclude` patterns. The create-only rule forbids deleting them, so they remain on disk;
this non-excluded file is the visible deliverable.
