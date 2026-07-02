# Plan 005: MAJOR upgrades roll out canary-first (one leaf repo, then fleet)

- **Project:** repo-template
- **Status:** ready for user approval
- **Priority:** P2
- **Effort:** low

## Objective

User decision (2026-07-02): template upgrades stay automatic (even MAJOR), but MAJOR versions roll
out canary-first — one leaf repo migrates, and the fleet follows only after the canary is green.
Encode this in the template's own upgrade doctrine so subscription agents follow it.

## Changes

1. `docs/MIGRATION.md` — new "Rollout order" section: MAJOR bump → migrate the CANARY repo first
   (default canary: gmail-markdown — smallest verify surface; overridable in the bump's CHANGELOG
   entry), wait for its migration PR to merge green + one clean drain cycle, then open migration
   plans for the rest of the fleet. MINOR/PATCH: no canary needed. Define "green" = migration PR
   merged + verify gate passed + no new incidents.jsonl lines attributable to the migration within
   the canary's next drain.
2. `AGENTS.md` TEMPLATE-SELF block — one line under the versioning rules pointing at the rollout
   order.
3. CHANGELOG "Unreleased/Changed" entry.

## Acceptance criteria

- [ ] MIGRATION.md rollout section exists with canary definition + green criteria.
- [ ] TEMPLATE-SELF references it. CHANGELOG updated. TEMPLATE_VERSION minor-bumped per
      TEMPLATE-SELF rules (doctrine addition = MINOR).

## Verify

```bash
grep -q "Rollout order" docs/MIGRATION.md && grep -qi "canary" docs/MIGRATION.md AGENTS.md
grep -qE "^[0-9]+\.[0-9]+\.[0-9]+$" TEMPLATE_VERSION
```

## Risk

Tier: auto (template docs; its own queue auto-merges).
