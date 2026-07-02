# ADR-0002: Verify-gate contract (workspace standard — accept or amend)

- **Status:** accepted (workspace default)
- **Date:** 2026-07-02

## Decision
The plan-loop verify gate for this repo:
1. Validates EVERY artifact type a change can touch (code, shell, yaml/json, sql, workflows).
2. Is environment-honest: steps needing a browser/docker/display FIRST probe availability and
   skip-with-notice when absent (exit 0 with a loud line), so a missing tool can neither hang the
   gate nor masquerade as a code failure.
3. Runs from the project directory; never prefixes `cd <project>` (the loop guarantees cwd).
4. Emits real output on failure — the loop logs the tail; silent failure is a gate defect.

## Context (why — fleet incidents 2026-07-02)
A PATH defect made every scheduled verify die in 2s for a night (env, not code); docker-wait loops
hung 30 min × 8; browser suites failed only in the scheduled env. An environment-honest gate makes
those one-glance diagnoses.
