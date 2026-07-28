# Plan 000: enrollment smoke

- **Project:** {{PROJECT_NAME}}
- **Repository:** {{OWNER}}/{{REPOSITORY}}
- **Status:** planned
- **Issue:** plan-host:{{OWNER}}/{{REPOSITORY}}/plans/000
- **enqueuedAt:** {{ENQUEUED_AT_RFC3339}}
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

- **Tier:** auto
- **Rationale:** Local enrollment marker only; use `human` if local policy protects this path.
- **Effect-classes:** repo-write
