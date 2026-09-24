# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Maintained at merge time (post-merge
obligations in [ADR-0001: Design philosophies for this repo](docs/adr/0001-design-philosophies.md)) —
one entry per user-visible or structural change.

## [Unreleased]

### Fixed
- **Tip-green: bracket-access `CODE_REPO_ROOT` in fleet-law sync (RT#434):** `scripts/check-fleet-law-sync.ts` read `process.env.CODE_REPO_ROOT` with dot access, which fails TS4111 under `noPropertyAccessFromIndexSignature`. Use `process.env["CODE_REPO_ROOT"]`. No behavior change. PATCH. Fixes #434.
- **Tip-green: ignore hermetic-test-preload in eslint until tsconfig enrollment:** `packages/repo-quality/hermetic-test-preload/**` fails `projectService` (same class as docs-only-gate / todo-issue-link). Ignore under the RT#411 tip-green pattern so `pnpm verify` / land gate match master intent without `--skip-gate`. PATCH. Obligation from repo-template#432 allow-pre-existing basediff.
- **`@spencer-shadley/repo-quality` 1.10.1:** hermetic preload re-applies `commit.gpgsign`/`tag.gpgsign=false` after scrubbing inherited `GIT_CONFIG_*` so consumer test scripts need not fight the preload. PATCH. code#6081.

### Added
- **`@spencer-shadley/repo-quality` 1.10.0 hermetic-test preload (code#6081):** publish `hermetic-test-preload` (+ `.mjs` launcher) so every consumer can `--import` a scrubbed git/HOME/XDG environment. PATCH. Tracks code#6081.

- **Tip-green: sync fleet-law projection after Code #6120 (code#4141 F1):** Refresh `scripts/generated/fleet-law-projection.v1.json` to Code digest `sha256:2892b823…` (adds `local-required` + fleet host-id labels). Harden `check-fleet-law-sync` Code-source discovery for cloud/session worktrees outside the monorepo overlay. PATCH. Advances spencer-shadley/code#4141 F1 no-drift.
- **Tip-green: sync fleet-law projection to current Code pin:** Refresh `scripts/generated/fleet-law-projection.v1.json` to Code digest `sha256:b134d860…` so `check-fleet-law-sync --check` / `provision-canonical-labels.selfcheck` stay green when the Code workspace overlay is present. PATCH.
- **Portable docs-only LocalCi simpleDiff gate (RT#422):** Publish `@spencer-shadley/repo-quality` `docs-only-gate` + `docs-only-simple-diff.json` so leaf repos stop maintaining five local script copies. PATCH. Fixes #422.
- **Tip-green after RT#422/#345 (RT#411 land-gate obligation):** Ignore `packages/repo-quality/docs-only-gate/**` and `todo-issue-link/**` in eslint until those trees are enrolled in `packages/repo-quality/tsconfig.json` and lint-clean; add `@stack-waiver` on `todo-issue-link.mjs` and drop unused imports (match `docs-only-gate.mjs`); retarget `build-repo-quality-npm`/`verify-repo-quality-npm` identity pin `1.8.0`→`1.9.1` and require the new launcher exports; enroll unmanifested RT#345/#418/#422 paths in `template-manifest.json`; regenerate inert-seed + artifact digests. Restores declared `pnpm lint`/`pnpm verify` green without `--skip-gate`. PATCH. Fixes #411.
- **Tip-green knip after RT#422/#345:** Import `docs-only-gate/cli.ts` from the `.mjs` launcher (same pattern as todo-issue-link); keep language extractors package-private behind `extractComments`. PATCH.
- **Charter + SSOT for portable fleet label vocabulary (RT#418):** TEMPLATE-SELF Responsibilities now claim composition/provision of the portable fleet label vocabulary (Code fleet-law pin + template-portable labels). Add `docs/FLEET-LABEL-VOCABULARY.md` as the discoverable SSOT for responsibility routing. Selfcheck asserts the charter bullet and SSOT doc. PATCH. Fixes #418.

- **Portable TODO→GitHub-issue link checker (RT#345):** Add `packages/repo-quality/todo-issue-link` with a language registry, comment extractors (not whole-file grep), directive classifier requiring a full `https://github.com/<owner>/<repo>/issues/<n>` URL, and machine-readable `TodoIssueLinkScanResultV1` findings for full-tree/changed-file modes. Unknown authored extensions report `unsupported` (never silent pass). Harden `hasIssueTrackingReference` to the same full-URL bar (closes historical shorthand fail-open). Wire `pnpm todo-issue-link` / `todo-issue-link:selfcheck` into verify. PATCH. Fixes #345.
- **Enroll dir-breadth selfcheck + retarget issue-template blob pin (RT tip-green):** Add `scripts/check-dir-breadth.selfcheck.ts` to `template-manifest.json` (unmanifested after #377) and update `tools/verify-template-self.ts` predecessor task.md blob pin after RT#342 portable Exploration/Experiment template bytes. PATCH.
- **Tip-red: linearize Discovery/experiment conflation regex (RT tip-green):** Replace `/Discovery\s*\/?\s*experiment/i` in `scripts/check-issue-template-intake.ts` with an alternation that cannot super-linear-backtrack (`sonarjs/super-linear-regex`), restoring green `pnpm lint` on master after RT#377 land exposed the gate. PATCH. Fixes #414.
- **Wire dir-breadth into verify and refuse closed waiver owners (RT#377):** `pnpm verify` / `verify:self` now run `lint:dir-breadth` plus a focused selfcheck. `scripts/check-dir-breadth.ts` fails closed when an allowlist cites a known-closed or dynamically verified closed issue (historical #376). Retarget the `packages/adoption-shell/src` measured freeze to live split owner #412. No global `maxFilesPerDir` raise. PATCH. Fixes #377.
- **Project distinct exploration vs experiment into portable issue template (RT#342):** Replace the combined `Discovery / experiment` work-type affordance in `.github/ISSUE_TEMPLATE/task.md` with Code's landed GovernedIntakeBodyV1 v16 portable release bytes (`contracts/generated/governed-intake/task.md` after code#4897 / AO#8579). `scripts/check-issue-template-intake.ts` now refuses re-conflation and requires the distinct Exploration / Experiment choices. Does not mutate existing consumer repositories (#133 remains the stale-copy refresh path). PATCH. Fixes #342.

## [3.3.0] - 2026-09-18

- **Publish unused LocalCiContractV3 identity `v3.3.0` with fail-closed remote readback (RT102 C4):** Allocate a new unused SemVer whose tagged commit VERSION/TEMPLATE_VERSION bytes equal the tag. Do not move or reuse `v3.1.0` or `v3.2.0`. `--check`/`--self-test`/`--write` run `assertCommitVersionMatchesDeclaredSemver` against the remote peeled publication commit and refuse the frozen `88591ee` 3.1.0 tree. Remote readback fails closed on missing, unpeelable, or disagreeing tags and derives match flags from that comparison instead of copying `true`. Canary `receiptUrl` values bind durable receipt blobs, not triage/progress comments. Nested release evidence no longer claims a later PR review as a review of the frozen producer. MINOR. Fixes #341.
- **Publish validation skills in immutable general Template release (RT-380):** Ensure `skills/pr-validation/SKILL.md` and `skills/full-validation/SKILL.md` are closed in the general Template inert-seed manifest and release payload set. Extend `scripts/check-validation-contract-skills.ts` and adoption-shell tests to verify presence, byte identity, and SHA-256 closure of both released validation skills against the working tree, failing closed on absence or content drift. PATCH. Fixes #380.
- **Standardize SemVer authorities and derived repository VERSION (RT-90):** Reframe the canonical SemVer standard from a single repo-wide authority to one authoritative SemVer per released public contract (DOCTRINE §53). In multi-contract repositories like repo-template, preserve `TEMPLATE_VERSION` as the Template release authority and `packages/repo-quality/package.json.version` as the repo-quality package authority, defining root `VERSION` as derived non-authoritative metadata that must track `TEMPLATE_VERSION` rather than acting as a competing third release contract. Update `docs/SEMVER-CHANGELOG-STANDARD.md`, `scripts/check-semver-changelog.ts` (SVC1 derived-authority validation and `discoverPublicContracts`), and adoption-shell tests. PATCH. Fixes #90.
- **Narrow frozen-candidate evidenceDigest test seam and cover committed exitCode refusal (RT-370):** `buildVerificationFromEvidence` no longer accepts a production caller-supplied digest; overrides are test-only via `VerificationDigestTestOverride`. Adds a committed-bytes regression that flips `proof-of-detection-self-test` exitCode 0→1 and asserts freeze gates refuse. MINOR. Fixes #370.
- **Align frozen-candidate / publication VERSION binding (RT-340b / #364):** Bump repository `VERSION` and `TEMPLATE_VERSION` to `3.2.0` so the publication identity matches the candidate label (resolution option 1). The frozen tree `88591ee` still declares 3.1.0 inside its own blobs; publication must tag a commit whose VERSION bytes equal the tag. Existing `versionBinding` freeze refusal and adoption-shell regressions keep a disagreeing receipt fail-closed. MINOR. Fixes #364.
- **Align receipt-schema required-property semver with AGENTS.md (RT-371):** AGENTS.md now states that adding any property to a `required` array in `contracts/**/*.schema.json` is a MAJOR schema change (producer-regen in the same PR does not reclassify it as MINOR). `scripts/check-semver-changelog.ts` gains SVC6 — when given schema diffs, it refuses a non-MAJOR Unreleased label for required-property additions — with self-test and adoption-shell coverage. MINOR. Fixes #371.
- **Bind the LocalCiContractV3 verification evidence ledger to committed bytes (RT-340c):** RT-340b closed every working-tree read that described the frozen tree, but `loadVerificationEvidence()` in `scripts/freeze-local-ci-v3-candidate.ts` still read `contracts/local-ci/v3/verification-evidence.json` with `fs.readFileSync`, and each check's `startedAt`/`finishedAt` were copied into the digested receipt body. The independent exact-head review of #365 moved one `finishedAt` to `2099-01-01T00:00:00.000Z`, re-ran `--write`, and `receiptDigest` moved from `79d5c696…` to `263e6788…` while `candidate.commit`, `candidate.tree` and `treeVerification.matches: true` stayed correct and `freeze --check` still exited 0. The ledger provably cannot live in the frozen candidate's tree — evidence about a commit postdates that commit — so it is bound in two layers instead. First, `readCommittedBytes()` reads `git show HEAD:<path>` and fails closed when the checkout disagrees, so an uncommitted edit cannot reach the receipt at all. Second, because the ledger is the **only** receipt input read from mutable `HEAD` — every other input is read out of the frozen commit's tree, where no later commit can reach it — the exact committed bytes are pinned as `FROZEN_VERIFICATION_EVIDENCE_DIGEST` (`4909577d…`) beside `FROZEN_CANDIDATE_COMMIT`. The independent exact-head review of #369 (review 5206050540) proved the first layer alone was not enough: committing a timestamp-only re-record (one `finishedAt` `2026-09-15T03:15:05.604Z` → `2026-09-15T03:15:06.999Z`, which `scripts/record-local-ci-v3-verification-evidence.ts --write` produces in ordinary use) moved `receiptDigest` `e7021ea1…` → `e6821fb9…` with `--write`, `--check`, `--self-test` and the consumer validator all exiting 0. The pin makes every freeze gate refuse any ledger change, timestamp-only included, until the constant is deliberately bumped in the same reviewed change; the refusal names both digests and the exit its caller can reach (DOCTRINE §51). The receipt's `verification` block gains `evidenceDigest` (the sha256 of the exact evidence bytes consumed) and `evidenceSource: "committed-bytes"`, so the evidence is named rather than merely referenced by path. Adds the reviewer's mutations as regressions in both `freeze --self-test` and `packages/adoption-shell/test/local-ci-v3-candidate.test.ts`; the self-test asserts the loader and the freeze refuse independently, so the guard cannot pass incidentally through some other committed-bytes read, and derives its mutation sentinel from the value actually present so the diagnostic cannot lie about what changed. The committed path is covered end to end by a test that clones the repository, commits the re-record and asserts all three CLI gates refuse, with a negative control that removes only the pin and reproduces the review's exact digest move. MINOR. Fixes #368.
- **Read every frozen-candidate receipt input from the commit the receipt names (RT-340b):** PR #363 repaired `sha256File`, the commit/tree proof and the evidence ledger, but `loadPayloadSet()`, `loadArtifactManifest()` and `loadCapabilityRegistry()` in `scripts/freeze-local-ci-v3-candidate.ts` still read the current checkout with `fs.readFileSync`, and `tools/release-payload.ts` enumerated `git ls-tree -rz HEAD`. The receipt therefore named frozen commit `88591ee869bb109ef481171aa817d1ed204a970e` / tree `995ea497114b2eba0b86cc3adb3666306829e0fb` while recording the branch tip's `releasePayloadSet` (`cc700a5e…`) and `artifactManifest` (`bc15d49e…`) digests; the independent exact-head review of #363 committed one unrelated `.gitignore` line, re-derived, and every gate accepted a receipt whose digests had moved while its declared commit and tree had not. Read all three manifest inputs from the frozen commit's tree, add `constructReleasePayloadAt(ref)` so the payload enumeration is pinned to a declared commit instead of `HEAD`, and re-derive the frozen payload set from the frozen commit's own tree as a fail-closed cross-check. Record how each input was obtained and its frozen blob digest in the receipt (`frozenInputs`), and bind the frozen tree's own `VERSION`/`TEMPLATE_VERSION` into the receipt (`versionBinding`), refusing to freeze a candidate whose semver is not strictly ahead of what the frozen tree declares (repo-template#364). Add `verifyLocalCiV3CandidateReceiptAgainstFrozenTree` to `adoption-shell-v2` so Model Gateway #991 and Repo Factory #187 can reject an identity-mismatched receipt — one whose `receiptDigest` was honestly recomputed over a body describing a different tree — which digest recomputation alone cannot detect. Remove the duplicate working-tree loaders from `scripts/publish-local-ci-v3-release.ts`, which carried the same defect. Regenerated digests now match `88591ee`: `releasePayloadSet` `bd900c3e…` and `artifactManifest` `5e87485f…`. Add mutation coverage for the payload-set, artifact-manifest and capability-registry paths, including a real unreferenced commit built on top of the frozen candidate with git plumbing that reproduces the reviewer's attack. MINOR. Fixes #340.
- **Repair the frozen LocalCiContractV3 candidate receipt (producer defect):** `scripts/freeze-local-ci-v3-candidate.ts` previously hashed mutable working-tree bytes (`fs.readFileSync`) under a hard-coded commit label, wrote six asserted `result: "passed"` verification rows without executing anything, and shipped no consumer-side digest validator, so a schema-valid receipt could be silently mismatched from its declared candidate or tampered without detection (repo-template#340 comment 5663075341). Replace working-tree reads with `git show <commit>:<path>` against the exact frozen commit's tree objects, prove the declared commit resolves to the declared tree via `git rev-parse <commit>^{tree}` and bind that proof into the receipt (`treeVerification`), and replace asserted checks with an authenticated, out-of-band evidence ledger (`contracts/local-ci/v3/verification-evidence.json`, produced by `scripts/record-local-ci-v3-verification-evidence.ts`, which actually executes each command and records real exit codes/timestamps); a missing, mismatched, skipped, or non-zero-exit check now throws instead of freezing. Add `validateLocalCiV3CandidateReceiptV1` (exported from `adoption-shell-v2`) as the consumer digest validator Model Gateway #991 and Repo Factory #187 call to schema-validate and recompute `receiptDigest`, rejecting schema-valid tampering. Add regression coverage proving each failure mode fails closed: a mutated working-tree copy of a canonical file, a wrong declared tree, a skipped/failed/unbound evidence check, and a schema-valid tampered receipt. Re-freeze one new immutable candidate (`receipt-issue-340-rt340repair1`, commit `88591ee869bb109ef481171aa817d1ed204a970e`, tree `995ea497114b2eba0b86cc3adb3666306829e0fb`, SemVer label `3.2.0` to avoid reusing the already-released `3.1.0` identity per comment 5663732372) from these repaired mechanics on the exact repair head after the complete repository gate passed. Grandfather pre-existing, unrelated repo-wide lint debt via `eslint . --suppress-all` (`eslint-suppressions.json`), which was blocking a clean gate run on `master` independent of this defect. Downstream rebinding of publication (#341) and both canaries (model-gateway#991, repo-factory#187) to this repaired identity remains out of scope for this chunk. MINOR. Fixes #340.
- **Publish immutable LocalCiContractV3 release and post-publication readback receipt:** publish the proven LocalCiContractV3 candidate through Repo Template's single immutable release authority (`releaseId: "spencer-shadley/repo-template@3.1.0"`, commit `003bcc16deb5a1db3ab37dc17991b9f616a6d09e`, tree `495c6914c00f046c17e053efb61eb24fcf3cc7f2`, tag `v3.1.0`) and produce the post-publication readback receipt (`receipt-issue-341-mu15pl0x`) joining the published release to both terminal canary proofs (Model Gateway #991 `receipt-issue-991-mu14rxy2` and Repo Factory #187 `receipt-issue-187-mu14zjfz`). Add `scripts/publish-local-ci-v3-release.ts` with `--write`, `--check`, and `--self-test` modes, post-publication readback receipt schema (`contracts/local-ci/v3/post-publication-readback-receipt.schema.json`), and adoption-shell test coverage verifying independent readback, exact digest closure, and cross-linking to epic #102 without introducing alternate version or queue authority. PATCH. Fixes #341.
- **Freeze LocalCiContractV3 canary candidate and pre-publication acceptance receipt:** freeze exact immutable LocalCiContractV3 canary candidate identity (commit `003bcc16deb5a1db3ab37dc17991b9f616a6d09e`, tree `495c6914c00f046c17e053efb61eb24fcf3cc7f2`, SemVer `3.1.0`) and produce pre-publication acceptance receipt binding exact contract/validator/fixture/payload digests, candidate release receipt, proof-of-detection semantics, repository verification status, and canary guidance for Model Gateway #991 and Repo Factory #187. Add `scripts/freeze-local-ci-v3-candidate.ts` with `--write`, `--check`, and `--self-test` modes, canary candidate receipt schema, and adoption-shell test coverage while preserving `publicationState: "candidate"` pending canary completion. PATCH. Fixes #340.
- **Delegate SemVer parsing and precedence to node-semver:** remove local `SEMVER_REGEX`, `compareSemVer`, and `parseSemVerNumbers` from `scripts/check-semver-changelog.ts` and `scripts/rotate-changelog-weekly.ts`, delegating SemVer 2.0.0 parsing, validation, and ASCII precedence to pinned `semver` while preserving canonical `VERSION` and changelog repository policy. Add comprehensive parity regression coverage and architectural assertions preventing duplicate parsers. PATCH. Fixes #338.
- **External package-manager store invariant enforcement:** add `scripts/check-package-manager-store.ts` to verify that active package-manager cache/store paths remain outside the repository checkout and that no in-repo cache directories (`.pnpm-store`) exist. Keeping store state external prevents working tree dirt from wedging queue reconciliation with `(unknown-state)`. Self-test and adoption-shell unit tests verify both valid external store paths and negative in-repo injection fixtures. PATCH. Fixes #108.
- **Machine-checkable charter contracts:** add a dual-mode `validateCharter` exported from the adoption-shell to enforce required `Mission`, `Responsibilities`, and `Non-responsibilities` sections.
- **Tolerant Betterleaks merge-gate default:** shared secret scans now require `high` confidence,
  keeping provider-shaped credential detection blocking while low/medium fixture, placeholder, and
  local-service heuristics no longer stop fleet delivery; conformance covers both directions
  (repo-template#302).

### Added

- **Materialize default Vitest test harness for generated TypeScript repositories:** publish runtime-neutral test harness contract (`contracts/test-harness/v1/test-harness.schema.json`, `valid-vitest-harness.json`, and `invalid-test-harness.json`) and extend `adoption-shell-v2` with `test-harness.ts` to materialize `vitest.config.ts` and a deterministic unit smoke test (`test/smoke.test.ts`) for newly generated TypeScript/JavaScript repositories where the selected portable profile requires a JS/TS unit-test runner (`full-stack`, `service`, `library`, or custom profiles declaring `test`). Non-destructively wires `"test": "vitest run"` into generated `package.json` without overwriting existing test commands, exact-pins Vitest dependency (`3.0.7`), omits Vitest machinery for standalone or non-JS/TS profiles, preserves byte/digest determinism, and composes with repository verify gates without defining a second CI authority. Motivated by fleet learning from epic #85, AO #1279, and repo-template #354 / #359 where unrequested or unbundled test-runner mutations left incomplete test commands in generated consumers and custom language configurations silently failed or diverged without explicit JS/TS allowlists and capability gating. MINOR. Fixes #339.

- **Materialize portable product and registry overlays with immutable bootstrap provenance:** publish runtime-neutral product and registry overlay contracts (`contracts/product-overlay/v1/product-overlay.schema.json`, `contracts/product-overlay/v1/technology-registry.overlay.schema.json`, and `contracts/product-overlay/v1/component-registry.overlay.schema.json`) and extend `adoption-shell-v2` with `product-overlay.ts`, `product-overlay-contract.ts`, `product-overlay-validation.ts`, and `product-overlay-yaml.ts` to materialize `product-overlay.yaml`, `technology-registry.overlay.yaml`, and `component-registry.overlay.yaml` with closed platform roles (`primary`, `secondary`, `accessory`, `specialized`, `dormant`, `not-targeted`), mandatory revisit triggers for dormant surfaces, and fail-closed immutable provenance validation rejecting mutable branch references and URLs. Motivated by fleet learning from epic #85 and AO #1279 where mutable guide branches (`agent-orchestrator/master`) caused drift and non-deterministic audits; documented in ADR-0011. MINOR. Fixes #336.

- **Materialize portable repository shape and Turborepo task graph:** publish runtime-neutral repository shape contracts (`contracts/repository-shape/v1/repository-shape.schema.json` and `contracts/repository-shape/v1/turbo.schema.json`) and extend `adoption-shell-v2` with `repository-shape.ts` to materialize portable monorepo skeleton roots (`apps/`, `services/`, `native/`, `tools/`, `packages/`, `database/`, `infrastructure/` only where the selected profile requires them) and canonical `turbo.json` task graph composing declared scripts (`build`, `lint`, `test`, `verify`). Ensure byte-stable determinism, fail-closed validation, and create-only preservation without mutating existing consumers. MINOR. Fixes #335.

- **ProductSliProbeV1 portable contract and migration rules:** publish runtime-neutral `ProductSliProbeV1` contract (`contracts/product-sli-probe/v1/product-sli-probe.schema.json` and `product-sli-observation.schema.json`) binding active `PRIORITIES.md` local SLI rows to safe read-only/fixture-only probe entrypoints, typed observation evidence, and explicit report-only dispositions. Compose fail-closed validation with #326's local authority guard (`scripts/check-local-sli-authority.ts`). Add browser-extension (Gmail #554) and service dry-run (Sharingan #140) fixtures, destructive rejection fixtures, migration playbook section in `docs/MIGRATION.md`, and ADR-0010. MINOR. Fixes #110.
- **Canonical repository SemVer and weekly preserved changelog rotation standard**: define `VERSION` as the canonical single machine-readable repository SemVer, document active changelog maintenance in `docs/SEMVER-CHANGELOG-STANDARD.md`, add idempotent weekly changelog archival generator (`scripts/rotate-changelog-weekly.ts`) rotating prior entries to `docs/changelogs/YYYY-Www.md`, and provide structural validator (`scripts/check-semver-changelog.ts`). MINOR. Fixes #90.
- **`@spencer-shadley/repo-quality` 1.7.0 adds the portable `simpleDiff.quality-lint`
  land-gate selector:** its checked template projection runs blocking `pnpm lint` for kit-consume
  and lint-adapter diffs, and the bootstrap verifier fails TypeScript/JavaScript consumers that do
  not declare this class or a covering superset. This is the deterministic response to
  repo-template#167, where kit consumes otherwise ran an unnecessary full gate.
- **`@spencer-shadley/repo-quality` 1.6.0 adds Betterleaks secret-scan recipes:** the published
  wrapper runs redacted current-tree, staged land, and onboarding-history scans through the
  host-installed `betterleaks` binary. Template verification fails closed on current-tree
  findings or a missing binary; consumer config remains opt-in only for issue-linked local
  allowlist/baseline additions. Betterleaks is the fleet recipe; Gitleaks and Semgrep are not
  fleet-wide recipes. MINOR. Fixes #153.
- **`@spencer-shadley/repo-quality` 1.5.0 adds advisory jscpd v5 scanning:** the kit owns the
  shared AI-reporter policy and wrapper, while template verification writes `.ops/jscpd-ai.txt`
  without failing on clone findings. The bootstrap gate requires consumers to invoke the kit path;
  fail-closed promotion awaits measured clone volume in a separate issue. MINOR. Fixes #152.
- **`@spencer-shadley/repo-quality` 1.4.0 now owns the mandatory Knip policy:** its published
  wrapper runs both default and strict Knip modes, and its config promotes import cycles to errors.
  Template verify paths invoke that wrapper; the presence gate rejects vendored cycle-policy copies
  and untracked policy downgrades. Fleet-wide `dependency-cruiser` remains prohibited. MINOR.
  Fixes #151.
- **`LocalCiContractV3` proof-of-detection** (`contracts/local-ci/v3/local-ci-contract-v3.schema.json`,
  `contractId: "repo-template/local-ci-v3"`): every declared command now requires `detectionProof`,
  either a known-bad fixture the gate must flag or a recorded, non-empty `exempt` reason -- never
  silent or defaulted. New, additive contract identity alongside the frozen, unmodified
  `LocalCiContractV2`; no existing v2 consumer starts failing schema validation. Migration path:
  `classifyAndMigrateLocalCiV2ToV3` rejects unmigrated v2 declarations with an exact
  `commandsMissingDetectionProof` list rather than inferring proof. See ADR-0009. MAJOR (new v3
  identity; v2 unchanged).
- **The outcome contract** (`contracts/local-ci/v3/local-ci-outcome-v1.schema.json`,
  `contractId: "repo-template/local-ci-outcome-v1"`): `pass | fail | skipped | could-not-execute`,
  never fewer than four states, with a closed schema coupling so `skipped`/`could-not-execute`
  can never carry a passing shape. Closes the "skip/unknown silently equals pass" class (watcher
  skip, no-op `prune`, never-run gate, bare-worktree could-not-execute). See ADR-0009. MINOR.
- **The proof-of-detection meta-gate** (`scripts/proof-of-detection/run-meta-gate.mjs`): plants
  each declared command's detection-proof fixture, asserts the command exits non-zero, and restores
  crash-safely via an on-disk plant ledger. Ships with a reference `theme-dual-mode-lint` detector
  and its `--self-test` reproduces the exact historical hex-only blindness (issue #131) against
  `rgb(13 15 22 / 92%)`, proving the meta-gate passes the real luminance-aware detector and fails
  the deliberately blinded one. Wired into `verify:self`. See ADR-0009. MINOR.
- **Runtime-artifact registry** (`.runtime-artifact-registry.json` +
  `.runtime-artifact-registry.schema.json` + `scripts/check-runtime-artifact-registry.mjs`):
  replaces the advisory transient-pattern-list template prose with a checked, bidirectional
  cross-validation between tagged `.gitignore` lines and a machine-readable registry. Wired into
  `verify:self`. See ADR-0009. MINOR.
- **Git-consumable `@spencer-shadley/repo-quality` kit** (`packages/repo-quality/`): the exact
  quality-rule factory and its ESLint dependencies now have one source of truth; the copied root
  `eslint.quality.mjs` is gone. Template configs import the kit, documentation records the Git
  dependency, and the presence gate rejects consumer factory copies. Consumers MUST migrate before
  taking this structural MAJOR change; new adopters SHOULD depend on the kit. Refs #147. MAJOR.
- Introduced `LocalCiContractV2`: a versioned machine-readable local-CI contract schema (`contracts/local-ci/v2/local-ci-contract-v2.schema.json`), pure offline validator, fail-closed legacy V1 dispositions (`model-gateway-v1` and `repo-factory-v1`), positive/negative fixtures, and ADR-0008. MAJOR. Refs #102; this source candidate cannot close it before the separate canaries and release receipt.
- Added an optional closed `releaseEvidence` envelope to immutable Template release receipts,
  binding exact review, content-addressed canary receipts, named passed checks, deterministic
  producer-tag readback, and correct-forward supersession evidence while retaining compatibility
  with existing receipts. MINOR. Refs #102.

### Changed

- Publish the repo-quality kit as an immutable producer-owned package-root Git commit with exact package identity and export verification.
- Keep TypeScript 6 parser compatibility inside the package dependency closure while repository builds use TypeScript 7.
- Copied Code's generated dual-ladder `.github/ISSUE_TEMPLATE/task.md`
  (`governed-intake-body-v1`) so portable intake no longer ships a single
  "Fix or next action" column. Provenance path stays this repo's
  `.github/ISSUE_TEMPLATE/task.md`. The intake recurrence guard now requires
  all nine ranks, both Defect ladders, and legal status tokens. MINOR.
  Fixes #184.
- Documented the fleet SLI 30 `repo_source_stock` repo source-stock split-trigger in
  `docs/QUALITY-LINT.md`. MINOR. Fixes #164.
- **`@spencer-shadley/repo-quality` now runs typed TypeScript linting**: the kit uses
  `strictTypeChecked` with the project service, applies the type-aware rules only to TypeScript,
  and disables them for JavaScript/config boundaries. Unsafe narrowing assertions, `any`, and
  non-null assertions now fail; the template's existing lint debt is grandfathered only through
  `eslint-suppressions.json`. MINOR. Fixes #148.
- Added a material-choice-only governance reminder to `PLAN_TEMPLATE.md`, including the complete
  workspace-to-change `AGENTS.md` breadcrumb chain and an open-ended no-material-tradeoff carve-out.
  PATCH.

### Removed

- **`plans/QUEUE.md` + template-manifest row.** Breaking: new repos must not recreate the
  retired queue file. Enrollment remains `projects.json`; claim selection is `WorkProjectionV1`
  + `fleet-control-plane`. Updates `docs/QUEUE-ENROLLMENT.md`, `AGENTS.md`, `README.md`, and
  ADR-0003 supersession. MAJOR.

### Fixed

- **Model-agnostic manager policy:** remove concrete `Luna-low` identity from portable `AGENTS.md` and `tools/verify-template-self.ts`, delegating manager/coordinator model admission to the current Model Router policy release. PATCH. Fixes #118.
- **`@spencer-shadley/repo-quality` is now npm-installable from its GitHub subpath:** the private
  template workspace uses an npm-readable local `file:` dependency while preserving pnpm's
  workspace link, and `repo-quality:npm:check` proves the real Git-subpath install. Consumer repos
  must repin their Git dependency and regenerate their lockfile to a post-fix template commit.
  MINOR. Fixes #299.
- Removed legacy exports from standalone scripts so the shared lint configuration
  enforces script encapsulation without suppressions. PATCH. Fixes #243.
- **`@spencer-shadley/repo-quality` resolves Betterleaks host shims outside `PATH`:** the
  secret-scan wrapper checks PATH candidates and the operator's `.local/bin` location, then uses
  the resolved absolute binary; Windows `.cmd` shims run through an explicit `cmd.exe` process
  without `shell: true`. Missing binaries remain a fail-closed error. PATCH. Fixes #200.
- **`@spencer-shadley/repo-quality` 1.3.0 closes inline ESLint configuration as a gate
  bypass:** the kit ignores inline config, rejects every inline ESLint directive with a migration
  pointer, and no longer accepts one as a TypeScript waiver. Existing debt is centralized in
  `eslint-suppressions.json`; only explicit `@stack-waiver` annotations explain JavaScript
  boundaries. The bootstrap verifier rejects consumer config that re-enables inline configuration.
  MINOR. Fixes #150.
- Restored the adoption-shell fixture generator after the #154 extraction: shared fixture
  constructors now resolve without a cyclic initialization failure, and strict TypeScript
  narrowing covers the extracted validator paths. Regenerated the committed artifact closure.
  PATCH.
- **Advisory `ci.yml` no longer echoes that the live thin check is a stub**
  (repo-template#134 / code#1560 D3). `lint-user-surface-leaks` already runs on
  preinstalled node. Adopter `TODO(setup):` toolchain/lint/test comments stay.
  PATCH.

## [3.2.0] - 2026-09-16

- Align repository VERSION/TEMPLATE_VERSION with LocalCiContractV3 candidate semver 3.2.0 (repo-template#364). Publication must tag this identity only when the tagged commit's VERSION bytes equal 3.2.0.

## [3.1.0] - 2026-07-29

### Fixed

- Separated the complete raw overlay manifest from a content-addressed inert-seed release manifest
  and payload set. The exact released materializer now accepts every selected path while local issue
  templates and workflows remain explicit pre-custody exclusions. Added deterministic
  path/mode/content/inventory closure, explicit raw-document projection exclusions, and a
  disposable in-memory consumer proof. MINOR. Fixes #105.
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
