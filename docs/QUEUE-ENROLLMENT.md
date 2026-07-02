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

## How to enroll

The `adopt-project` skill performs all of the steps below automatically when instantiating a new
repo from this template. They are documented here for reference and for manual/partial adoption.

1. The repo lives under `C:\code\<name>` with this template's structure (`plans/QUEUE.md` ships
   with the template).
2. Register the repo in `agent-orchestrator/projects.json` (`"<name>": "<dirname>"`).
3. Create the Windmill drain schedule `drain_<name>` (mirror an existing schedule; every 5 min,
   flow `f/orchestrator/drain_queue`, args `{project: "<name>"}`).
4. Add the repo to the discovery watchlist (`C:\agent-review\watchlist.tsv`: URL, focus prompt,
   priority).
5. Declare the risk tier in `AGENTS.md` (auto-merge lane vs human-tier triggers) — conservative
   default: human-tier for anything touching external side effects or core control flow.
6. Set `.template-sync.json` anchors (`syncedVersion`/`syncedCommit`).
7. Confirm a green baseline: the verify gate passes on `master` before the first plan runs.

## Verification

Enrollment is complete when a trivial docs plan drains end-to-end autonomously: enqueue →
scheduled drain → PR → merge. `plans/drafts/000-smoke.md` is the standard smoke plan for this
proof.
