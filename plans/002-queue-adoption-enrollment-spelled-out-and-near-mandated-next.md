# Plan 002: queue-adoption enrollment — spelled out and near-mandated (next MINOR)

- **Project:** repo-template
- **Status:** ready for codex
- **Priority:** P2
- **Effort:** low

## Objective

The template documents structure but not HOW a repo joins the autonomous queue system — and joining
should be the near-mandatory default, not an optional extra. User-requested 2026-07-02.

## Changes

1. **New `docs/QUEUE-ENROLLMENT.md`:**
   - **Policy (near-mandate):** every repo under the workspace enrolls in the plan-queue system.
     Opting out requires an accepted ADR in the repo stating why (acceptable reasons are rare:
     e.g. archival/read-only repos). An un-enrolled repo without that ADR is a setup defect —
     the fleet audit flags it.
   - **What enrollment means:** all source changes flow issue → triage → plan → loop
     (implement/verify/review) → PR → merge; humans and Claude sessions enqueue plans instead of
     hand-editing (a PreToolUse guard enforces this in the workspace); docs/config/plans remain
     direct-editable.
   - **How to enroll (the adopt-project skill does all of this; manual steps for reference):**
     1. Repo lives under `C:\code\<name>` with this template's structure (`plans/QUEUE.md` ships
        with the template).
     2. Register in `agent-orchestrator/projects.json` (`"<name>": "<dirname>"`).
     3. Create the Windmill drain schedule `drain_<name>` (mirror an existing one; every 5 min,
        flow `f/orchestrator/drain_queue`, args `{project: "<name>"}`).
     4. Add the repo to the discovery watchlist (`C:\agent-review\watchlist.tsv`: URL, focus
        prompt, priority).
     5. Declare the risk tier in AGENTS.md (auto-merge lane vs human-tier triggers) — conservative
        default: human-tier for anything touching external side effects or core control flow.
     6. Set `.template-sync.json` anchors (syncedVersion/syncedCommit).
     7. Green baseline: verify gate passes on master before the first plan runs.
   - **Verification:** enrollment is complete when a trivial docs plan drains end-to-end
     autonomously (enqueue → scheduled drain → PR → merge).
2. **README.md** structure table: add the `docs/QUEUE-ENROLLMENT.md` row ("how this repo joins the
   autonomous queue — enrollment is the default, opt-out needs an ADR").
3. **TODO.md**: in `## Wiring`, replace the register/schedule line with: "Enroll in the queue
   system per docs/QUEUE-ENROLLMENT.md (NEAR-MANDATORY — opt-out requires an accepted ADR)".
4. **AGENTS.md** (content section): one line under the workspace-context paragraph: "This repo is
   queue-enrolled (see docs/QUEUE-ENROLLMENT.md); source changes go through the plan queue."
   Include a `TODO(setup):` marker to confirm enrollment happened.
5. **CHANGELOG.md**: new MINOR heading (next version above the current TEMPLATE_VERSION at
   implementation time, e.g. 1.2.0→1.3.0): "Added: QUEUE-ENROLLMENT doc; enrollment near-mandated."
6. **TEMPLATE_VERSION**: bump to that same next MINOR.

## Out of scope

Changing the adopt-project skill (workspace-side; it already performs these steps), the guard hook,
git tagging (post-merge, human/driver).

## Acceptance criteria

- [ ] docs/QUEUE-ENROLLMENT.md exists with policy + 7 enrollment steps + verification.
- [ ] README table + TODO.md + AGENTS.md reference it; near-mandate language present.
- [ ] TEMPLATE_VERSION bumped one MINOR; CHANGELOG heading matches it.
- [ ] Verify gate green.

## Verify

```bash
! grep -rn '<''<<<<<<' --include='*.md' --include='*.yml' .
for f in README.md AGENTS.md CLAUDE.md TODO.md SECURITY.md .gitignore plans/QUEUE.md docs/ARCHITECTURE.md docs/QUEUE-ENROLLMENT.md TEMPLATE_VERSION CHANGELOG.md; do [ -f "$f" ] || { echo "missing $f"; exit 1; }; done
grep -qi "opt-out requires" docs/QUEUE-ENROLLMENT.md
grep -q "QUEUE-ENROLLMENT" README.md TODO.md AGENTS.md
```

## Risk

Tier: `auto` (docs-only per TEMPLATE-SELF policy).
