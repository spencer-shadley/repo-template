# Plan 000: enrollment smoke

- **Project:** {{PROJECT_NAME}}
- **Status:** ready for codex
- **Priority:** P1
- **Effort:** low

## Objective

Prove this repo is correctly enrolled in the autonomous loop before real work enters the queue.

## Changes

1. Create or update `.ops/enrollment-smoke.txt` with the current date and plan number.

## Acceptance criteria

- [ ] The smoke marker exists and contains this plan number.
- [ ] The repo verify gate passes.

## Verify

```bash
{{VERIFY_GATE_CMD}}
```

## Risk

Tier: `auto` if the repo's autonomy policy allows marker-file changes; otherwise run one-off as
human tier.
