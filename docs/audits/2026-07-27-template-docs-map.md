# Template Documentation Entrypoints Map

**Audit Date:** 2026-07-27  
**Scope:** Additive inventory of template documentation entrypoints across root, `docs/`, `plans/`, and related directories in `repo-template`.

---

## 1. Root Documentation Entrypoints

| File | Purpose |
| --- | --- |
| `README.md` | Primary human-facing orientation and structural directory map for the repository. |
| `AGENTS.md` | Operating manual for AI agents defining commands, verify gates, autonomy rules, and risk tiers. |
| `CLAUDE.md` | Thin pointer redirecting Claude and compatible assistants to `AGENTS.md`. |
| `GEMINI.md` | Thin pointer redirecting Gemini and compatible assistants to `AGENTS.md`. |
| `CHANGELOG.md` | Record of user-visible and structural repository changes following Keep-a-Changelog and SemVer. |
| `PRIORITIES.md` | Repository-level SLI/SLO priorities and operational focus areas. |
| `SECURITY.md` | Security doctrine, vulnerability reporting procedure, and credential/secret leak playbook. |
| `TODO.md` | Setup checklist and survey for new repository adoptions (deleted once setup completes). |

---

## 2. Core `docs/` Entrypoints

| File | Purpose |
| --- | --- |
| `docs/ARCHITECTURE.md` | High-level system map and architectural overview for agents and developers entering cold. |
| `docs/INCIDENTS.md` | Curated collection of major post-mortems and incident root-cause analyses. |
| `docs/MIGRATION.md` | Step-by-step playbook for applying template updates to existing adopted repositories. |
| `docs/OBSERVABILITY.md` | Standardized metrics, logging policies, and telemetry navigation guide. |
| `docs/QUEUE-ENROLLMENT.md` | Instructions and criteria for enrolling or opting out of the autonomous work queue. |
| `docs/RUNBOOK.md` | Operational recovery recipes and troubleshooting workflows for the repository. |
| `docs/operations/README.md` | Overview and schema guide for `.ops` machine records and operational logs. |

---

## 3. Architecture Decision Records (`docs/adr/`)

| File | Purpose |
| --- | --- |
| `docs/adr/0000-template.md` | Standard template format for writing new Architecture Decision Records (ADRs). |
| `docs/adr/0001-design-philosophies.md` | Foundational design principles and architectural philosophy for the template. |
| `docs/adr/0002-verify-gate-contract.md` | Specification for the verify gate contract and execution rules. |
| `docs/adr/0003-file-format-selection.md` | Rationale for file format choices across configuration and documentation. |
| `docs/adr/0004-when-to-use-a-real-database.md` | Guidelines on database adoption versus lightweight file storage. |
| `docs/adr/0005-git-conventions.md` | Branching, commit messaging, and git workflow standards. |
| `docs/adr/0006-adoption-shell-v2-technology-decision.md` | Decision record for Pure TypeScript adoption shell v2 implementation. |

---

## 4. Plans Entrypoints (`plans/`)

| File / Path | Purpose |
| --- | --- |
| `plans/QUEUE.md` | Live autonomous work queue tracking pending and in-progress plan execution. |
| `plans/drafts/000-smoke.md` | Initial plan draft serving as enrollment proof for newly adopted repositories. |
| `plans/archive/README.md` | Explanatory guide detailing the structure and lifecycle of archived plan specifications, logs, and results. |

---

## 5. Operations & GitHub Template Entrypoints

| File / Path | Purpose |
| --- | --- |
| `.github/pull_request_template.md` | Pull request template prompting authors for side effect and safety disclosures. |
| `.github/ISSUE_TEMPLATE/task.md` | Issue template for task intake, triage, and queue preparation. |
