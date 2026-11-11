# Migration playbook

Use this when overlaying repo-template onto an existing repository. Migration is an overlay, not a
directory copy: existing operational truth wins, template structure fills gaps, and every intentional
divergence is listed in the migration PR body. This playbook is template-owned and is not copied into
consumers; they link to it here.

The raw overlay map and the create-only release payload are deliberately different contracts.
`template-manifest.json` remains the complete post-custody overlay map and does not include
`.github/ISSUE_TEMPLATE/**`. Generic new-repository materialization uses
`release/inert-seed-manifest.json` plus `release/release-payload-set.json`; path policy still
refuses local issue-template overrides (`E_PATH_ISSUE_TEMPLATE` /
`no-local-issue-template-override`) and pre-custody workflows, and excludes raw Template-self
documents until they receive a portable projection. Consumers must not derive that payload by
filtering the raw map themselves, and must not add a local issue-template copy during overlay.
Issue intake is inherited from [`spencer-shadley/.github`](https://github.com/spencer-shadley/.github/tree/main/.github/ISSUE_TEMPLATE).

## Overlay algorithm

1. Read `template-manifest.json` from the current template default branch.
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
and cite the repo-local decision or changelog line that explains the conflict in the migration PR.
If local policy differs, add a new repo-local decision at its next free identity that explicitly supersedes the inherited decision by exact title; never
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

## Survey sourcing

Answer the design-philosophy ADR questions from the repo's existing docs, history, and behavior
first. Most answers are derivable from current `AGENTS.md`, README, runbooks, CI, deploy notes, and
recent incidents. Leave `TODO(setup!):` markers only where a human policy answer is genuinely needed.

## Tier rule

Migrations are fully autonomous in every repository (fleet AGENTS.md); there is no per-repo
approval tier. A genuine one-way door goes to Spencer through human-escalation-confirm.

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

## Template pins and copied template docs removed (repo-template#471)

Delete `.template-sync.json`; no repo records the template commit it adopted. This playbook and ADRs
0002–0005 are template-owned: delete byte-identical copies and link each reference to
`https://github.com/spencer-shadley/repo-template/blob/master/<path>`. A customized copy becomes a
repo-local decision at the next free ADR number. Rollback is reverting the consumer's migration
commit. The canary stays `gmail-markdown`: it carries the pin, and this change touches only the pin
and docs, so its verify surface is still the smallest.

The template no longer ships `SECURITY.md` (repo-template#556). Delete a byte-identical template
copy; the public `spencer-shadley/.github` account default applies instead and points at the root
code `SECURITY.md`. Keep a repo `SECURITY.md` only for repo-specific rules.

## PlanRecordV1 retired (repo-template#526)

The `plan-record/v1` contract, its classifier and the `work-migration-manifest/v1` receipt are
removed with the retired plan queue (registry `code-9710-plan-queue`). There is nothing to migrate:
work is issue-native. The GitHub issue is the spec; gh-issue-plan-execute plans just in time.
Delete any synced `contracts/plan-record/`, `PLAN_TEMPLATE.md` and plan-record module copies.

## Enrollment proof

Finish migration with an issue-native smoke: file a trivial docs issue and confirm it drains to a
merged PR with the expected lightweight checks passing. The GitHub issue is the spec;
gh-issue-plan-execute plans just in time.

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

## LocalCiContractV3 proof-of-detection migration (issue #131)

`LocalCiContractV3` (`repo-template/local-ci-v3`) is a new, additive contract identity published
alongside the frozen, unmodified `LocalCiContractV2`. Adopting v3 is opt-in per repository:

1. **Migration path:**
   - A repository's existing `local-ci.json` declared against `LocalCiContractV2` keeps validating
     against the v2 schema/validator exactly as before; nothing about v2 changed and nothing starts
     failing.
   - To adopt v3, run `classifyAndMigrateLocalCiV2ToV3(rawInput)` against the current v2
     declaration. A valid-but-unmigrated v2 declaration is rejected with
     `reasonCode: "MISSING_DETECTION_PROOF"` and an exact `commandsMissingDetectionProof` list --
     never auto-migrated, because a detection proof cannot be inferred without defeating the point
     of requiring one.
   - For each listed command, add either a `detectionProof.fixture` (a known-bad input the command
     must flag, with `expectation: "non-zero-exit"`) or a `detectionProof.exempt` reason (non-empty,
     recorded, and counted -- see the meta-gate's unproven-gate summary line). Re-validate with
     `validateLocalCiContractV3` until it accepts, then bump `schemaVersion`/`schemaId`/`contractId`
     to the v3 constants.
   - Wire `scripts/proof-of-detection/run-meta-gate.ts` (materialized via the
     `repo-template/proof-of-detection` capability bundle) against the repository's real v3
     `local-ci.json` and add it to the repository's own verify gate, so the proofs are re-checked
     on every run rather than proven once and trusted forever.
2. **Rollback path:** identical to `LocalCiContractV2` above -- v3 is a producer-side schema
   release; rollback of a consumer's adoption is reverting that consumer's adoption commit. The v2
   declaration a consumer migrated from remains valid and usable throughout.
3. **Rollout order:** canary-first per the MAJOR-bump policy above. This release does not migrate
   any consumer's `local-ci.json` on their behalf, including repo-template's own (it declares its
   gates through `package.json` scripts, not a checked-in `local-ci.json`).
4. **Owned elsewhere:** the runtime-artifact registry (`.runtime-artifact-registry.json`) currently
   documents `agent-orchestrator`-owned transient patterns because repo-template does not own the
   tools that write them (the loop, the drain auto-commit state, the queue projection). Consuming
   `agent-orchestrator` must: (a) adopt `.runtime-artifact-registry.json` +
   `.runtime-artifact-registry.schema.json` + `scripts/check-runtime-artifact-registry.ts` via the
   template manifest, (b) tag its own `.gitignore` lines with
   `# runtime-artifact: owner=<repo> incident=<ref>` for every pattern it writes, and (c) wire
    `check-runtime-artifact-registry` into its own verify gate so a new unregistered runtime file is
    caught before it starves a drain the way `.ops/work-items/QUEUE.generated.md` and
    `.ops/work-items/work-projection.v1.json` did (repo-template#129).

### Enrolled package-manager metadata (Workspace Lifecycle #47)

V3 now accepts `environment.packageManager: { "name": "pnpm" }` for a consumer of the
published [fleet package-manager selection](./PACKAGE-MANAGER.md). Version omission stays
absent after validation; normal enrollment and Corepack own resolution. Existing V3
profiles with a nonempty version remain accepted, and V2 is unchanged. The public TypeScript
shape makes `version` optional, so consumers reading it must handle absence rather than
construct an exact version from `undefined`.

Adopt the corresponding generated validator through the existing consumer dependency flow,
then update that repository's manifest/readiness path and LocalCi declaration together.
This producer change does not migrate the template's own pinned profile, another repository,
or an installed host. Frozen candidate receipts and published tags keep their original bytes.

## ProductSliProbeV1 contract and local priority binding (issue #110)

`ProductSliProbeV1` (`repo-template/product-sli-probe-v1`) standardizes portable, runtime-neutral
measurement declarations connecting active local `PRIORITIES.md` SLI/SLO rows to safe product-owned
probe entrypoints and typed observation receipts without duplicating scheduler, evaluation, or
incident machinery.

1. **Migration path:**
   - **Authority relocation:** Move any existing ratified local SLI/SLO definitions previously kept in
     `AGENTS.md` (e.g. under `## Product principles`) into sibling `PRIORITIES.md` under the required
     `## Local SLI / SLO` markdown table. Preserve exact principle bindings (`P<X>.<Y>`), stable local
     row IDs, observation descriptions, SLO targets, and decider/provenance. Remove the competing
     table from `AGENTS.md` to satisfy the local-authority guard (LS1–LS3).
   - **Declaration binding:** For every row with status `active` in `PRIORITIES.md`:
     - If mechanized: create a probe entry in `product-sli.json` with matching `sliId`,
       `bindsPrinciple`, observation `kind` (`gauge | count-ratio | boolean`), `sloReference`,
       repository-relative `entrypoint.path` and structural `argv`, `effects` (`read-only | fixture-only`),
       required capability names, and `cadence.freshnessSeconds`.
     - If not yet mechanized or purely informational: declare an explicit `disposition` with `kind`
       (`report-only | unsupported | non-mechanizable`), non-blank `owner`, `reviewDate` (`YYYY-MM-DD`),
       and rationale.
     - Unbound active rows fail closed; no silent un-monitored active row validates.
   - **Receipt evidence generation:** Run migration verification to compute a
     `ProductSliMigrationReceiptV1` (`product-sli-migration-receipt/v1`). The receipt records
     canonical before/after SHA-256 digests (`beforeSemanticDigest`, `afterSemanticDigest`), asserting
     that IDs, principle references, targets, and decider provenance were preserved without drift.
   - **Refusal of destructive effects:** Entrypoints must be repository-relative and path-safe.
     Arbitrary shell strings, command interpolation, and destructive/live-write/spend effects are
     structurally rejected. Baseline unattended product probes must remain strictly read-only or
     fixture-only.

2. **Rollback path:**
   - As a producer-side contract release, repo-template does not mutate consumer repositories directly.
   - Rollback of candidate adoption in a consumer repository requires reverting the consumer's adoption
     commit to its pre-migration state.

3. **Rollout order:**
   - Canary-first rollout: `gmail-markdown` (issue gmail-markdown#554) and `sharingan` (issue sharingan#140)
     are the candidate consumers for browser-extension (CDP fixture) and service media (dry-run)
     probe bindings respectively.
   - Schedulers (Windmill/workflows) consume `product-sli.json` declarations as runtime-neutral hints
     without embedding runner implementations in the template.
