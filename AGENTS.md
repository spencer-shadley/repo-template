<!-- TEMPLATE-SELF — rules for working on repo-template ITSELF. adopt-project STRIPS this block

## Mission

Define, validate, version, and publish the portable repository structure and contracts used to
create and adopt fleet repositories.

## Responsibilities

- Own generic template files, portable repository semantics, manifests, and setup placeholders.
- Own versioned adoption-shell contracts, deterministic materialization, release artifacts, and migration guidance.
- Own template self-verification, conformance fixtures, and structural semver policy.
- Turn proven fleet-wide repository lessons into portable defaults without rewriting consumers directly.

## Non-responsibilities

- Does not own a consumer repository's product-specific mission, acceptance criteria, or local source.
- Does not create, relocate, register, schedule, activate, or deploy repositories.
- Does not own Fleet Registry identity facts or Repo Factory lifecycle/effect transactions.
- Does not mutate existing consumers merely because the template evolves.

## Current status / readiness

Current readiness is established by `README.md`, current plans and statuses, and current verified release or operational evidence; this charter states durable ownership, not completion.

     (and resets plans/ + deletes any .ops data) when instantiating a new repo. -->
# THIS repo: the living template (meta-rules)

> **Source of truth (workspace constitution):** `C:\code\AGENTS.md` — [Agent Constitution](../../../AGENTS.md).
> Fleet always-on law and progressive-disclosure index. Nested git roots may stop ancestral walk — resolve this path explicitly.
> Rules in *this* file win only for charter/stack/risk inside this directory tree.
> **Priorities / SLI / SLO:** [PRIORITIES.md](./PRIORITIES.md) (inherits fleet `C:\code\PRIORITIES.md`).

This repo IS the workspace standard. Everything below the `/TEMPLATE-SELF` marker is CONTENT copied
into new repos — `{{PLACEHOLDERS}}` and `TODO(setup):` markers there are INTENTIONAL; never "fix"
them when working on this repo.

- **Queue project, auto-tier** (docs/config only): changes flow issue → triage → plan → loop →
  auto-merge. Enrollment is `projects.json` membership. **Claim Pending SoT** is the issue/plan
  DAG (`WorkProjectionV1`). Do **not** recreate `plans/QUEUE.md` — that path is a forbidden
  tombstone. Instantiation must not ship a QUEUE file.
- **Verify gate for THIS repo:**
  ```
  corepack_bin=corepack
  if command -v corepack.cmd >/dev/null 2>&1; then corepack_bin=corepack.cmd; fi
  "$corepack_bin" pnpm install --frozen-lockfile --ignore-scripts
  "$corepack_bin" pnpm verify
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

## Mission

{{ONE_LINE_DESCRIPTION}} <!-- TODO(setup!): one durable outcome, stated without implementation or model identity. -->

## Responsibilities

{{RESPONSIBILITIES}} <!-- TODO(setup!): what this repo owns; one short paragraph or 2-4 bullets. -->

## Non-responsibilities

{{NON_GOALS}} <!-- TODO(setup!): adjacent authority this repo must not absorb. -->

## Current status / readiness

<!-- TODO(setup!): point to the current evidence that establishes commissioning/readiness. Durable
responsibility is not a claim that implementation is complete. -->

> **Source of truth (workspace constitution):** `C:\code\AGENTS.md` — [Agent Constitution](../AGENTS.md).
> Fleet always-on law and progressive-disclosure index. Resolve the correct relative root path during adoption.
> Rules in *this* file win only for charter/stack/risk inside this directory tree.
> **Priorities / SLI / SLO:** [PRIORITIES.md](./PRIORITIES.md) (inherits fleet `C:\code\PRIORITIES.md`).

> **What this file is:** the operating manual every agent loads first — responsibilities,
> principles, commands, gates, flows, autonomy. Deeper context lives one hop away:
> `docs/ARCHITECTURE.md` (system map), `docs/adr/` (decisions), `docs/RUNBOOK.md` (recovery),
> `README.md` (human-facing orientation). **Progressive disclosure:** keep each section here
> summary-sized; when one outgrows roughly a screen, move the detail to its own file under `docs/`
> and leave a two-line summary + link here.

This repo is queue-enrolled (see docs/QUEUE-ENROLLMENT.md). Effectful, shared-authority, and
non-trivial changes use the governed lane; qualifying direct-L0 work uses the fast path below.
<!-- TODO(setup): confirm enrollment happened (agent-orchestrator/projects.json, Windmill drain
schedule, watchlist.tsv) — see docs/QUEUE-ENROLLMENT.md. -->

**Stack:** {{STACK}}.
**Package manager:** {{PACKAGE_MANAGER}}. **Data/migrations:** {{DB_AND_MIGRATIONS}}.
**E2E:** {{E2E}}. **Deploy:** {{DEPLOY}}.

## Quality lint (required bootstrap)

**Bootstrap is incomplete without the fleet quality lint gate** ([docs/QUALITY-LINT.md](./docs/QUALITY-LINT.md)).

Every new or adopted repo MUST ship:

1. `@spencer-shadley/repo-quality` from the template Git source (the kit owns `qualityRules()` and its ESLint plugins)
2. `eslint.config.ts` that imports and spreads `qualityRules()` from the kit
3. `package.json` `"lint": "eslint ."` and a `verify` script that runs lint
4. Grandfathered debt only via `eslint-suppressions.json` (`eslint . --suppress-all`) — new violations fail closed

Presence check: `node scripts/verify-quality-lint-required.ts`. Small files are not optional.

## Direct L0 fast path

The repo manager may directly write, commit, and land simple reversible repo-contained source,
tests, fixtures, deterministic fakes, local builds, and generated artifacts without a plan, queue
entry, pull request, preregistration, external critic, or full-suite ceremony. Use only the
affected deterministic checks that materially reduce risk, then preserve one lightweight immutable
receipt naming the exact landed bytes, checks/results, no-effect assertion, and rollback ref.

Direct L0 is forbidden when the transaction uses credentials; causes provider, network, GitHub, or
other external mutation beyond the repo-local git landing; changes registration or recurring
schedules; deploys to production; performs an irreversible migration; transfers shared
writer/effect authority; or cuts over a capability. Split those effects into their governed
transaction. An applicable failed check or actual negative review blocks the candidate bytes.

Persistent goals are disabled for autonomous repo managers and coordinators until native
pre-injection guards exist. A bounded heartbeat wakes exactly one finite deliverable; a paused or
no-progress manager stops and never self-requeues.

At every poll, the coordinator consumes AO's typed `GoalContinuationDecisionV1` contract to contain
unsafe continuation; the overseer independently consumes the same contract at incident cadence and
corrects missed containment. This template does not duplicate AO's detector or implementation.
**Repo-manager/coordinator model admission is governed by the current Model Router policy release.**
Portable repository law does not enumerate concrete model identities; bounded mechanical substeps
must still satisfy the routed capability/admission policy for their assigned work.

## Binding steer

Every interactive or autonomous agent operating in this repository, including discovery, triage,
review, implementation, and supervision agents, must read and obey the Mission, Responsibilities,
Non-responsibilities, Current status / readiness, and Product principles sections before acting.

A technically correct change that violates a ratified product principle is a defect. Work beyond a
ratified non-goal is rejected with the charter citation. Findings, issues, reviews, implementation
reports, and PR descriptions cite every applicable principle by its exact `P<X>.<Y>` identifier.

## Product principles

Principles use one and only one schema. Every principle has a unique `P<X>.<Y>` identifier, where X
and Y are non-negative integers compared numerically, not lexically. Lower X wins; when X ties,
lower Y wins. `P0.1` is the strongest reserved position, and adding or moving anything ahead of it
requires CEO sign-off.

Suggested classes are guidance: P0 existential invariants, P1 safety/destruction invariants, P2
governance/platform integrity, P3 product guarantees, and P4 convenience/speculation. Every
principle has a durable `SLI:` definition and a tunable `SLO:` target; `report-only` is valid while
baselining. An SLO breach is a defect tagged with the exact principle identifier.

{{PRODUCT_PRINCIPLES}}  <!-- TODO(setup!): the 2-5 ratified principles that steer every feature,
prompt, and review in this repo, each with identifier, SLI, SLO, decider, and decision date (e.g.
task-dag's "the AI never moralizes about, warns against, or deprioritizes user tasks";
gmail-markdown's "the draft is sacred / fail open"). Added as a required section fleet-wide
2026-07-09 after a steering-docs audit found adopted repos carrying these only in tool memory —
doctrine lives in the repo. -->

## Model boundary

Model roles choose capabilities, never sacred providers. Provider-specific code may live only in
the adapter, catalog, configuration, fixture, or history paths declared in `model-boundary.json`;
business logic must route through the declared gateway or adapter registry and remain
provider-neutral. Every model-backed flow must retain serving provenance so audits can reconstruct
which provider/model served a request, even though selection is interchangeable.

During setup, answer these without naming a sacred default model:
- Does this repo have model-backed flows? If yes, list the user-facing capabilities they serve.
- Does it consume the fleet gateway, or does it own an application-specific adapter registry?
- Which capability, latency, privacy, cost, offline, or independence constraints affect routing?
- Which provider-specific adapter/catalog/config paths are legitimate, and which role owns them?

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

Run `node scripts/lint-user-surface-leaks.ts --config .user-surface-lint.json` in the verify gate
for repos with user-facing screens or response messages. Keep `.user-surface-lint.json` explicit:
empty `include` globs are a committed no-user-surface choice and print a no-op notice.

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

{{AUTONOMY_POLICY}}  <!-- TODO(setup!): fully-autonomous | risk-tiered (per-plan auto/human) | human-approval. If not fully-autonomous, list the triggers that force `human` (deletion, one-way/irreversible, live-service risk, major changes) and note that the auto-merge claim lane holds ONLY auto-tier plans. Do not recreate plans/QUEUE.md. -->
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
`.ops/README.md`.

Drain policy: if orchestrator automation appended `.ops/incidents.jsonl` and that is the only
dirty file blocking a drain, the drain must commit it before proceeding with the exact commit subject
`ops: incidents (auto)`. This keeps the active log tracked without letting auto-appends wedge the
queue. This policy is motivated by incident fingerprint `43efffab9ecedf82` (repeated abort-dirty
drains).

Discovery agents read the current+previous week for recurring-failure patterns and auto-file
`pattern:` issues — a good record here becomes an automatic fix. If the file is absent, there have
simply been no incidents yet.
