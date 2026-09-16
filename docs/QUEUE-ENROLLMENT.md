# Flywheel enrollment

How this repo (or any repo instantiated from this template) joins the autonomous
issue → plan → implement → verify → review → merge flywheel. Enrollment is the
workspace default, not an optional extra.

## Policy (near-mandate)

Every repo under the workspace enrolls. Opt-out requires an accepted ADR in the
repo stating why — acceptable reasons are rare (e.g. archival/read-only repos).
A repo that is not enrolled and has no such ADR is a setup defect.

An applicable repo is **not ready for enrollment** until it has both repository-owned
validation contracts:

- `skills/pr-validation/SKILL.md` — the deliberately small required-before-merge checklist;
- `skills/full-validation/SKILL.md` — the exhaustive asynchronous exact-SHA validation contract.

The contracts must describe real repository-local authority. A copied placeholder or an unresolved
validation source is not readiness. A typed exemption is allowed only when the canonical fleet
lifecycle/registry model explicitly accepts one.

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
2. Resolve and commit `skills/pr-validation/SKILL.md` from the repository's real merge-path checks:
   cheap static/lint checks, compile/typecheck/build where applicable, relevant/affected tests, and
   repo-specific cheap integrity checks. Do not make the exhaustive suite a mandatory PR gate by
   default.
3. Resolve and commit `skills/full-validation/SKILL.md` from the repository's real exhaustive
   authority (`local-ci.json`, package/build `verify`, or an explicitly documented native full
   suite). Exact-SHA PASS/FAIL/UNABLE semantics are required.
4. Prove both validation skills are destination-correct. If either authority is missing or
   ambiguous, stop with not-ready evidence rather than guessing commands.
5. Register/publish the repository through the canonical fleet lifecycle so the resulting
   `FleetRegistryReleaseV1` includes the applicable repository identity. Perform any current
   Agent-Orchestrator queue membership/configuration step required for its execution lane.
6. Configure recurring queue/drain machinery only through the current fleet scheduler owner; do not
   invent a repo-local scheduler authority here.
7. Declare the risk tier and repository charter in `AGENTS.md` and set `.template-sync.json` anchors
   (`syncedVersion`/`syncedCommit`).
8. Confirm a green merge-path baseline using `skills/pr-validation/SKILL.md` and a green exhaustive
   baseline using `skills/full-validation/SKILL.md` on the current default-tip SHA before normal
   autonomous work begins.

## Verification

Enrollment is complete only when all of the following are true:

- the applicable repository appears in the current producer-verified `FleetRegistryReleaseV1`;
- any required queue/execution-lane registration is present;
- `skills/pr-validation/SKILL.md` and `skills/full-validation/SKILL.md` exist and resolve real local
  authority (or a canonical typed exemption exists);
- both baseline validations have exact-SHA evidence for the current default tip; and
- a trivial docs plan drains end-to-end autonomously: enqueue → scheduled drain → PR → merge.

`plans/drafts/000-smoke.md` is the standard smoke plan.
