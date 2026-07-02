# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Maintained at merge time (post-merge
obligations, ADR-0001 §8) — one entry per user-visible or structural change.

## [Unreleased]

## [1.1.0] - 2026-07-02

### Added
- Authoritative-verification-tool declaration + done-report convention in AGENTS.md (from task-dag)
- ADR-0005: read-only agents use mirrors, never the live checkout (from agent-review)

## [1.0.0] - 2026-07-02

### Added
- Initial living standard: ADRs 0000-0005 (design-philosophy survey, verify-gate contract, file-format doctrine, storage ladder, git conventions), docs/{ARCHITECTURE,RUNBOOK,OBSERVABILITY,INCIDENTS-stub}, .ops incident standard, plans/ queue scaffold, SECURITY.md leak playbook, CHANGELOG w/ Unchanged-(intentional) convention, GEMINI.md every-tool pointer, triage-ready issue template, advisory-CI skeleton, TODO(setup) audit convention, .template-sync.json subscription anchor, TEMPLATE_VERSION semver.

### Changed
<!-- behavior changes; breaking ones marked **BREAKING** -->

### Unchanged (intentional — frozen)
<!-- Things a reader might EXPECT to have changed but which are deliberately frozen (legacy
     namespaces, DB identities, vendored code). Recording these prevents future agents from
     "fixing" them. (Convention from task-dag's rename: repo renamed, DB identity frozen.) -->
