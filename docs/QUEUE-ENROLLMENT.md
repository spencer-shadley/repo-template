# Flywheel enrollment

How this repo (or any repo instantiated from this template) joins the autonomous
issue → plan → implement → verify → review → merge flywheel. Enrollment is the
workspace default, not an optional extra.

## Policy (near-mandate)

Every repo under the workspace enrolls. Opt-out requires an accepted ADR in the
repo stating why — acceptable reasons are rare (e.g. archival/read-only repos).
A repo that is not enrolled and has no such ADR is a setup defect.

An applicable repo is ready only when its repository-owned validation profile names its real
merge-path and exhaustive commands, test inventory, and any local receipt extras. Consume generic
semantics from `spencer-shadley/code:skills/validation-protocol/SKILL.md` at use time; do not copy or
pin that protocol into the repository. An unavailable canonical protocol is unresolved evidence,
not permission to invent semantics or bypass identity/integrity requirements. Preserve the actual
consumed protocol identity, reproducibility, availability and rollback evidence required by Code.

## Repository-owned validation profile

`local-ci.json` supplies this template's executable profile. Its
`commands.authoritative-gate` resolves to `pnpm verify` in the template's `package.json`.
The `merge` PR profile has an explicit broader fallback to that gate; the exhaustive profile
declares the single `default` leg for the same gate. The `simpleDiff.quality-lint` selector
declares `pnpm lint` for its listed quality-configuration paths. Selection and receipt semantics
come from the canonical Code protocol named above.

The current exhaustive inventory is:

| Surface | Checks reached by `pnpm verify` |
|---|---|
| Source and package quality | `knip`, `dup`, `secret:dir`, `lint`, directory-breadth checks, required quality-lint configuration |
| Types and published artifacts | `typecheck`, `build:check`, `verify:artifact`, repo-quality emitted-export and npm-artifact checks |
| Runtime and regression suites | `test`: adoption-shell tests in `packages/adoption-shell/test/` and `plan/`, env-access lint tests, TODO-link, hermetic-preload and default-branch-guard selfchecks |
| Template and portable contracts | `verify:self`: manifest/materialization, validation-profile conservation, issue inheritance, changelog/semver, supply chain, fleet-law/label, runtime-artifact, package-store, mutable-version, local-SLI, detection-proof, LocalCi release and release-payload checks |

`package.json` is the executable inventory; this table is navigation. Runtime and package-manager
versions, supported platforms, environment inputs and effects are declared in `local-ci.json`.
Its PR receipt flags declare candidate/base/integration bindings; no additional repository-specific
receipt fields are declared. These configuration facts alone are not a validation run receipt.

<!-- TODO(setup!): replace local-ci.json's repository identity, commands, selectors, required legs,
     runtime/package manager, environment and effects with destination facts; update this inventory
     to match the destination package scripts. -->

The coverage GAP reported in [repo-template#523](https://github.com/spencer-shadley/repo-template/issues/523)
is a collector alignment residual when its only reasons are `missing-pr-validation-skill` and
`missing-full-validation-skill`: [#459](https://github.com/spencer-shadley/repo-template/issues/459)
retired those generic copies. Keep the observed GAP visible under the existing Code audit owners
[code#5480](https://github.com/spencer-shadley/code/issues/5480) and
[code#5954](https://github.com/spencer-shadley/code/issues/5954), alongside the inspected SHA and
repository-profile evidence. Local checks establish profile validity and portability; terminal
fleet PASS is established by the canonical coverage audit.

## What enrollment means

All source changes flow **issue → triage → plan → loop (implement/verify/review) → PR → merge**.
Humans and agent sessions enqueue plans instead of hand-editing source — a
PreToolUse guard enforces this in the workspace. Docs, config, and the `plans/`
directory itself remain direct-editable (see each repo's `AGENTS.md` for the
exact risk tier and exemptions).

The producer-verified `FleetRegistryReleaseV1` is the canonical executable fleet census for
repository identity/membership used by fleet-wide automation. Do not create another handwritten
repository list. Agent Orchestrator `projects.json` remains a queue/machine-lane configuration input
where current fleet policy requires it; it is not a substitute fleet census.

**Claim selection** is derived from the issue/accepted-plan DAG
(`WorkProjectionV1`). Lease/claim authority lives in `fleet-control-plane`.
`plans/QUEUE.md` is a **forbidden tombstone**: do not recreate it; any
implementation that writes that path is rejected.

## How to enroll

The `adopt-project` / Repo Factory lifecycle performs these requirements when
instantiating or adopting a repository.

1. Materialize the repo under the correct plane path with this template's portable structure. Do
   **not** create `plans/QUEUE.md`.
2. Resolve and commit the repository-owned validation profile: real merge-path checks,
   exhaustive authority, test inventory, and local receipt extras. Refer to the canonical Code
   protocol by name without restating its semantics or storing a protocol revision.
3. Prove the local commands resolve in the destination and the canonical protocol is available.
   If either is missing or ambiguous, retain not-ready evidence rather than guessing commands.
4. Record actual consumed-protocol and tested/base identities in validation evidence. Removing a
   relied-on offline/bootstrap projection requires equivalent integrity, availability and rollback
   proof at the real consumer before adoption; this template change does not supply that proof.
5. Register/publish the repository through the canonical fleet lifecycle so the resulting
   `FleetRegistryReleaseV1` includes the applicable repository identity. Perform any current
   Agent-Orchestrator queue membership/configuration step required for its execution lane.
6. Configure recurring queue/drain machinery only through the current fleet scheduler owner; do not
   invent a repo-local scheduler authority here.
7. Declare the risk tier and repository charter in `AGENTS.md`.
8. Confirm green merge-path and exhaustive baselines using the repository-owned validation profile
   and canonical Code protocol on the current default-tip SHA before normal
   autonomous work begins.

## Verification

Enrollment is complete only when all of the following are true:

- the applicable repository appears in the current producer-verified `FleetRegistryReleaseV1`;
- any required queue/execution-lane registration is present;
- the repository-owned validation profile resolves real local commands and the canonical Code
  protocol, with equivalent integrity, availability and rollback evidence for adoption;
- both baseline validations have exact-SHA evidence for the current default tip; and
- a trivial docs plan drains end-to-end autonomously: enqueue → scheduled drain → PR → merge.

`plans/drafts/000-smoke.md` is the standard smoke plan.
