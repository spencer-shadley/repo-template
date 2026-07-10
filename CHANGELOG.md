# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Maintained at merge time (post-merge
obligations, ADR-0001 §8) — one entry per user-visible or structural change.

## [Unreleased]

### Added
<!-- new capabilities or files -->
- AGENTS.md gains two required steering sections: `## Responsibilities & non-goals` and
  `## Product principles` (both `TODO(setup!)`-gated), plus a progressive-disclosure preamble
  (what the file is, where deeper docs live, move oversized sections to `docs/` with a summary +
  link). Motivated by the 2026-07-09 steering-docs audit: adopted repos (task-dag, gmail-markdown)
  carried product principles only in tool memory, violating doctrine-lives-in-repo. MINOR.

### Changed
<!-- behavior changes; breaking ones marked **BREAKING** -->
- Documented canary-first rollout order for MAJOR template upgrades.
- Tightened the template verify gate to scan JSONL incident logs for conflict markers while allowing
  rotated `.ops/archive/` incident logs to remain outside the manifest.
- Hardened the template self verify gate to fail on conflict-marker matches and grep execution
  errors without relying on `set -e`, while ignoring generated `plans/` queue artifacts in manifest
  enforcement.
- Documented the tracked `.ops/incidents.jsonl` drain policy: sole dirty auto-appends are committed
  as `ops: incidents (auto)` before drain proceeds, motivated by incident fingerprint
  `43efffab9ecedf82`.

### Unchanged (intentional — frozen)
<!-- Things a reader might EXPECT to have changed but which are deliberately frozen (legacy
     namespaces, DB identities, vendored code). Recording these prevents future agents from
     "fixing" them. -->

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
