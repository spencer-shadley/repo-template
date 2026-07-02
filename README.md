# {{PROJECT_NAME}}

<!-- TODO(setup): one-paragraph description — what this is, who it serves, the ONE core feature. -->

Bootstrapped from [repo-template](https://github.com/spencer-shadley/repo-template) — the living
standard for this workspace's repos. Structure below is load-bearing: agents (triage, review,
audit, the autonomous loop) rely on these paths.

| Path | Purpose |
|---|---|
| `AGENTS.md` | THE operating manual for agents: commands, verify gate, risk tiers |
| `CLAUDE.md` | thin pointer at AGENTS.md (single source of truth) |
| `docs/adr/` | Architecture Decision Records — decide-once, audit-forever |
| `docs/MIGRATION.md` | overlay playbook for adopting template updates in existing repos |
| `docs/INCIDENTS.md` | curated post-mortems (majors only) |
| `docs/RUNBOOK.md` | recovery recipes specific to this repo |
| `docs/OBSERVABILITY.md` | what we log/measure and where to look |
| `.ops/README.md` | incident stream schema and append rules |
| `.ops/incidents.jsonl` | machine incident stream (appears lazily; append-only; weekly-rotated) |
| `plans/QUEUE.md` | the autonomous work queue (`## Pending` = auto-merge lane) |
| `plans/archive/` | archived completed plan specs/results/logs |
| `plans/drafts/000-smoke.md` | first enrollment-proof plan for new repos |
| `TODO.md` | one-shot setup survey (deleted once setup completes) |
| `docs/ARCHITECTURE.md` | the system map agents load when entering cold |
| `SECURITY.md` | secrets doctrine + leak playbook |
| `CHANGELOG.md` | Keep-a-Changelog + the *Unchanged (intentional)* frozen-namespace section |
| `GEMINI.md` | thin pointer (every agent tool gets one; all point at AGENTS.md) |
| `.template-sync.json` | subscription anchor: which template commit this repo last synced to |
| `.gitignore` | secret/transient ignore baseline, including incident-log tracking exceptions |
| `.github/workflows/ci.yml` | advisory clean-room CI skeleton |
| `.github/pull_request_template.md` | review prompts for side effects and obligations |
| `.github/ISSUE_TEMPLATE/task.md` | triage-ready issue intake |

**Start here**
1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `plans/QUEUE.md`
4. `docs/adr/0001-design-philosophies.md`
5. `.ops/README.md`

Setup markers have two tiers: normal markers can be answered during adoption; must-answer markers
block the first plan because they define safety boundaries. Audit command:
`grep -rnE 'TODO\(setup!?\):|\{\{[A-Z0-9_]+\}\}' --exclude-dir=.git .` — zero hits = fully
configured.

Workspace context: use `docs/MIGRATION.md` when applying this living template to an existing repo.
