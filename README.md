# <project-name>

<!-- TODO(setup): one-paragraph description — what this is, who it serves, the ONE core feature. -->

Bootstrapped from [repo-template](https://github.com/spencer-shadley/repo-template) — the living
standard for this workspace's repos. Structure below is load-bearing: agents (triage, review,
audit, the autonomous loop) rely on these paths.

| Path | Purpose |
|---|---|
| `AGENTS.md` | THE operating manual for agents: commands, verify gate, risk tiers |
| `CLAUDE.md` | thin pointer at AGENTS.md (single source of truth) |
| `docs/adr/` | Architecture Decision Records — decide-once, audit-forever |
| `docs/INCIDENTS.md` | curated post-mortems (majors only) |
| `docs/RUNBOOK.md` | recovery recipes specific to this repo |
| `docs/OBSERVABILITY.md` | what we log/measure and where to look |
| `.ops/incidents.jsonl` | machine incident stream (appears lazily; append-only; weekly-rotated) |
| `plans/QUEUE.md` | the autonomous work queue (`## Pending` = auto-merge lane) |
| `TODO.md` | setup survey — master checklist mirroring every `TODO(setup):` in the tree |
| `docs/ARCHITECTURE.md` | the system map agents load when entering cold |
| `SECURITY.md` | secrets doctrine + leak playbook |
| `CHANGELOG.md` | Keep-a-Changelog + the *Unchanged (intentional)* frozen-namespace section |
| `GEMINI.md` | thin pointer (every agent tool gets one; all point at AGENTS.md) |

**Setup audit:** `grep -rn "TODO(setup)"` — zero hits = fully configured.
