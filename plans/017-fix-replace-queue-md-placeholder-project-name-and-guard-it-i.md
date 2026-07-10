# Plan 017: Fix: replace QUEUE.md placeholder project name and guard it in the verify gate

- **Project:** repo-template
- **Branch:** feat/017-fix-replace-queue-md-placeholder-project-name-and-guard-it-i
- **Status:** ready for codex
- **Stall-retries:** 1
- **Last-stall:** stalled - obsolete
- **Priority:** P3
- **Effort:** low

## Objective

Resolve spencer-shadley/repo-template#15: the `# Run queue — <project-name>` header (and the
`TODO(setup)` risk-tiering comment) in this repo's own `plans/QUEUE.md` still carry template
placeholders; fix them for the template repo itself and add a verify-gate check so the look-alike
placeholder can't silently persist. Fixes #15.

## Context

- Issue: spencer-shadley/repo-template#15 (agy, MEDIUM, Claude Sonnet 4.6). Confirmed still present
  at origin/master: `plans/QUEUE.md` line 1 is `# Run queue — <project-name>` and the
  `TODO(setup)` comment about risk-tiering remains.
- Nuance: repo-template IS the template — downstream repos are supposed to receive a placeholder
  they replace. So the fix must distinguish the template's OWN queue (this file, should say
  `repo-template`) from the template payload it ships to new repos (if the QUEUE.md is copied
  verbatim, keep the placeholder in whatever template-payload mechanism exists — check
  `template-manifest.json` / docs for how files are stamped for downstream use, and follow the
  existing pattern used by other self-vs-payload files).
- repo-template is not risk-tiered: resolve the `TODO(setup)` comment accordingly (delete it, per
  its own instruction).

## Changes

- `plans/QUEUE.md` — header becomes `# Run queue — repo-template`; delete the `TODO(setup)`
  risk-tier comment (repo is not risk-tiered). If the template payload needs to keep shipping a
  placeholder copy, handle that via the repo's existing template-payload convention rather than
  reverting this file.
- Verify gate (wherever the repo's gate is defined — its local-ci entry/AGENTS.md verify block):
  add a check that fails when `plans/QUEUE.md` still contains `<project-name>`, e.g.
  `! grep -q '<project-name>' plans/QUEUE.md`.
- `TEMPLATE_VERSION`/`CHANGELOG.md` — bump per the TEMPLATE-SELF versioning rules in AGENTS.md
  (patch-level content fix), keeping the version-bump convention intact.

## Out of scope

- Issue #11 (retroactive changelog attribution for plan 002) — separate.
- Any other placeholder or template-sync tooling.

## Acceptance criteria

- `plans/QUEUE.md` header names `repo-template`; no `<project-name>` remains in the file; the
  TODO(setup) comment is resolved.
- The verify gate fails if `<project-name>` reappears in plans/QUEUE.md.
- TEMPLATE_VERSION/CHANGELOG updated per the repo's own versioning rules.

## Verify

```bash
bash -c 'grep -rn "^<""<<<<<<" --include="*.md" . && exit 1; ec=$?; [ "$ec" -eq 1 ]'
bash -c '! grep -q "<project-name>" plans/QUEUE.md'
```

## Risk

auto — docs/metadata-only change in a non-risk-tiered repo.
