<!-- TEMPLATE-SELF — rules for working on repo-template ITSELF. adopt-project STRIPS this block
     (and resets plans/ + deletes any .ops data) when instantiating a new repo. -->
# THIS repo: the living template (meta-rules)

This repo IS the workspace standard. Everything below the `/TEMPLATE-SELF` marker is CONTENT copied
into new repos — `{{PLACEHOLDERS}}` and `TODO(setup):` markers there are INTENTIONAL; never "fix"
them when working on this repo.

- **Queue project, auto-tier** (docs/config only): changes flow issue → triage → plan → loop →
  auto-merge. `plans/QUEUE.md` here is this repo's LIVE queue; instantiation resets it.
- **Verify gate for THIS repo:**
  ```bash
  ! grep -rn '<<<<<<<' --include='*.md' --include='*.yml' .
  for f in README.md AGENTS.md CLAUDE.md TODO.md SECURITY.md .gitignore plans/QUEUE.md docs/ARCHITECTURE.md docs/adr/0001-design-philosophies.md docs/adr/0005-git-conventions.md; do [ -f "$f" ] || { echo "missing $f"; exit 1; }; done
  ```
- **Change discipline:** every structural change states WHICH fleet learning/incident motivates it
  (ADRs cite evidence); user-facing additions get README-table + TODO.md entries.
- **Versioning (semver for STRUCTURE):** every merged change updates CHANGELOG [Unreleased]. Bumps:
  MAJOR = breaking (file moved/removed/renamed, schema change, rule reversal in an accepted ADR) —
  repos MUST migrate; MINOR = additive structure (new file/section/ADR/survey question) — repos
  SHOULD adopt; PATCH = wording/clarity — no migration, silent pickup. A release = set
  TEMPLATE_VERSION + move [Unreleased] under a version heading + git tag vX.Y.Z (same commit).
- **Sync duty (living-template doctrine):** when structure changes, verify the adopt-project
  skill's instructions still match; flag drift in the plan/PR.
<!-- /TEMPLATE-SELF -->

# {{NAME}} — Agent Rules

{{ONE_LINE_DESCRIPTION}}. The root `../AGENTS.md` (Codex handoff protocol) also applies;
rules here take precedence on any conflict.

**Stack:** {{STACK}}.
**Package manager:** {{PACKAGE_MANAGER}}. **Data/migrations:** {{DB_AND_MIGRATIONS}}.
**E2E:** {{E2E}}. **Deploy:** {{DEPLOY}}.

## Commands

- **Dev:** `{{DEV_CMD}}`
- **Build:** `{{BUILD_CMD}}`
- **Lint:** `{{LINT_CMD}}`
- **Typecheck:** `{{TYPECHECK_CMD}}`
- **Test:** `{{TEST_CMD}}`
- **E2E:** `{{E2E_CMD}}`
- **Migrations:** `{{MIGRATE_CMD}}`  <!-- omit if no DB -->

## Validation policy

**Authoritative verification tool:** {{VISUAL_VERIFICATION_TOOL}} <!-- TODO(setup): e.g. "Playwright — never a raw dev server or preview MCP" (task-dag convention). Declaring ONE authoritative tool stops agents substituting weaker checks. -->

**Done-report convention:** when reporting a change complete, state WHAT validation ran and the
deploy state (e.g. "lint+test+e2e green; docker app rebuilt/redeployed: yes/no") — reviewers and
future agents rely on this line.

Run validation appropriate to the change size; at minimum `lint`, `typecheck`, and `test` must pass
before a change is "done". Run `e2e` when touching routes, UI, or runtime behavior. The verify gate
rebuilds + redeploys, smokes `/health`, and runs e2e against the deployed server.

{{QUALITY_GATE_NOTES}}  <!-- e.g. eslint.quality limits + suppressions baseline; or <FILL> -->

## Core user flows

{{CORE_FLOWS}}  <!-- the handful of flows that define the app; from the adoption interview -->

## External services & constraints

{{EXTERNAL_SERVICES}}  <!-- each API + its rate-limit/cost/auth rules agents must respect; or "none" -->

## Infra namespace (frozen — never auto-rename)

These bind to persisted data / external tools and are deliberately decoupled from the repo name.
Renaming orphans data. Chosen distinct from every other workspace project:

- **DB / connection:** {{DB_NAME}}
- **Docker:** compose project `{{COMPOSE_PROJECT}}`, volume(s) `{{VOLUMES}}`, network `{{NETWORK}}`
- **Ports:** dev `{{DEV_PORT}}`, preview `{{PREVIEW_PORT}}`, health/e2e `{{E2E_PORT}}`
- **Browser storage key(s):** {{STORAGE_KEYS}}  <!-- or "n/a" -->

## Telemetry

Interaction events + queryable error telemetry via `{{EMIT_HELPER}}`; events follow `surface.action`
with documented payloads; stored in {{TELEMETRY_SINK}}, queried via `{{TELEMETRY_QUERY}}`. Never log
sensitive user content — event names + non-PII metadata only. New user-facing flows ship with their
interaction events.

## Onboarding / docs to keep in sync

- **In-app tutorial surface:** {{TUTORIAL_SURFACE}}  <!-- update it when flows/interactions change -->
- **CHANGELOG.md:** AI-maintained — update it when a plan changes user-facing behavior.
{{DESIGN_SYNC_RULE}}  <!-- if it has a synced design system: rebuild bundle + re-sync on token/component change; else omit -->

## Autonomy policy

{{AUTONOMY_POLICY}}  <!-- fully-autonomous | risk-tiered (per-plan auto/human) | human-approval. If not fully-autonomous, list the triggers that force `human` (deletion, one-way/irreversible, live-service risk, major changes) and note that QUEUE.md ## Pending holds ONLY auto-tier plans. -->
Default Effort for plans: **{{DEFAULT_EFFORT}}**.

## Incident log (`.ops/incidents.jsonl`)

This repo keeps an append-only JSONL incident log at `.ops/incidents.jsonl`, rotated weekly into
`.ops/archive/` and **tracked in git** (append-only; never rewrite or delete entries). The
orchestrator's machinery (run-loop stalls, drain aborts/wedges, breaker trips, anomaly detections)
appends automatically. Agents and humans append manually when they hit or fix an operational
incident here:

```bash
node agent-orchestrator/lib/incident-log.mjs <project> '{"kind":"env","summary":"...","fix":"PR #N"}'
```

Schema per line: `ts, repo, source, severity, kind (stall|wedge|phantom|env|notify|push-race|
double-run|ci-red|other), plan?, summary, rootCause?, fix?, evidence?, fingerprint`. Discovery
agents read the current+previous week for recurring-failure patterns and auto-file `pattern:`
issues — a good record here becomes an automatic fix. If the file is absent, there have simply
been no incidents yet.
