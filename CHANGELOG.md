# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Maintained at merge time (post-merge
obligations, ADR-0001 §8) — one entry per user-visible or structural change.

## [Unreleased]

### Added
<!-- new capabilities or files -->
- `scripts/lint-user-surface-leaks.mjs` plus `.user-surface-lint.json`, a deterministic
  user-facing string lint for env-var names, infra/operator wording, host paths, and detectable
  internal-error passthroughs. The gate cites the CEO-ratified no-developer-leakage doctrine from
  agent-orchestrator `docs/DOCTRINE.md` §12 and no-ops loudly when a repo commits empty include
  globs. MINOR.

### Changed
<!-- behavior changes; breaking ones marked **BREAKING** -->
- Ignored precise orchestrator runtime state so dirty-tree preflight no longer wedges scheduled
  drains, while keeping durable `.ops/incidents.jsonl` evidence tracked. PATCH.

### Unchanged (intentional — frozen)
<!-- Things a reader might EXPECT to have changed but which are deliberately frozen (legacy
     namespaces, DB identities, vendored code). Recording these prevents future agents from
     "fixing" them. -->

## [2.4.0] - 2026-07-12

### Added
<!-- new capabilities or files -->
- `model-boundary.json` as a copied, fail-closed declaration for model-backed capabilities,
  canonical gateway/adapter ownership, provider-specific exception paths, owning role, and serving
  provenance. AGENTS, README, architecture, runbook, setup, and template self-checks now document
  the CEO invariant: roles choose capabilities, never sacred providers. MINOR.
- AGENTS.md gains two required steering sections: `## Responsibilities & non-goals` and
  `## Product principles` (both `TODO(setup!)`-gated), plus a progressive-disclosure preamble
  (what the file is, where deeper docs live, move oversized sections to `docs/` with a summary +
  link). Motivated by the 2026-07-09 steering-docs audit: adopted repos (task-dag, gmail-markdown)
  carried product principles only in tool memory, violating doctrine-lives-in-repo. MINOR.

### Changed
<!-- behavior changes; breaking ones marked **BREAKING** -->
- Tightened the template verify gate to scan JSONL incident logs for conflict markers while allowing
  rotated `.ops/archive/` incident logs to remain outside the manifest.
- Hardened the template self verify gate to fail on conflict-marker matches and grep execution
  errors without relying on `set -e`, while ignoring generated `plans/` queue artifacts in manifest
  enforcement.
- Documented the tracked `.ops/incidents.jsonl` drain policy: sole dirty auto-appends are committed
  as `ops: incidents (auto)` before drain proceeds, motivated by incident fingerprint
  `43efffab9ecedf82`.
- Re-ignored `.ops/critic/*.md` (failed pre-enqueue plan-critic verdicts, per
  `agent-orchestrator/lib/artifacts.mjs`) after the broad `.ops/**` re-include, so failed critic runs
  stay useful local diagnostics without dirtying or wedging scheduled drains; tracked incident logs
  and `plans/*.critic.md` remain unaffected. Motivated by an observed queue-abort-dirty instance of
  this class in this repo and in newly adopted `model-router`.
- Ported the template self verify gate's conflict-marker scan into the existing Node manifest check,
  preserving marker coverage while removing bash/grep exit-code dependence. PATCH.

### Unchanged (intentional — frozen)
<!-- Things a reader might EXPECT to have changed but which are deliberately frozen (legacy
     namespaces, DB identities, vendored code). Recording these prevents future agents from
     "fixing" them. -->

## [2.3.0] - 2026-07-02

### Changed
- Documented canary-first rollout order for MAJOR template upgrades, including canary
  re-validation, a concrete green observation window, migration-incident attribution, and the red
  failure path.

## [2.2.0] - 2026-07-02

### Added
- `docs/QUEUE-ENROLLMENT.md`; enrollment near-mandated.

## [2.1.0] - 2026-07-02

### Added
- `docs/MIGRATION.md` as the overlay playbook for migrating existing repos onto the template.
- README entry and workspace-context pointer for the migration playbook.

## [2.0.0] - 2026-07-02

### Added
- `template-manifest.json` as the structural sync manifest consumed by the template gate and
  future migration tooling.

### Changed
- **BREAKING:** Setup markers now have normal and must-answer tiers, and the audit convention
  requires canonical colon syntax.
- **BREAKING:** TODO.md is now only for out-of-tree adoption actions; in-tree setup markers are
  audited directly instead of mirrored.
- **BREAKING:** Template placeholders are standardized on `{{UPPER_SNAKE_0_9}}`.
- **BREAKING:** AGENTS.md now carries instantiated verify-gate placeholders instead of web-app-only
  validation claims.

## [1.1.0] - 2026-07-02

### Added
- Authoritative-verification-tool declaration + done-report convention in AGENTS.md (from task-dag)
- ADR-0005: read-only agents use mirrors, never the live checkout (from agent-review)

## [1.0.0] - 2026-07-02

### Added
- Initial living standard: ADRs 0000-0005 (design-philosophy survey, verify-gate contract, file-format doctrine, storage ladder, git conventions), docs/{ARCHITECTURE,RUNBOOK,OBSERVABILITY,INCIDENTS-stub}, .ops incident standard, plans/ queue scaffold, SECURITY.md leak playbook, CHANGELOG w/ Unchanged-(intentional) convention, GEMINI.md every-tool pointer, triage-ready issue template, advisory-CI skeleton, setup-marker audit convention, .template-sync.json subscription anchor, TEMPLATE_VERSION semver.
