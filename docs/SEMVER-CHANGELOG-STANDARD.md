# Repository SemVer and Weekly Changelog Rotation Standard

This document defines the canonical repository standard for machine-readable repository Semantic Versioning (`VERSION`), active changelog maintenance (`CHANGELOG.md`), weekly preserved changelog rotation (`docs/changelogs/YYYY-Www.md`), and automated validation hooks.

## 1. Context and Current State Survey

### 1.1 Existing Artifacts in `repo-template`
Prior to Issue 90, `repo-template` contained several versioning and logging artifacts with distinct scopes:

- **`TEMPLATE_VERSION`**: A root file containing `2.6.0` representing the version of the template generator engine itself (classified `"self"` in `template-manifest.json`).
- **`package.json`**: Package configuration declaring `"version": "0.0.0-private"` for `@repo-template/adoption-shell`.
- **`CHANGELOG.md`**: A monolithic root changelog following [Keep a Changelog](https://keepachangelog.com) format, updated at merge time per ADR-0001 §8.
- **`.ops/` Machine Records**: Event and incident logs organized in weekly archive files (e.g. `.ops/archive/incidents-2026-W29.jsonl`), demonstrating a precedent for ISO-week bucketed historical logs.

### 1.2 Identified Deficiencies
1. **No Single Machine-Readable Repo SemVer**: Automated tools, release scripts, and orchestrators (such as Agent Orchestrator) lacked a single standardized `VERSION` file to determine the repository's current release version.
2. **Changelog Unbounded Growth**: Monolithic `CHANGELOG.md` grows indefinitely over time, increasing merge conflicts for active development.
3. **Lack of Automated Conformance Validation**: No lightweight validator hook existed to verify version formatting and changelog structure.

---

## 2. Canonical Specification

### 2.1 Single Machine-Readable Repository SemVer (`VERSION`)
- **File Path**: `VERSION` at repository root.
- **Format**: Exactly one line containing a valid [SemVer 2.0.0](https://semver.org) string (e.g., `0.1.0` or `1.2.3-alpha.1`). Trailing newline allowed.
- **Authority**: Primary single source of truth for the repository's release version, consumed by release receipts, build scripts, and Agent Orchestrator admission.
- **Manifest Mode**: `"merge"` for consumer repositories.
- **Distinction**: `VERSION` represents the *repository's own version*, whereas `TEMPLATE_VERSION` represents the *upstream template engine version*.

### 2.2 Active Root Changelog (`CHANGELOG.md`)
- **File Path**: `CHANGELOG.md` at repository root.
- **Format**: [Keep a Changelog](https://keepachangelog.com) markdown format.
- **Required Section**: Must contain a top-level `## [Unreleased]` section for unreleased changes.
- **Scope**: Contains unreleased items and active/recent cycle releases. Historical releases are periodically rotated into weekly archives.
- **Manifest Mode**: `"merge"`.

### 2.3 Weekly Idempotent Changelog Rotation (`docs/changelogs/YYYY-Www.md`)
- **Path Pattern**: `docs/changelogs/YYYY-Www.md` (e.g. `docs/changelogs/2026-W30.md`), using standard ISO 8601 calendar week numbers.
- **Rotation Workflow**:
  - During weekly automated maintenance or release cadence, entries from `CHANGELOG.md` for completed releases in that week are appended to `docs/changelogs/YYYY-Www.md`.
  - The root `CHANGELOG.md` retains the `## [Unreleased]` header and recent context while remaining concise.
- **Idempotency**: Running rotation multiple times for the same week produces identical archive files without duplicating entries.
- **Manifest Mode**: `"copy"`.

### 2.4 Validator Hook Specification (`scripts/validate-semver-changelog.mjs`)
- **Execution**: Can be run locally via `node scripts/validate-semver-changelog.mjs` or as part of `pnpm verify:self`.
- **Validation Rules**:
  1. `VERSION` file exists, is non-empty, and strictly matches standard SemVer 2.0.0 regex:
     `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?\s*$`
  2. `CHANGELOG.md` file exists and contains `## [Unreleased]`.
  3. All archived changelog files under `docs/changelogs/` conform to the `YYYY-Www.md` naming convention.

---

## 3. Adoption Plan & Migration Rationale

- **Non-Breaking Guarantee**: Existing consumer repositories continue to operate without breaking changes. Adoption of `VERSION` and `docs/changelogs/` is additive.
- **Template Manifest Classification**:
  - `VERSION`: `"merge"`
  - `docs/SEMVER-CHANGELOG-STANDARD.md`: `"copy"`
  - `scripts/validate-semver-changelog.mjs`: `"copy"`
  - `docs/changelogs/*.md`: `"copy"`
