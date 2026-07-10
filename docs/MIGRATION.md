# Migration playbook

Use this when overlaying repo-template onto an existing repository. Migration is an overlay, not a
directory copy: existing operational truth wins, template structure fills gaps, and every intentional
divergence is anchored so later drift sweeps do not re-file known skips.

## Overlay algorithm

1. Read `template-manifest.json` from the template commit being adopted.
2. Iterate the manifest per file. Never copy whole directories.
3. Before copying, check whether the destination path already exists case-insensitively. On
   Windows/NTFS, copying `docs/ARCHITECTURE.md` over an existing `docs/architecture.md` can silently
   overwrite content in place. Treat that as the same file and merge or skip by policy.
4. For `copy` entries, copy the file only when it is truly missing after the case-insensitive check.
5. For `merge` entries, merge by hand: `AGENTS.md`, `.gitignore`, `CHANGELOG.md`, and `README.md`
   are never blindly replaced. `.gitignore` must still gain the template secret patterns and plan
   sidecar ignores even when the repo already has a mature ignore file.
6. Do not copy `self` or `generated` entries into the target repo except through the specific
   migration mechanism that owns them.

For non-Node repos, translate Node-flavored seeds instead of copying them literally. Python repos
typically need `__pycache__/`, `.pytest_cache/`, `.venv/`, and `venv/` ignores, and CI cadence notes
should describe pip or the repo's package manager rather than npm.

## Post-copy swallow audit

After copying every new path, prove Git can see it:

```bash
git status --porcelain <copied-path>
```

Any copied file that does not appear as untracked or added was swallowed by an ignore rule. Repos with
whitelist-style `.gitignore` files must add explicit allow rules in the same migration commit that
adds the copied files.

## ADR numbering

The survey ADR, `0001-design-philosophies`, is repo-local. When copying it into a repo that already
has ADRs, renumber it to the repo's next free ADR number and keep the title recognizable.

Workspace-standard ADRs are different. The verify-gate contract, file-format doctrine, storage
ladder, and git-conventions ADRs should be referenced by template URL instead of copied when the
target repo already has its own ADR numbering. Repos that use another ADR format, such as a single
decision log or README section, keep that format. Link to the template decision, record the skipped
path in `.template-sync.json` `skipPaths`, and cite the repo-local decision or changelog line that
explains the choice. Do not convert ADR formats during migration.

## Never-touch rule

Existing real operational docs win over template stubs. If a repo already has useful runbooks,
architecture notes, observability docs, incident records, or security procedures, keep them and turn
the corresponding template stub into a pointer only when a pointer is needed. For example, a repo
with an existing `runbooks/` directory should not receive a competing `docs/RUNBOOK.md` body; it can
receive a short index that points to the real runbooks.

List every merge and never-touch decision in the migration PR body so reviewers can distinguish
intentional preservation from accidental omission.

## Anchor and skipPaths

Every migration PR must update `.template-sync.json`:

- `syncedVersion`: the template version adopted.
- `syncedCommit`: the exact template commit adopted.
- `syncedAt`: the migration timestamp.
- `skipPaths`: every intentional divergence from the manifest.

Each `skipPaths` entry needs a citation to a repo ADR or a `CHANGELOG.md` `Unchanged (intentional)`
line. Without that anchor, the drift sweep should assume the path was missed and file it again.

## Survey sourcing

Answer the design-philosophy ADR questions from the repo's existing docs, history, and behavior
first. Most answers are derivable from current `AGENTS.md`, README, runbooks, CI, deploy notes, and
recent incidents. Leave `TODO(setup!):` markers only where a human policy answer is genuinely needed.

## Tier rule

Migrations for risk-tiered repositories, including the orchestrator and workspace root, run as
human-tier work with `--no-queue`. Leaf repos may use the auto lane when their local autonomy policy
allows it.

## Rollout order

MINOR and PATCH template upgrades can roll out across subscribed repositories without a canary.
MAJOR upgrades roll out canary-first: migrate one leaf repo before opening migration plans for the
rest of the fleet. The default canary is `gmail-markdown` because it has the smallest verify surface,
but each MAJOR bump must re-validate that default in its `CHANGELOG.md` entry before use. The entry
must either state that `gmail-markdown` still has the smallest verify surface among candidate leaf
repos or name a different canary with the same criterion, plus any extra reason the changed surface
needs a more representative repo.

The migration PR's changed-file set is the attribution surface for the canary. An
`.ops/incidents.jsonl` line counts against the canary when either its area/path/file/repo metadata
matches a file touched by the migration PR, or its summary/rootCause/fix text references a feature,
rule, helper, or artifact introduced or changed by the template bump. Incidents outside that surface
do not block the rollout, but record the skip rationale in the rollout notes.

The fleet rollout waits until the canary is green. Green means the canary migration PR merged, its
verify gate passed, and the observation window completed cleanly: at least three consecutive drain
cycles, spanning at least 24 hours after the merge, with no verify failures and no
migration-attributed `.ops/incidents.jsonl` lines by the attribution rule above. A single clean
five-minute drain cycle, including the first run after a restart, is never enough to satisfy this
gate.

### If the canary goes red

Red uses the same observation window and attribution rule as green: any canary verify failure or
migration-attributed `.ops/incidents.jsonl` line before the window closes makes the canary red.
Block the fleet rollout immediately, open a P1 issue against repo-template with the canary PR and
incident or verify evidence, then choose one recovery path before retrying: revert the canary
migration PR, or hotfix the template/canary and rerun the canary window from the beginning.

## Enrollment proof

Finish migration by running the smoke plan at `plans/drafts/000-smoke.md`. The smoke plan proves the
repo can enter the queue, run the expected lightweight checks, and archive cleanly.
