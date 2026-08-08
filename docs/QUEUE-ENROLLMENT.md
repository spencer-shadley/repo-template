# Flywheel enrollment

How this repo (or any repo instantiated from this template) joins the autonomous
issue → plan → implement → verify → review → merge flywheel. Enrollment is the
workspace default, not an optional extra.

## Policy (near-mandate)

Every repo under the workspace enrolls. Opt-out requires an accepted ADR in the
repo stating why — acceptable reasons are rare (e.g. archival/read-only repos).
A repo that is not enrolled and has no such ADR is a setup defect.

## What enrollment means

All source changes flow **issue → triage → plan → loop (implement/verify/review) → PR → merge**.
Humans and agent sessions enqueue plans instead of hand-editing source — a
PreToolUse guard enforces this in the workspace. Docs, config, and the `plans/`
directory itself remain direct-editable (see each repo's `AGENTS.md` for the
exact risk tier and exemptions).

**Enrollment SSOT is `projects.json` membership** (non-archived). Hooks and
skills must not treat “a QUEUE.md file exists” as enrollment. See fleet P0e
([code#1288](https://github.com/spencer-shadley/code/pull/1288)) and
[git-first-end-state-status](https://github.com/spencer-shadley/code/blob/master/docs/architecture/git-first-end-state-status.md).

**Claim selection** is derived from the issue/accepted-plan DAG
(`WorkProjectionV1`). Lease/claim authority lives in `fleet-control-plane`.
`plans/QUEUE.md` is a **forbidden tombstone**: do not recreate it; any
implementation that writes that path is rejected.

## How to enroll

The `adopt-project` skill performs all of the steps below automatically when
instantiating a new repo from this template.

1. The repo lives under the plane path with this template's structure. Do **not**
   create `plans/QUEUE.md`.
2. **Register the repo in `repos/infra/agent-orchestrator/projects.json`**
   (`"<name>": { … }` with a non-archived criticality). **This is what enrolls
   the repo** for hooks, drain, and skills.
3. Create the Windmill drain schedule `drain_<name>` (mirror an existing
   schedule; every 5 min, flow `f/orchestrator/drain_queue`, args
   `{project: "<name>"}`).
4. Add the repo to the discovery watchlist (`C:\agent-review\watchlist.tsv`).
5. Declare the risk tier in `AGENTS.md`.
6. Set `.template-sync.json` anchors (`syncedVersion`/`syncedCommit`).
7. Confirm a green baseline: the verify gate passes on `master` before the first
   plan runs.

## Verification

Enrollment is complete when the project appears in `projects.json` (non-archived)
**and** a trivial docs plan drains end-to-end autonomously: enqueue → scheduled
drain → PR → merge. `plans/drafts/000-smoke.md` is the standard smoke plan.
