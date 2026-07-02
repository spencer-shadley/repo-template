# Plan 004: docs/MIGRATION.md — the overlay playbook for existing repos (next MINOR)

- **Project:** repo-template
- **Status:** ready for codex
- **Priority:** P1
- **Effort:** medium

## Objective

The migration dry-run audit (2026-07-02) simulated overlaying this template onto all 5 existing
repos and found two systemic traps plus per-repo hazards. Codify the playbook so every migration
plan is mechanical. Runs AFTER the v2.0.0 hardening plan (uses its template-manifest.json).

## Changes

1. **New `docs/MIGRATION.md`** containing:
   - **Overlay algorithm:** iterate template-manifest.json PER-FILE (never copy directories);
     existence check is **CASE-INSENSITIVE** (Windows/NTFS: copying `ARCHITECTURE.md` over an
     existing `architecture.md` silently overwrites content in place — Trap A); `copy` entries
     copy only when truly missing; `merge` entries (AGENTS.md, .gitignore, CHANGELOG.md,
     README.md) are merged by hand — .gitignore ALWAYS gains the secret patterns + sidecar
     ignores even though the file exists.
   - **Post-copy swallow-audit:** `git status --porcelain <each copied path>` — any copied file
     not showing as untracked/added was swallowed by an ignore rule (whitelist-gitignore repos
     must add explicit allows in the SAME commit).
   - **ADR-numbering policy (Trap B):** the survey ADR (0001-design-philosophies) renumbers to the
     repo's next free number on copy; workspace-standard ADRs (verify-gate, formats, storage, git
     conventions) are REFERENCED by template URL, not copied, when the repo already has its own
     ADR numbering; repos with a different ADR format (single-file logs, README sections) keep it
     — link + record in skipPaths with a citation; never convert during migration.
   - **Never-touch rule:** existing real operational docs win; template stubs become POINTERS to
     them (e.g. a repo's existing runbooks/ dir). List the merge/never-touch decision in the
     migration PR body.
   - **Anchor recipe:** the migration PR sets `.template-sync.json` syncedVersion/syncedCommit/
     syncedAt AND populates skipPaths with EVERY intentional divergence (each citing an ADR or
     CHANGELOG "Unchanged (intentional)" line) — otherwise the drift sweep re-files everything the
     migration deliberately skipped.
   - **Survey sourcing:** answer ADR-0001 questions from the repo's existing docs/history first
     (most are derivable); leave `TODO(setup!)` only for the genuinely-human ones.
   - **Tier rule:** migrations of risk-tiered repos (orchestrator, workspace root) run human-tier
     (--no-queue); leaf repos may run auto-lane.
   - **Enrollment proof:** finish by running the smoke plan (plans/drafts/000-smoke.md).
   - **Non-node note:** .gitignore seeds and ci.yml comments are node-flavored; python repos swap
     in pycache/venv patterns and pip cadence.
2. **README.md**: add the MIGRATION.md row + one line in Workspace context pointing at it.
3. **CHANGELOG** `## [2.1.0]` + TEMPLATE_VERSION=2.1.0 (MINOR: additive doc).

## Acceptance criteria

- [ ] docs/MIGRATION.md covers: per-file case-insensitive overlay, swallow-audit, ADR-numbering
      policy, never-touch/pointer rule, anchor+skipPaths recipe, tier rule, smoke-plan proof.
- [ ] README references it; TEMPLATE_VERSION=2.1.0; CHANGELOG entry present.
- [ ] Verify gate green.

## Verify

```bash
! grep -rn '<<<<<<<' --include='*.md' --include='*.yml' --include='*.json' .
grep -qi "case-insensitive" docs/MIGRATION.md && grep -qi "skipPaths" docs/MIGRATION.md
grep -q "2.1.0" TEMPLATE_VERSION
```

## Risk

Tier: `auto` (docs only).
