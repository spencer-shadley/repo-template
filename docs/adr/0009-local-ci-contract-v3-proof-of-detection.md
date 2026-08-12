# ADR-0009: LocalCiContractV3 proof-of-detection, the outcome contract, and the meta-gate

- **Status:** accepted
- **Date:** 2026-08-12
- **Decider:** Repo Template Sole Source Writer (Issue #131)
- **Applies to:** `local-ci-v2`/`local-ci-v3` contract consumers, the proof-of-detection meta-gate,
  and the runtime-artifact registry

## Context

Nine independently-found defects on 2026-08-12 shared one root cause: a check reported on its own
execution ("the command ran") rather than on the invariant it exists to protect ("the thing is
true"). A hex-only dark-surface regex reported `darkFingerprintCss: 0` while 22 `rgb()` dark
surfaces shipped. `git worktree prune` reported success while 702 worktrees accumulated -- it only
reclaims *missing* directories, so it was a permanent no-op. A deploy watcher returned
`LastTaskResult: 0` for hours while the host sat stale. A land path "landed" work with no gate at
all. Every one was green. None were true.

`LocalCiContractV2` (ADR-0008) declares `executable`, `args`, `timeoutSeconds`,
`expectedExitCode`, and `failureDisposition` per command, but has no notion of whether a declared
gate can detect anything. A gate is declared, returns 0, and is trusted forever; nobody ever proves
it can go red. Two distinct sub-problems compound this: (1) unproven detection -- a gate's green is
meaningless without evidence it fails on a planted defect; (2) skip/unknown silently equal pass --
a watcher that skipped its update, a no-op `prune`, and a never-run gate all returned/read as the
same "0" as a genuine pass.

## Decision

1. **`LocalCiContractV3`** (`contracts/local-ci/v3/local-ci-contract-v3.schema.json`,
   `contractId: "repo-template/local-ci-v3"`, `schemaVersion: "3.0.0"`) is a **new, additive major
   contract identity**, published alongside the frozen, unmodified `LocalCiContractV2`. It does not
   silently widen v2: existing `schemaVersion: "2.0.0"` declarations keep validating against the v2
   schema/validator exactly as before and never start failing because a new required field
   appeared elsewhere. Every command in a v3 declaration requires `detectionProof`, exactly one of:
   - `{ fixture: { path, description, expectation: "non-zero-exit" } }` -- a known-bad fixture the
     meta-gate plants and the command must flag; or
   - `{ exempt: "<non-empty reason>" }` -- a recorded, countable exemption. Exemptions are never
     silent or defaultable: the schema rejects an empty string and rejects declaring both `fixture`
     and `exempt` at once (`E_DETECTION_PROOF_CONFLICT`) or neither
     (`E_DETECTION_PROOF_MISSING`).
   - `classifyAndMigrateLocalCiV2ToV3` is the migration path: a valid v2 declaration is never
     auto-upgraded (detection proof cannot be inferred -- that would defeat the point), it is
     rejected with `reasonCode: "MISSING_DETECTION_PROOF"` and an exact
     `commandsMissingDetectionProof` list so the consumer knows precisely what to add. Unknown/
     legacy-v1 shapes fall through to the same fail-closed dispositions ADR-0008 already defined.

2. **The proof-of-detection meta-gate** (`scripts/proof-of-detection/run-meta-gate.mjs`) is the
   mechanism the orchestrator plan template's advisory rule always needed. For every declared
   command it plants the fixture, asserts the command exits **non-zero**, and restores. A command
   that stays green on planted bad input fails the meta-gate. Restoration is crash-safe: a plant is
   recorded in `.ops/proof-of-detection-plant-ledger.json` *before* the command runs, so a killed
   process leaves a trail the next invocation self-heals from (`restoreOrphans`), and a plant never
   overwrites an existing path. The meta-gate's own acceptance test (`--self-test`) wires the
   reference `theme-dual-mode-lint` detector (`scripts/proof-of-detection/reference-detectors/`) in
   both its current luminance-aware mode and its deliberately reverted historical hex-only mode
   against the exact `rgb(13 15 22 / 92%)` fixture that let 22 dark surfaces ship: the luminance
   mode must be proven (non-zero exit) and the hex-only mode must be caught as blind (stays exit 0,
   which fails the meta-gate). A meta-gate that cannot tell these two apart does not work.

3. **The outcome contract** (`contracts/local-ci/v3/local-ci-outcome-v1.schema.json`,
   `contractId: "repo-template/local-ci-outcome-v1"`) closes the "skip/unknown equals pass" class
   directly: every command execution reports exactly one of `pass | fail | skipped |
   could-not-execute`, never fewer. `skipped` and `could-not-execute` always carry a non-empty
   `reason` and a `null` exitCode; `pass`/`fail` always carry an integer `exitCode` and a `null`
   reason. The schema enforces this coupling with a closed `oneOf`, so a skipped check can never be
   shaped like a passing one. This directly closes four of the nine defects: the watcher that
   skipped its update and returned 0, `prune` that no-opped and returned 0, a never-run gate read as
   satisfied, and a gate that could not execute in a bare worktree (indistinguishable from a real
   regression under the old two-state model).

4. **The runtime-artifact registry** (`.runtime-artifact-registry.json` +
   `.runtime-artifact-registry.schema.json` + `scripts/check-runtime-artifact-registry.mjs`)
   replaces the advisory template-prose rule ("RULE (2026-07-02b): ... register it in the shared
   transient-pattern list") with a checked contract. Every `.gitignore` line meant to suppress a
   specific tool's runtime output is tagged `# runtime-artifact: owner=<repo> incident=<ref>`
   immediately above the pattern; the check cross-validates the tagged set against the registry in
   both directions -- tagged-but-unregistered and registered-but-untagged both fail closed. The
   registry itself currently documents `agent-orchestrator`-owned patterns (queue/loop transient
   sidecars, including the exact `.ops/work-items/*` paths from repo-template#129) because
   repo-template does not own the tools that write them; `agent-orchestrator` must adopt this
   template file and check and keep its own entries current (see `docs/MIGRATION.md`).

5. **Unproven-gate telemetry**: the meta-gate's summary line reports the exempt (unproven) count on
   every run (`proof-of-detection: unproven-gate count = N`), following this repo's existing
   plain-stdout-summary-line convention (`user-surface-lint: scanned N files; found M leaks`,
   `verify-quality-lint-required: ok -- ...`) rather than introducing a parallel telemetry system.

## Consequences

- Consumers on `local-ci-v2` are unaffected until they choose to adopt v3; nothing about v2
  validation changed.
- A consumer adopting v3 must give every declared command a real detection proof or a named,
  recorded exemption before its declaration validates -- there is no default that reaches "valid"
  silently.
- The meta-gate is a template capability (`repo-template/local-ci-contract-v3` and
  `repo-template/proof-of-detection` capability bundles); running it against a repo's *actual*
  `local-ci.json` and wiring it into that repo's own `verify` is each consumer's adoption step, not
  something this release performs on their behalf.
- Never weaken a gate to reach green: this release does not relax `LocalCiContractV2`, its
  validator, or any existing fixture.
