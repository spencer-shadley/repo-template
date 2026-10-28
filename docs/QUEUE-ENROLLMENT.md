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

### Template validation profile

For Repo Template itself, `local-ci.json` is the repository-owned validation profile. Its
`authoritative-gate` command resolves to `pnpm verify` in `package.json`; `merge` uses the explicit
broader fallback, and the exhaustive `default` leg runs that same authority. The quality-lint
`simpleDiff` entry resolves to `pnpm lint`. These are template commands, to be replaced with the
destination's actual commands and repository identity during adoption.

The exhaustive test inventory is `packages/adoption-shell/test/*.test.ts`,
`packages/adoption-shell/test/plan/*.test.ts`, and `tests/env-dot-access-lint.test.ts`, plus the
repo-quality TODO-link, hermetic-preload, and default-branch-guard selfchecks selected by `pnpm test`.
`pnpm verify` also runs the build, lint, typecheck, artifact, secret, duplication, unused-code and
template-integrity checks listed in `package.json`. That package manifest is the executable source
of truth for the current command composition. There are no additional local receipt fields beyond the
profile's candidate/base/integration bindings; generic evidence semantics remain Code-owned.

`packages/adoption-shell/test/validation-materialization.test.ts` exercises the generated release
through the materializer and checks that the local profile and canonical protocol reference survive.
The existing `scripts/check-validation-contract-skills.ts` checks conservation without protocol
copies or pins. Neither check establishes a fleet coverage PASS by itself.

The coverage consumer is Code's `tools/validation-contract-coverage/cli.ts --markdown`
(code#5480, programme code#5954). Record its actual default-branch SHA and row after landing.
If it still reports `missing-pr-validation-skill` / `missing-full-validation-skill`, retain that GAP
with those owners: #459 retired those generic template copies in favor of the repository-owned
profile and the live canonical protocol. A collector requiring the retired paths needs alignment
at its owner; reproducing the paths would reverse the accepted ownership decision.
