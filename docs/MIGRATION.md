# Migration playbook

Use this when overlaying repo-template onto an existing repository. Migration is an overlay, not a
directory copy: existing operational truth wins, template structure fills gaps, and every intentional
divergence is anchored so later drift sweeps do not re-file known skips.

The raw overlay map and the create-only release payload are deliberately different contracts.
`template-manifest.json` remains the complete post-custody overlay map. Generic new-repository
materialization uses `release/inert-seed-manifest.json` plus
`release/release-payload-set.json`; it excludes local issue templates and workflows until the
Factory-owned transaction has acquired repository custody, and excludes raw Template-self documents
until they receive a portable projection. Consumers must not derive that payload by filtering the
raw map themselves.

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

Copied template ADRs retain their original identity and exact decision title. Never renumber
inherited prose into an existing local ADR number: doing so can make a reference to Template's
file-format or storage authority silently resolve to an unrelated local decision.

When the destination already owns the same ADR number or uses another decision format, do not copy
over or reinterpret either decision. Link to the exact titled Template decision by canonical URL,
record the skipped path in `.template-sync.json` `skipPaths`, and cite the repo-local decision or
changelog line that explains the conflict. If local policy differs, add a new repo-local decision
at its next free identity that explicitly supersedes the inherited decision by exact title; never
reuse the inherited number or title for different authority. Do not convert ADR formats during
migration.

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
verify gate passed, and its predeclared exposure set completed cleanly. The exposure set must cover
every behavior class changed by the migration and include at least three independent post-merge
executions, including one fresh-process or restart-equivalent execution, with no verify failures and
no migration-attributed `.ops/incidents.jsonl` lines by the attribution rule above. Natural traffic
is not required: when it is sparse, run deterministic replay or synthetic fixtures immediately.
The canary becomes green as soon as the evidence set is complete. Elapsed calendar time never proves
readiness and never keeps a complete canary on the critical path; wall-clock is only an absolute
terminal-failure TTL. One clean drain execution is never enough to satisfy the gate.

### If the canary goes red

Red uses the same exposure set and attribution rule as green: any canary verify failure or
migration-attributed `.ops/incidents.jsonl` line while completing that set makes the canary red.
Block the fleet rollout immediately, open a P1 issue against repo-template with the canary PR and
incident or verify evidence, then choose one recovery path before retrying: revert the canary
migration PR, or hotfix the template/canary and rerun the complete exposure set from the beginning.

## PlanRecordV1 no-grandfather migration

Template `3.0.0` replaces open-ended plan status prose with the portable contract in
`contracts/plan-record/v1/`. This is a no-grandfather migration: inventory every top-level live
`plans/*.md` record and give it exactly one `migrate` or `retire` decision. Halt before apply when
any row is unclassified. Do not add another stored status to accommodate legacy prose.

Run the pure classifier offline first and persist a
`work-migration-manifest/v1` dry-run receipt. A second run over identical source bytes must produce
the identical canonical manifest and digest. The manifest records the exact source commit/tree,
schema release digest, per-path stable reason and explicit target status, exact live
before/migrate/retire/after counts, a repository-bound archive member receipt, changed paths,
verification, canary state, rollback ref, and `unclassifiedCount: 0`. Its decisions must close
exactly over the declared live-before inventory; a nonzero source count with an empty decision list
is invalid. Every live decision path is a top-level `plans/*.md` path, never an archive path.
`changedPaths` is the sorted exact set of those decision paths: omitted and unrelated paths are
invalid. The archive receipt is inline, so it does not add a generated apply path. Record exact
before/after counts; apply only that closed path set. Rollback is an ordinary revert to the recorded
ref.

Map evidence as follows:

- ready work becomes `planned` only when identity, risk, issue, and enqueue evidence are complete;
  draft additionally needs its exit trigger, and stalled/parked work needs both structured
  `retryReason` and finite `trigger`; incomplete evidence retires as `INCOMPLETE_EVIDENCE`;
- active or implementing work becomes `in-progress` with reason `LEGACY_ACTIVE` and a claim
  snapshot;
- landed or implemented work becomes `implemented` with reason `LEGACY_IMPLEMENTED`, a landed
  commit receipt, and claim/land snapshots;
- shipped or resolved work becomes `closed` with reason `LEGACY_CLOSED`, a deployed receipt,
  deployment time, claim/land snapshots, and `completed` disposition;
- legacy closed work with `duplicate | not-planned | invalid` disposition remains `closed` without
  invented land/deploy evidence; `supersededBy` is valid only for `duplicate`;
- held work becomes `held-authority` only with a separate, finite `trigger`;
- unknown or ambiguous values (including bare `done`) retire fail-closed; never guess whether prose
  means merely landed or actually shipped.

For an already admitted record, preserve both `enqueuedAt` and `enqueueTimeSource`. For historical
records without a timestamp, derive it from the file-add commit and mark
`enqueueTimeSource: file-add-backfill`; neither field may later be rewritten (including changing a
backfill source to `recorded`). Do not use mtime, current time, or a later edit. Link an existing real
GitHub issue only when it already owns the work. Otherwise use a typed `plan-host` reference for live
migration. That composition reference does not manufacture an issue, a fix, or issue-closure credit.

Archives are sealed and read-only even when an archived plan's prose disagrees with current terminal
semantics. Do not rewrite archive plan bodies and do not bulk-create archive housekeeping issues.
Emit one content-addressed aggregate receipt per repository containing the repository identity,
archive count, sorted exact member rows (`path`, Git blob SHA-256), aggregate algorithm/hash, and
migration dispositions; classifier output for those files is `archive-receipt-only` with stable
reason `ARCHIVE_SEALED`. `sha256-framed-path-blob-sha256hex-v1` sorts member rows by ordinal path,
then for each row concatenates the UTF-8 path and its 64-character lowercase blob-hash string, each
preceded by an unsigned 64-bit big-endian byte length. SHA-256 of those concatenated frames is the
aggregate. Count, membership, ordering, and aggregate must independently recompute; archive bodies
remain untouched.

Adopt major `3.0.0` through the `gmail-markdown` canary first. Its verify surface remains the
smallest applicable managed leaf surface at this release. Do not begin fleet rollout until its
migration merges, verifies, and satisfies the major-version observation gate above. AO runtime
adaptation and corpus mutation belong to `agent-orchestrator#2814`, not to this template release.

## Enrollment proof

Finish migration by running the smoke plan at `plans/drafts/000-smoke.md`. The smoke plan proves the
repo can enter the queue, run the expected lightweight checks, and archive cleanly.

## LocalCiContractV2 migration and rollback

`LocalCiContractV2` standardizes machine-readable local CI contracts across the fleet:

1. **Migration path:**
   - Repositories migrating from legacy V1 shapes (`model-gateway-v1` or `repo-factory-v1`) use `classifyAndMigrateLegacyLocalCiV1(rawInput, sourceBlob)`.
   - Migration is pure and deterministic: legacy V1 shapes are identified and rejected with `INCOMPLETE_LEGACY_EVIDENCE` until a consumer supplies an independently authenticated complete V2 declaration; no command, environment, or effect field is inferred or Boolean-coerced.
   - The source blob SHA-256 digest is retained in the disposition receipt for auditability.
   - If a legacy contract is incomplete, malformed, or contradictory, the migrator returns `disposition: "rejected"` with a typed reason code, causing the consumer to fail closed as **non-routable**.

2. **Rollback path:**
   - Because `LocalCiContractV2` is a producer-side schema release and does not mutate consumer repositories directly, rollback of candidate adoption in a consumer repository requires reverting the consumer's adoption commit to its pre-migration state.
   - Candidate contract versions remain immutable; new candidate identities are issued for repairs rather than mutating existing release receipts or tags.
