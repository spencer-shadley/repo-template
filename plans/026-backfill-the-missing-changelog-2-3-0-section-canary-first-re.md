# Plan 026: Backfill the missing CHANGELOG [2.3.0] section (canary-first release)

- **Project:** repo-template
- **Status:** ready for codex
- **Priority:** P3
- **Effort:** low

## Objective

Restore per-release changelog discipline: `CHANGELOG.md` jumps from `## [2.2.0]` to `## [2.4.0]`
with no `## [2.3.0]` entry, even though 2.3.0 exists (TEMPLATE_VERSION bumped at commit b2d3e43,
2026-07-02, plan 005) and three fleet repos record `syncedVersion: 2.3.0`. Downstream migration
plans read the changelog to know what a version span contains — a missing release section makes
drift severity and migration scope harder to derive.

## Context

- `CHANGELOG.md` — release headings currently: Unreleased, 2.4.0 (2026-07-12), 2.2.0, 2.1.0,
  2.0.0, 1.1.0, 1.0.0.
- 2.3.0 was the canary-first rollout release (plan 005, `plans/archive/005-major-upgrades-roll-out-
  canary-first-one-leaf-repo-then-flee.md`, commit b2d3e43, 2026-07-02). Its content was folded
  into the `## [2.4.0]` section — specifically the "Documented canary-first rollout order for MAJOR
  template upgrades..." Changed entry (and any other entries that `git log b2d3e43` attribution
  shows belong to plan 005's merge, verify against `git log 3db3057..b2d3e43`).
- Keep-a-Changelog format; entries stay one-per-change; do not rewrite entry text beyond moving it.

## Changes

1. `CHANGELOG.md` — insert `## [2.3.0] - 2026-07-02` between the 2.4.0 and 2.2.0 sections; move the
   entries that landed in the 2.3.0 release (verified via git attribution) from the 2.4.0 section
   into it. Entries genuinely landed between b2d3e43 and the 2.4.0 bump stay under 2.4.0.

## Out of scope

- Any other file; any TEMPLATE_VERSION change; any manifest change. This is not a release — no
  version bump.
- Rewording existing entries.

## Acceptance criteria

- [ ] `## [2.3.0] - 2026-07-02` section exists with the canary-first entries.
- [ ] 2.4.0 section no longer claims 2.3.0's changes; no entry lost or duplicated.

## Verify

no e2e — single markdown file.

```bash
node -e "const fs=require('fs');const c=fs.readFileSync('CHANGELOG.md','utf8');if(!c.includes('## [2.3.0]')){console.error('missing [2.3.0] section');process.exit(1)}const i4=c.indexOf('## [2.4.0]'),i3=c.indexOf('## [2.3.0]'),i2=c.indexOf('## [2.2.0]');if(!(i4<i3&&i3<i2)){console.error('sections out of order');process.exit(1)}console.log('changelog gate OK')"
```

## Notes / risks

Docs-only, two-way. Tier: auto.

## Risk

Blast radius: one markdown file in the template repo; no propagation until repos next sync.
Tier: `auto`.
