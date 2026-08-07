# Queue enrollment

How this repo (or any repo instantiated from this template) joins the autonomous plan-queue
system. Enrollment is the workspace default, not an optional extra — see Policy below.

## Policy (near-mandate)

Every repo under the workspace enrolls in the plan-queue system. Opt-out requires an accepted
ADR in the repo stating why — acceptable reasons are rare (e.g. archival/read-only repos). A repo
that is not enrolled and has no such ADR is a setup defect: the fleet audit flags it.

## What enrollment means

All source changes flow **issue → triage → plan → loop (implement/verify/review) → PR → merge**.
Humans and Claude sessions enqueue plans instead of hand-editing source — a PreToolUse guard
enforces this in the workspace. Docs, config, and the `plans/` directory itself remain
direct-editable (see each repo's `AGENTS.md` for the exact risk tier and exemptions).

**Enrollment SSOT is `projects.json` membership** (non-archived), not the mere presence of
`plans/QUEUE.md`. Hooks and skills must not treat “file exists” as enrollment. See fleet P0e
([code#1288](https://github.com/spencer-shadley/code/pull/1288)) and
[decision-c-queue-retirement-prep](https://github.com/spencer-shadley/code/blob/master/docs/architecture/decision-c-queue-retirement-prep.md).

**Claim Pending SoT (Decision C, fleet-live):** the issue/plan DAG regenerates
`.ops/work-items/QUEUE.generated.md`; drain claims from that file when
`ORCH_DECISION_C_QUEUE_GENERATED_CLAIM_SOT=1`. Hand `plans/QUEUE.md` is **frozen optional glass**
(`ORCH_DECISION_C_WRITE_GENERATED_QUEUE=0` since 2026-08-07) — not claim SoT, not kept fresh —
heading toward M9 delete after remaining readers and the `CLAIM_SOT=0` kill-switch fallback no
longer need the path. Live operator card:
[git-first-end-state-status](https://github.com/spencer-shadley/code/blob/master/docs/architecture/git-first-end-state-status.md).

## How to enroll

The `adopt-project` skill performs all of the steps below automatically when instantiating a new
repo from this template. They are documented here for reference and for manual/partial adoption.

1. The repo lives under `C:\code\<name>` (or the plane path) with this template's structure
   (`plans/QUEUE.md` may ship as a short retirement sticky / history glass; claim Pending lives in
   the generated ledger after enrollment).
2. **Register the repo in `repos/infra/agent-orchestrator/projects.json`** (`"<name>": { … }` with
   a non-archived criticality). **This is what enrolls the repo** for hooks, drain, and skills.
3. Create the Windmill drain schedule `drain_<name>` (mirror an existing schedule; every 5 min,
   flow `f/orchestrator/drain_queue`, args `{project: "<name>"}`).
4. Add the repo to the discovery watchlist (`C:\agent-review\watchlist.tsv`: URL, focus prompt,
   priority).
5. Declare the risk tier in `AGENTS.md` (auto-merge lane vs human-tier triggers) — conservative
   default: human-tier for anything touching external side effects or core control flow.
6. Set `.template-sync.json` anchors (`syncedVersion`/`syncedCommit`).
7. Confirm a green baseline: the verify gate passes on `master` before the first plan runs.

## Verification

Enrollment is complete when the project appears in `projects.json` (non-archived) **and** a
trivial docs plan drains end-to-end autonomously: enqueue → scheduled drain → PR → merge.
`plans/drafts/000-smoke.md` is the standard smoke plan for this proof.
