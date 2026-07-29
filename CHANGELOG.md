# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Maintained at merge time (post-merge
obligations in [ADR-0001: Design philosophies for this repo](docs/adr/0001-design-philosophies.md)
§8) — one entry per user-visible or structural change.

## [Unreleased]

### Fixed

- Replaced the critical-path 24-hour major-upgrade canary wait with an evidence-denominated exit:
  predeclared changed-behavior exposure classes, at least three independent post-merge executions
  including a fresh-process or restart-equivalent run, deterministic replay or synthesis when
  natural traffic is sparse, and an absolute TTL that can fail but never prove readiness. PATCH.
  Fixes #97.

## [3.0.1] - 2026-07-29

### Fixed

- Restored the clone-deliverable `.ops/README.md` schema note, preserved the binding tracked-incident
  policy with file-precise transient ignores, and added release-tree and `.ops` policy gates that
  reject portable `copy`/`merge` paths absent from tracked candidate bytes or future ignore/helper
  drift. The immutable `v3.0.0` tag remains unchanged; new consumers must use corrected `v3.0.1`
  and retain the existing canary-first rollout gate. PATCH. Fixes #97.

## [3.0.0] - 2026-07-28

### Fixed
- Closed the final PlanRecordV1 review gaps: supersession is duplicate-only in schema/runtime,
  enqueue timestamp provenance is immutable, live migration decisions cannot target archives,
  apply paths close exactly over live decisions, and repository-bound archive receipts enumerate
  every member and independently recompute the documented length-framed aggregate. Generated
  parity probes now cover blank strings, unsafe integers, strict RFC3339 timestamps, and portable
  Windows paths beyond the committed fixture corpus. Future-schema classifier retire decisions
  remain valid through source runtime, JSON Schema, and generated manifest validation. MAJOR.
- Closed PlanRecordV1 pre-release review gaps: legacy migration now requires complete evidence and
  records an explicit target status; manifests close over exact live/archive counts and hashes;
  claim/land/deploy evidence is lifecycle- and disposition-conditional; plan-host zero and unordered
  unique effect arrays align across schema/runtime; both published schemas now execute through
  draft-2020-12 meta-schema and example verification. MAJOR.
- Closed the issue #92 capability-closure gap left open by the fail-closed user-surface-lint
  expansion: every advertised `--self-test` fixture tree (`error-codes`, `source-leak`,
  `regex-safe`, `regex-leak`, `declared-none`) is now present, classified `copy`, and bound into
  the materializer capability bundle so a materialized/downstream checkout can run both advertised
  modes without missing-file exits. Restored exportable `runLint`/`selfTest` for exact-closure
  smoke tests. MINOR.

- Strengthened the issue #93 portable-docs regression to prove fail-before
  (`E_DOC_BARE_ADR`, `E_DOC_CHECKOUT_LINK`, `E_DOC_ADR_TITLE`) and pass-after
  (titled ADR link + canonical HTTPS fleet catalog with an unrelated local ADR 0003).
  PATCH.

### Added
<!-- new capabilities or files -->
- **BREAKING:** Published strict portable `PlanRecordV1` and `WorkMigrationManifestV1` schemas,
  examples, fixtures, pure validators/classifier, immutable transition checks, canonical
  `PLAN_TEMPLATE.md` adapter, and the no-grandfather migration contract. Sealed archives produce
  one aggregate receipt and no issue storm. `gmail-markdown` remains the smallest applicable leaf
  canary; fleet rollout waits for its major-version observation gate. Runtime consumption and corpus
  mutation remain owned by `agent-orchestrator#2814`. MAJOR.
- **BREAKING:** Added the pure TypeScript `adoption-shell-v2` contract, nine closed schemas,
  dependency-free compiled ESM/declarations, authenticated capability registry, deterministic
  fixtures/goldens, negative-effect proofs, and a reproducible artifact manifest. This implements
  [ADR-0006: Pure TypeScript adoption shell and release boundary](docs/adr/0006-adoption-shell-v2-technology-decision.md)
  without publishing or activating a release. MAJOR.
- Added the portable direct-L0 fast path: simple reversible repo-contained source uses
  proportionate affected checks plus one exact-byte/no-effect/rollback receipt, while external
  effects and shared authority remain governed. MINOR.
- Extended the portable direct-L0 default with bounded one-deliverable heartbeat wakes, terminal
  paused/no-progress behavior, AO-owned typed coordinator/overseer containment, and the Luna-low
  manager-judgment boundary. MINOR.
- Added portable append-only delivery event and repository declaration schemas plus pure validators
  for the six delivery/token/SLO/human-message SLIs. Anti-gaming exclusions reject activity proxies,
  coverage errors remain visible and non-blocking, and concrete targets/aggregation remain
  Registry/Observatory references. MINOR.
- Added a closed `repo-template/release-receipt/v1` schema and pure validator binding SemVer,
  producer commit/tree, annotated-tag transport, payload-set identity, sorted capability bundles,
  and exact materializer closure. Candidate receipts are valid but non-authoritative; only
  `publicationState=published` is authoritative. MINOR.
- Added a pure release-closure validator that cross-authenticates a receipt against the supplied
  payload set, complete capability registry, and compiled artifact manifest before publication.
  MINOR.
- Added a pure deterministic candidate builder that derives the closed non-authoritative release
  receipt and validates its complete closure from caller-supplied SemVer, commit/tree, payload,
  capability registry, and artifact manifest values. MINOR.
- Added a pure release payload-set builder that hashes canonical base64 content, sorts portable
  paths, derives both aggregate digests, and returns the existing closed validator result. MINOR.
- Accepted [ADR-0006: Pure TypeScript adoption shell and release boundary](docs/adr/0006-adoption-shell-v2-technology-decision.md),
  the complete AI-First Stack v1.1.0 technology decision for a
  runtime-dependency-free TypeScript `adoption-shell-v2`, closed schemas and capability bundles,
  exact compiled artifacts, pure offline materialization, and the later generic Template release
  seam. The ADR binds immutable Factory compatibility input while preserving zero target,
  Registry, GitHub, schedule, activation, provider, deployment, and serving authority. MINOR.

### Changed
<!-- behavior changes; breaking ones marked **BREAKING** -->
- Fixed `verify:self` to actually invoke `lint-user-surface-leaks.mjs --config
  .user-surface-lint.json`, not just its `--self-test` fixtures. AGENTS.md's Validation policy and
  README.md's "User-surface leak lint" section both declare that this exact command runs "in the
  verify gate," but the real (non-fixture) invocation previously only existed in the advisory,
  non-blocking `.github/workflows/ci.yml`; `pnpm verify` never ran it. Proven with a real injected
  violation (fixture `tests/fixtures/user-surface-lint/bad/`) that the gate now catches; reverted
  before commit. PATCH.
- Added a `template-manifest.json` coherence guard to `tools/verify-template-self.ts`: if either
  `.user-surface-lint.json` or `.user-surface-lint.schema.json` is declared `"copy"`, then
  `scripts/lint-user-surface-leaks.mjs` must be declared `"copy"` too, and vice versa — declared
  config with no declared checker (or a declared checker with no declared config) now fails
  `pnpm verify`. Motivated by `repo-factory` carrying the synced config/schema with no way to run
  it, discovered while investigating the `verify:self` fix above. This repo's own manifest was
  already coherent (verified against two other consuming repos, `agent-review` and
  `gmail-markdown`, which both have config+checker together) — the gap was specific to that one
  repo's migration execution, not this repo's sync declaration — but the invariant itself was
  previously unenforced here, so future drift of this shape would not have been caught. Proven with
  a real injected violation (manifest checker entry demoted to `"self"`) that the guard now catches
  under both the prior and current tool; reverted before commit. PATCH.
- Added negative-path regression coverage for `validateMaterializerOutputManifestV2`, asserting a
  targeted diagnostic for entryCount bounds/consistency, migrationRefs, selectedBundles id/version
  format, per-entry role/mode/encoding, and the manifest-digest recompute. PATCH.
- Added negative-path regression coverage for `validateVerificationReceiptV2`, asserting a
  targeted diagnostic for every mutated field (identity constants, receipt-kind/digest-algorithm/
  independentRunCount/result constants, and the receipt-digest recompute). PATCH.
- Added negative-path regression coverage for `validateArtifactManifestV2`, asserting a targeted
  diagnostic for every mutated field (identity constants, toolchain, file rows, the 9-schema
  closure, and the manifest-digest recompute). PATCH.
- Fixed `validateMaterializerOutputManifestV2` to enforce the same `bundleId` length/pattern
  contract on capability-owned output entries that the committed JSON Schema and the release
  payload-set validator already require; previously any string (including malformed values) was
  accepted. PATCH.
- Made documentation-link validation accept every absolute URI scheme. PATCH.
- Added deterministic artifact-policy regression coverage for forbidden ambient imports and
  sorted findings. PATCH.
- Added canonical-base64 regression coverage for alternate and non-padded encodings. PATCH.
- Added delivery-event regression coverage for both inconsistent coverage-state directions. PATCH.
- Added a release-candidate regression assertion that candidate construction preserves caller input
  bytes. PATCH.
- Added committed-artifact regression coverage for portable paths and relative documentation-link
  resolution across Windows and traversal boundaries. PATCH.
- Expanded Template conflict scanning to every tracked UTF-8-safe text file, independent of file
  extension, with deterministic binary classification checks. PATCH.
- Extended Template self-verification to reject every standard line-start Git conflict marker and
  added deterministic marker-class self-tests. PATCH.
- Replaced the copied priorities seed's concrete template identity with the portable `{{NAME}}`
  placeholder and enforced it in self-verification. PATCH.
- Fixed the portable `PRIORITIES.md` seed's missing manifest classification and made its
  copy-only conformance deterministic. PATCH.
- Fixed issue #92 as a capability-closure class: `user-surface-lint` now carries both configuration
  files and all seven `--self-test` fixtures as `copy`, and its two advertised modes are exercised
  from only the materialized payload. MINOR.
- Fixed issue #93 as a portable-reference class: copied incident/storage documentation links exact
  ADR titles, the fleet incident catalog uses canonical HTTPS, and migration guidance preserves
  inherited ADR identity while local decisions supersede instead of reusing a number. PATCH.
- Replaced the Template-self inline verifier with the stable frozen-install plus `pnpm verify`
  root gate, covering typecheck, exact artifact rebuild, committed-artifact consumer tests,
  purity/closure verification, and the predecessor self checks. MINOR.
- Rejected `.github/workflows/` from the inert v2 seed/release and required an explicit
  `noPreCustodyWorkflows` conformance assertion, preventing Template workflows from executing
  before a newly created repo manager acquires custody. MAJOR.
- Archived stale Plans 020, 030, and 031 plus their invalidated critic receipts with a
  machine-readable 2026-07-24 disposition ledger. Their useful intent is conserved in the
  owner-pure `adoption-shell-v2` → public `.github` canary → generic Template release train;
  cross-owner lifecycle and issue-template content work is no longer presented as Template work.
  PATCH.
- Completed the v2.6.0 transient-state contract by removing the ignored
  `.ops/concurrency-capture.jsonl` runtime journal from Git tracking. Plan 029's result recorded the
  removal, but its landed commit omitted the index deletion and left the self-verify gate red;
  `agent-orchestrator#1919` owns the durable cross-repo classification/enqueue fix. PATCH.

### Unchanged (intentional — frozen)
<!-- Things a reader might EXPECT to have changed but which are deliberately frozen (legacy
     namespaces, DB identities, vendored code). Recording these prevents future agents from
     "fixing" them. -->

## [2.6.0] - 2026-07-21

### Added
<!-- new capabilities or files -->
- AGENTS.md now declares binding steer for interactive and autonomous agents:
  discovery, triage, review, implementation, and supervision must obey ratified responsibilities,
  non-goals, and product principles. Technically correct principle violations are defects,
  non-goal expansion is rejected with a charter citation, and findings, issues, reviews,
  implementation reports, and PR descriptions cite exact `P<X>.<Y>` principle identifiers. MINOR.
- Product principles now have a machine-addressable schema with unique numeric `P<X>.<Y>`
  precedence, required durable `SLI:` definitions, tunable `SLO:` targets, and report-only
  baselining support. SLO breaches are exact-principle-tagged defects. Motivated by the
  principle-blind discovery/review incident behind the 2026-07-13 CEO steering directive. MINOR.

### Changed
<!-- behavior changes; breaking ones marked **BREAKING** -->

### Unchanged (intentional — frozen)
<!-- Things a reader might EXPECT to have changed but which are deliberately frozen (legacy
     namespaces, DB identities, vendored code). Recording these prevents future agents from
     "fixing" them. -->

## [2.5.0] - 2026-07-20

### Added
<!-- new capabilities or files -->
- `scripts/lint-user-surface-leaks.mjs` plus `.user-surface-lint.json`, a deterministic
  user-facing string lint for env-var names, infra/operator wording, host paths, and detectable
  internal-error passthroughs. The gate cites the CEO-ratified no-developer-leakage doctrine from
  agent-orchestrator `docs/DOCTRINE.md` §12 and no-ops loudly when a repo commits empty include
  globs. MINOR.

### Changed
<!-- behavior changes; breaking ones marked **BREAKING** -->
- Ignored precise orchestrator runtime state so dirty-tree preflight no longer wedges scheduled
  drains, while keeping durable `.ops/incidents.jsonl` evidence tracked. PATCH.

### Unchanged (intentional — frozen)
<!-- Things a reader might EXPECT to have changed but which are deliberately frozen (legacy
     namespaces, DB identities, vendored code). Recording these prevents future agents from
     "fixing" them. -->

## [2.4.0] - 2026-07-12

### Added
<!-- new capabilities or files -->
- `model-boundary.json` as a copied, fail-closed declaration for model-backed capabilities,
  canonical gateway/adapter ownership, provider-specific exception paths, owning role, and serving
  provenance. AGENTS, README, architecture, runbook, setup, and template self-checks now document
  the CEO invariant: roles choose capabilities, never sacred providers. MINOR.
- AGENTS.md gains two required steering sections: `## Responsibilities & non-goals` and
  `## Product principles` (both `TODO(setup!)`-gated), plus a progressive-disclosure preamble
  (what the file is, where deeper docs live, move oversized sections to `docs/` with a summary +
  link). Motivated by the 2026-07-09 steering-docs audit: adopted repos (task-dag, gmail-markdown)
  carried product principles only in tool memory, violating doctrine-lives-in-repo. MINOR.

### Changed
<!-- behavior changes; breaking ones marked **BREAKING** -->
- Tightened the template verify gate to scan JSONL incident logs for conflict markers while allowing
  rotated `.ops/archive/` incident logs to remain outside the manifest.
- Hardened the template self verify gate to fail on conflict-marker matches and grep execution
  errors without relying on `set -e`, while ignoring generated `plans/` queue artifacts in manifest
  enforcement.
- Documented the tracked `.ops/incidents.jsonl` drain policy: sole dirty auto-appends are committed
  as `ops: incidents (auto)` before drain proceeds, motivated by incident fingerprint
  `43efffab9ecedf82`.
- Re-ignored `.ops/critic/*.md` (failed pre-enqueue plan-critic verdicts, per
  `agent-orchestrator/lib/artifacts.mjs`) after the broad `.ops/**` re-include, so failed critic runs
  stay useful local diagnostics without dirtying or wedging scheduled drains; tracked incident logs
  and `plans/*.critic.md` remain unaffected. Motivated by an observed queue-abort-dirty instance of
  this class in this repo and in newly adopted `model-router`.
- Ported the template self verify gate's conflict-marker scan into the existing Node manifest check,
  preserving marker coverage while removing bash/grep exit-code dependence. PATCH.

### Unchanged (intentional — frozen)
<!-- Things a reader might EXPECT to have changed but which are deliberately frozen (legacy
     namespaces, DB identities, vendored code). Recording these prevents future agents from
     "fixing" them. -->

## [2.3.0] - 2026-07-02

### Changed
- Documented canary-first rollout order for MAJOR template upgrades, including canary
  re-validation, a concrete green observation window, migration-incident attribution, and the red
  failure path.

## [2.2.0] - 2026-07-02

### Added
- `docs/QUEUE-ENROLLMENT.md`; enrollment near-mandated.

## [2.1.0] - 2026-07-02

### Added
- `docs/MIGRATION.md` as the overlay playbook for migrating existing repos onto the template.
- README entry and workspace-context pointer for the migration playbook.

## [2.0.0] - 2026-07-02

### Added
- `template-manifest.json` as the structural sync manifest consumed by the template gate and
  future migration tooling.

### Changed
- **BREAKING:** Setup markers now have normal and must-answer tiers, and the audit convention
  requires canonical colon syntax.
- **BREAKING:** TODO.md is now only for out-of-tree adoption actions; in-tree setup markers are
  audited directly instead of mirrored.
- **BREAKING:** Template placeholders are standardized on `{{UPPER_SNAKE_0_9}}`.
- **BREAKING:** AGENTS.md now carries instantiated verify-gate placeholders instead of web-app-only
  validation claims.

## [1.1.0] - 2026-07-02

### Added
- Authoritative-verification-tool declaration + done-report convention in AGENTS.md (from task-dag)
- [ADR-0005: Git conventions (workspace standard)](docs/adr/0005-git-conventions.md): read-only
  agents use mirrors, never the live checkout (from agent-review)

## [1.0.0] - 2026-07-02

### Added
- Initial living standard: ADRs 0000-0005 (design-philosophy survey, verify-gate contract, file-format doctrine, storage ladder, git conventions), docs/{ARCHITECTURE,RUNBOOK,OBSERVABILITY,INCIDENTS-stub}, .ops incident standard, plans/ queue scaffold, SECURITY.md leak playbook, CHANGELOG w/ Unchanged-(intentional) convention, GEMINI.md every-tool pointer, triage-ready issue template, advisory-CI skeleton, setup-marker audit convention, .template-sync.json subscription anchor, TEMPLATE_VERSION semver.
