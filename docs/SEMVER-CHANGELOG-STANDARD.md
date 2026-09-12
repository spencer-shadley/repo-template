# Repository SemVer and Weekly Preserved Changelog Rotation Standard

This document defines the canonical repository standard for:
1. One machine-readable repository Semantic Version (`VERSION`);
2. One active root changelog (`CHANGELOG.md`);
3. Idempotent weekly archival of prior changelog content (`docs/changelogs/YYYY-Www.md`);
4. Generated validation and adoption defaults for new and existing repositories.

---

## 1. Context & Motivation

Repositories across the fleet require a single, machine-readable release version for orchestration provenance, admission gating, build artifacts, and release receipts. Without a uniform standard:
- Package files (`package.json`, etc.) often carry internal or private package versions (e.g. `0.0.0-private`) that do not reflect the repository release state.
- Monolithic `CHANGELOG.md` files grow without bound, increasing merge conflicts and cluttering active planning.
- Ad-hoc versioning schemes cause provenance inconsistencies across the fleet.

`repo-template` defines the standard, generator, validator, and projected defaults. Consuming repositories implement their own bounded adoption; Agent Orchestrator (AO) consumes `VERSION` for orchestration provenance and admission.

---

## 2. Canonical Specifications

### 2.1 Machine-Readable Repository SemVer (`VERSION`)
- **Path**: `VERSION` at the repository root.
- **Format**: Exactly one line containing a valid [SemVer 2.0.0](https://semver.org) string (e.g. `0.1.0`, `1.0.0`, `3.1.0`).
- **Encoding**: UTF-8 / ASCII text, terminated with an optional standard newline (`\n`).
- **Authority**: The single source of truth for the repository's current release version.
- **Distinction**: `VERSION` represents the repository's own release version. (In `repo-template`, `TEMPLATE_VERSION` represents the template engine version).

### 2.2 Active Root Changelog (`CHANGELOG.md`)
- **Path**: `CHANGELOG.md` at the repository root.
- **Format**: Follows [Keep a Changelog](https://keepachangelog.com).
- **Required Section**: The first `## ` heading must be `## [Unreleased]`.
- **Scope**: Contains unreleased changes under `## [Unreleased]` and active/recent cycle releases. Completed releases are periodically and idempotently archived into weekly archives.
- **Version Alignment**: When release headings exist in `CHANGELOG.md`, the highest bracketed release version must match the version declared in `VERSION`.

### 2.3 Idempotent Weekly Preserved Changelog Rotation (`docs/changelogs/YYYY-Www.md`)
- **Directory**: `docs/changelogs/`.
- **Filename Convention**: `YYYY-Www.md` using the standard ISO 8601 calendar week of the release date (e.g. `2026-W30.md`, `2026-W31.md`).
- **Archive File Structure**:
  - Top heading: `# Changelog Archive — YYYY-Www`.
  - Subheading stating the ISO week and date range: `ISO Week ww (YYYY-MM-DD to YYYY-MM-DD)`.
  - Preserved release sections (`## [X.Y.Z] - YYYY-MM-DD`) with their corresponding change categories (`### Added`, `### Changed`, etc.).
- **Idempotency Guarantee**:
  - Running changelog rotation multiple times against the same releases produces identical results (`f(f(x)) = f(x)`).
  - Existing archive files are merged without duplicating release sections or losing prior entries.
  - Running rotation when all past releases have already been archived produces zero file modifications.

---

## 3. Tooling & Automation

### 3.1 Validator (`scripts/check-semver-changelog.ts`)
Validates repository conformance against rules SVC1-SVC5:
- **SVC1**: `VERSION` file exists at repository root, is non-empty, and contains exactly one valid SemVer 2.0.0 string.
- **SVC2**: `CHANGELOG.md` file exists at repository root and begins with `## [Unreleased]`.
- **SVC3**: Highest release version matches `VERSION`.
- **SVC4**: All files in `docs/changelogs/` (excluding `.gitkeep`) match the ISO week naming pattern `YYYY-Www.md`.
- **SVC5**: Archived changelog files have valid archive headers and release entries.

Runs standalone or via `--self-test`:
```bash
node scripts/check-semver-changelog.ts --self-test
node scripts/check-semver-changelog.ts
```

### 3.2 Generator (`scripts/rotate-changelog-weekly.ts`)
Performs deterministic, idempotent rotation of completed releases from `CHANGELOG.md` into `docs/changelogs/YYYY-Www.md`:
- Computes ISO calendar week from release dates.
- Preserves active unreleased items in `CHANGELOG.md`.
- Idempotently creates or appends to weekly archive files.
- Supports `--check` (dry run / verification) and `--self-test`.

```bash
node scripts/rotate-changelog-weekly.ts --self-test
node scripts/rotate-changelog-weekly.ts
```

---

## 4. Adoption Guidance

- **New repositories**: Adopt `VERSION` initialized to `0.1.0` (or `1.0.0`), an active `CHANGELOG.md` with `## [Unreleased]`, and `docs/changelogs/` for weekly rotations.
- **Existing repositories**: Add `VERSION` containing the current release version, verify `CHANGELOG.md` alignment with `scripts/check-semver-changelog.ts`, and rotate legacy releases with `scripts/rotate-changelog-weekly.ts`.
