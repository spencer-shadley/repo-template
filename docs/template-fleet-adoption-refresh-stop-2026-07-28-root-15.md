# Template fleet adoption refresh — additive-only stop

Status date: **2026-07-28**

`docs/adoption-status.md` already exists and is tracked, so the task's create-only safety rule
forbids refreshing that requested path. This new file records the update that would have been made.
No existing file was modified.

## Current template

- Checkout: `6d7c5fa2097b4b1adf8058a80d85383153d5c973`
- Declared release: `2.6.0`
- Canonical scope: 19 projects from `../agent-orchestrator/projects.json`
- Declared adopters: 16
- Manifest: 162 declarations — 43 `copy`, 4 `merge`, 114 `self`, 1 `generated`

The template supplies agent and product steering, architecture and operations documentation, ADR
seeds, queue/enrollment scaffolding, security and incident conventions, model-boundary policy,
issue/PR/CI seeds, and user-surface leak lint configuration, checker, and fixtures. Its unreleased
template-self surface also contains the TypeScript `adoption-shell-v2` schemas, deterministic
materializer/release contracts, compiled artifacts, fixtures, and tests; those `self` files are not
legacy-overlay payload.

## Declared adoption

| Version | Repositories |
|---|---|
| `2.6.0` | `gmail-markdown`, `sharingan`, `code`, `model-router`, `agent-review`, `model-gateway`, `fleet-registry`, `repo-factory`, `nextsolved`, `fetchbranch-app-foundation`, `fetchbranch-commerce`, `fetchbranch-identity`, `fetchbranch-model-gateway` |
| `2.3.0` | `agent-orchestrator`, `dotfiles` |
| `2.2.0` | `task-dag` |
| Not adopted | `.github`, archived `windmill-pilot` |

`repo-template` is the producer rather than an adopter.

The 13 repositories at 2.6.0 still use five exact commit anchors:

| Synced commit | Repositories |
|---|---|
| `eccb1af35300` | `gmail-markdown`, `model-router` |
| `157c98bb24ed` | `agent-review` |
| `75007a567ec5` | `model-gateway`, `nextsolved`, and the four `fetchbranch-*` shared repositories |
| `73853db0f594` | `fleet-registry`, `repo-factory` |
| `a247068ad955` | `code`, `sharingan` |

The remaining exact anchors are `deca3c725307` (`agent-orchestrator`), `83c9ef70b56f`
(`dotfiles`), and `a75be3fd59cb` (`task-dag`). None equals the current template checkout, so a
matching semantic version does not establish matching bytes.

## Drift

- `task-dag` is four minor releases behind 2.6.0.
- `agent-orchestrator` and `dotfiles` are three minor releases behind.
- The principal unanchored non-fixture gaps remain:
  - `repo-factory`: PR template, changelog, ADR seeds, and core architecture/operations docs;
  - both model-gateway repositories: advisory CI, ADR seeds, migration guide, and setup lifecycle
    file;
  - `task-dag`: migration/queue docs, model boundary, lint capability, and smoke plan;
  - `agent-orchestrator` and `dotfiles`: model boundary and lint capability; and
  - `fleet-registry`: lint capability, ADR seeds 0000–0001, and setup lifecycle file.
- Six adopters have a reason on every `skipPaths` entry; seven have at least one bare string skip;
  three declare no skips. Bare entries do not provide the per-path rationale required by the
  migration playbook.

The full current-manifest gap list in `docs/adoption-status.md` recomputed unchanged.

## Manifest-to-Git drift

The canonical report should correct one “what the template provides” claim. The manifest declares
47 portable paths, but only 46 are tracked and clone-deliverable:

- `.ops/README.md` is declared `copy`;
- the local file exists, but `git ls-files -- .ops/README.md` is empty; and
- `.gitignore` line 39 ignores `.ops/`.

Six other manifest declarations are also not tracked: `.ops/incidents.jsonl` and five `self` plan
paths whose plans now live in `plans/archive/`. They do not reduce the portable count, but they are
manifest-to-HEAD drift.

## Canonical update not performed

If existing-file edits are later authorized, `docs/adoption-status.md` should:

1. change its status date from 2026-07-27 to 2026-07-28;
2. change its template checkout from `63246489d458fa71ccfee1357b369daecaa1ba4b` to
   `6d7c5fa2097b4b1adf8058a80d85383153d5c973`;
3. retain the unchanged adoption ledger and adopter-gap findings;
4. distinguish manifest-declared paths from tracked, clone-deliverable paths; and
5. record the seven manifest-to-HEAD discrepancies above.

Template discipline would also normally update existing `CHANGELOG.md` and
`template-manifest.json`; those changes were prohibited.

## Unknowns

- Remote tags were not fetched, so local evidence does not prove whether releases 2.3.0 through
  2.6.0 have the tags required by the release contract.
- Fifteen adopters lack per-file hash baselines; their customized content cannot be classified
  globally as later drift versus adoption-time customization.
- The ignored ambient `.ops/README.md` may be intentionally local, but no tracked source currently
  delivers it to a clean clone.

No adopter, source, test, configuration, manifest, changelog, queue, issue, commit, tag, or remote
state was changed.
