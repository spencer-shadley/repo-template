# Proposal Plan: Standardize Canonical Repository SemVer and Weekly Preserved Changelog Rotation

**Issue Link**: #90
**Author**: Antigravity Flash-tier Implementer
**Status**: Proposal / Additive Survey Only

## Goal

Establish the canonical repository standard for:
1. One machine-readable repository SemVer file (`VERSION`);
2. One active `CHANGELOG.md`;
3. Idempotent weekly archival of prior changelog content (`docs/changelogs/YYYY-Www.md`);
4. Generated validation and adoption defaults for new and existing repositories.

## Survey of Existing Template State

- **`TEMPLATE_VERSION`**: Monitored as a `"self"` manifest artifact containing `2.6.0` representing template generator versioning.
- **`package.json`**: Holds package-level internal version `"version": "0.0.0-private"`.
- **`CHANGELOG.md`**: Single monolithic root file following Keep a Changelog.
- **`.ops/archive/`**: Establishes ISO-week (`YYYY-Www`) file naming precedent across the fleet.

## Proposed Additive Standard

1. **`VERSION`**: Single ASCII line at root containing strict SemVer 2.0.0 (e.g. `0.1.0`). Classified `"merge"` in manifest.
2. **`CHANGELOG.md`**: Active root file containing `## [Unreleased]` for active additions and recent entries. Classified `"merge"`.
3. **`docs/changelogs/YYYY-Www.md`**: Weekly archived releases bucketed by ISO calendar week. Classified `"copy"`.
4. **`scripts/validate-semver-changelog.mjs`**: Lightweight pure ESM validator for `VERSION`, `CHANGELOG.md`, and weekly archive path conventions. Classified `"copy"`.

## Verification Strategy

- Run `node scripts/validate-semver-changelog.mjs --self-test`
- Run `node scripts/validate-semver-changelog.mjs`
- Run `pnpm verify` to ensure zero breaking changes or manifest unmanifested errors.
