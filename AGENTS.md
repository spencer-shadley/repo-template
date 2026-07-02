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
  ! grep -rn '<''<<<<<<' --include='*.md' --include='*.yml' --include='*.json' --include='TEMPLATE_VERSION' .
  node -e "const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const {execSync}=require('child_process');const tracked=execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>`${k}:${v}`);if(missing.length||invalid.length){if(missing.length)console.error('unmanifested:',missing);if(invalid.length)console.error('invalid manifest modes:',invalid);process.exit(1)}"
  ```
- **Change discipline:** every structural change states WHICH fleet learning/incident motivates it
  (ADRs cite evidence); user-facing additions get README-table entries and setup markers when
  adoption needs a human answer.
- **Versioning (semver for STRUCTURE):** every merged change updates CHANGELOG [Unreleased]. Bumps:
  MAJOR = breaking (file moved/removed/renamed, schema change, rule reversal in an accepted ADR) —
  repos MUST migrate; MINOR = additive structure (new file/section/ADR/survey question) — repos
  SHOULD adopt; PATCH = wording/clarity — no migration, silent pickup. A release = set
  TEMPLATE_VERSION + move [Unreleased] under a version heading + git tag vX.Y.Z (same commit).
  MAJOR upgrades follow the canary-first rollout order in `docs/MIGRATION.md`.
- **Sync duty (living-template doctrine):** when structure changes, verify the adopt-project
  skill's instructions still match; flag drift in the plan/PR.
<!-- /TEMPLATE-SELF -->

# {{NAME}} — Agent Rules

{{ONE_LINE_DESCRIPTION}}. The root `../AGENTS.md` (Codex handoff protocol) also applies;
rules here take precedence on any conflict.

This repo is queue-enrolled (see docs/QUEUE-ENROLLMENT.md); source changes go through the plan
queue. <!-- TODO(setup): confirm enrollment happened (agent-orchestrator/projects.json, Windmill
drain schedule, watchlist.tsv) — see docs/QUEUE-ENROLLMENT.md. -->

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

**Authoritative verification tool:** {{VISUAL_VERIFICATION_TOOL}} <!-- TODO(setup!): choose the strongest verifier for this stack, or n/a for docs/config-only repos. Example: "Playwright — never a raw dev server or preview MCP" (task-dag convention). Declaring ONE authoritative tool stops agents substituting weaker checks. -->

**Done-report convention:** when reporting a change complete, state WHAT validation ran and the
deploy state (e.g. "lint+test+e2e green; docker app rebuilt/redeployed: yes/no") — reviewers and
future agents rely on this line.

Run validation appropriate to the change size; every command listed above that exists for this
stack must pass before a change is "done". Run the stack's runtime/UI verifier when touching routes,
UI, or runtime behavior.

{{VERIFY_GATE_SHAPE}}  <!-- TODO(setup!): describe the gate shape for this repo. Web-app example: lint/typecheck/test/build, then rebuild + redeploy, smoke /health, and run e2e against the deployed server. -->

{{QUALITY_GATE_NOTES}}  <!-- e.g. eslint.quality limits + suppressions baseline; or n/a -->

## Verify gate

```bash
{{VERIFY_GATE_CMD}}
```

<!-- TODO(setup!): replace with the exact merge-blocking gate. It must validate every artifact type
     this repo contains and follow docs/adr/0002-verify-gate-contract.md. -->

## Core user flows

{{CORE_FLOWS}}  <!-- the handful of flows that define the app; from the adoption interview -->

## External services & constraints

{{EXTERNAL_SERVICES}}  <!-- each API + its rate-limit/cost/auth rules agents must respect; or "none" -->

## Infra namespace (frozen — never auto-rename)

These bind to persisted data / external tools and are deliberately decoupled from the repo name.
Renaming orphans data. Chosen distinct from every other workspace project:
<!-- TODO(setup!): fill all entries below, or mark the whole section n/a — omit for this stack. -->

- **DB / connection:** {{DB_NAME}}
- **Docker:** compose project `{{COMPOSE_PROJECT}}`, volume(s) `{{VOLUMES}}`, network `{{NETWORK}}`
- **Ports:** dev `{{DEV_PORT}}`, preview `{{PREVIEW_PORT}}`, health/e2e `{{E2E_PORT}}`
- **Browser storage key(s):** {{STORAGE_KEYS}}  <!-- or "n/a" -->

## Telemetry

Interaction events + queryable error telemetry via `{{EMIT_HELPER}}`; events follow `surface.action`
with documented payloads; stored in {{TELEMETRY_SINK}}, queried via `{{TELEMETRY_QUERY}}`. Never log
sensitive user content — event names + non-PII metadata only. New user-facing flows ship with their
interaction events.
<!-- TODO(setup): document this, or n/a — omit for this stack. -->

## Onboarding / docs to keep in sync

- **In-app tutorial surface:** {{TUTORIAL_SURFACE}}  <!-- TODO(setup): update it when flows/interactions change, or n/a — omit for this stack -->
- **CHANGELOG.md:** AI-maintained — update it when a plan changes user-facing behavior.
{{DESIGN_SYNC_RULE}}  <!-- TODO(setup): if it has a synced design system, rebuild bundle + re-sync on token/component change; else n/a — omit for this stack -->

## Autonomy policy

{{AUTONOMY_POLICY}}  <!-- TODO(setup!): fully-autonomous | risk-tiered (per-plan auto/human) | human-approval. If not fully-autonomous, list the triggers that force `human` (deletion, one-way/irreversible, live-service risk, major changes) and note that QUEUE.md ## Pending holds ONLY auto-tier plans. -->
Default Effort for plans: **{{DEFAULT_EFFORT}}**. <!-- TODO(setup!): Pick by cost-vs-first-attempt-quality: `low` = docs/config repos and repos with cheap, fast verify gates (retries are cheap); `medium` = product repos (default starting point); `high` = only where a failed first attempt is expensive (long verify gates like e2e suites, e.g. 30+ min). The ladder auto-escalates per plan regardless; this sets the FLOOR. Repo priority offsets may modulate this in future (orchestrator #171). -->

## Incident log (`.ops/incidents.jsonl`)

This repo keeps an append-only JSONL incident log at `.ops/incidents.jsonl`, rotated weekly into
`.ops/archive/` and **tracked in git** (append-only; never rewrite or delete entries). The
orchestrator's machinery (run-loop stalls, drain aborts/wedges, breaker trips, anomaly detections)
appends automatically. Agents and humans append manually when they hit or fix an operational
incident here:

```bash
node ../agent-orchestrator/lib/incident-log.mjs <project> '{"kind":"env","summary":"...","fix":"PR #N"}'
```

The helper ships with orchestrator plan 058 — until it lands, append the JSON line by hand.
This assumes the standard sibling layout under `C:\code`; read-only mirrors may not have
`../agent-orchestrator`, so inspect the JSONL directly there. Schema is documented in
`.ops/README.md`. Discovery agents read the current+previous week for recurring-failure patterns
and auto-file `pattern:` issues — a good record here becomes an automatic fix. If the file is
absent, there have simply been no incidents yet.
