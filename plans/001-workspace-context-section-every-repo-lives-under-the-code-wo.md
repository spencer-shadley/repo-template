# Plan 001: workspace-context section — every repo lives under the code workspace (v1.2.0)

- **Project:** repo-template
- **Status:** ready for codex
- **Priority:** P2
- **Effort:** low

## Objective

Repos instantiated from this template don't exist in isolation — they live as nested repos under
the workspace root `C:\code` (GitHub: https://github.com/spencer-shadley/code) and inherit
workspace-level machinery. The template must say so, so agents entering a fresh repo know what is
inherited vs local. User-requested 2026-07-02.

## Changes

1. **README.md** — add a `## Workspace context` section (after the structure table):
   - This repo is one of several nested under the workspace root
     [`spencer-shadley/code`](https://github.com/spencer-shadley/code) at `C:\code\<repo>` —
     each nested repo has its OWN git history/remote; the root repo tracks only workspace-level
     manifests.
   - Inherited from the workspace (do not duplicate locally):
     the root `AGENTS.md` (workspace rules — this repo's AGENTS.md takes precedence only on
     conflict), the plan-queue orchestrator (`agent-orchestrator/`: run-loop, drain schedules,
     enqueue tooling), the incident CLI (`agent-orchestrator/lib/incident-log.mjs`), the
     template-drift sweep, discovery/triage agents, and the PreToolUse guard that routes source
     changes through the queue.
2. **AGENTS.md (content section, near the top)** — one short paragraph: "This repo lives under the
   `C:\code` workspace ([spencer-shadley/code](https://github.com/spencer-shadley/code)); the root
   `AGENTS.md` there also applies (this file wins on conflict). Workspace services you can rely on:
   plan queue, incident log CLI, template-drift subscription, discovery agents."
3. **CHANGELOG.md** — add under a new `## [1.2.0] - <today>` heading: "Added: workspace-context
   section (nesting contract + inherited pieces)".
4. **TEMPLATE_VERSION** — set to `1.2.0` (MINOR: additive doc structure).

## Out of scope

Changing the workspace root repo itself; the TEMPLATE-SELF block; git tagging (the human/driver
tags vX.Y.Z after merge — tags can't ride a squash-merge).

## Acceptance criteria

- [ ] README has the Workspace context section with the GitHub link + inherited-pieces list.
- [ ] AGENTS.md content section references the workspace root AGENTS.md precedence rule.
- [ ] TEMPLATE_VERSION == 1.2.0 and CHANGELOG has the 1.2.0 heading.
- [ ] Verify gate green.

## Verify

```bash
! grep -rn '<<<<<<<' --include='*.md' --include='*.yml' .
for f in README.md AGENTS.md CLAUDE.md TODO.md SECURITY.md .gitignore plans/QUEUE.md docs/ARCHITECTURE.md docs/adr/0001-design-philosophies.md docs/adr/0005-git-conventions.md TEMPLATE_VERSION CHANGELOG.md; do [ -f "$f" ] || { echo "missing $f"; exit 1; }; done
grep -q "1.2.0" TEMPLATE_VERSION
grep -q "spencer-shadley/code" README.md
```

## Risk

Tier: `auto` (docs-only, per this repo's TEMPLATE-SELF policy).
