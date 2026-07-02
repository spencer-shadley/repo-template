# ADR-0004: When to use a real database (the storage escalation ladder)

- **Status:** accepted (workspace default)
- **Date:** 2026-07-02
- **Deciders:** Spencer Shadley, autonomous-loop maintainers

## Decision — the ladder (escalate only when forced)

1. **Files in git** (md context / json state / jsonl records per ADR-0003) — the DEFAULT.
   Git gives audit history, replication, recovery, and universal agent access (read/grep) for free.
2. **jsonl + rotation + generated views** — records at volume (the observability layer).
3. **SQLite** — first real-DB rung: transactions, SQL queries, zero ops, single host. Runtime
   state, gitignored; if its contents must be auditable, export to jsonl on a schedule.
4. **Postgres (containerized)** — product apps and multi-client platforms. At adoption you MUST
   declare: **disposable** (fully re-derivable; can `down -v` without loss — e.g. an executor's
   runtime state) or **durable** (then migrations (dbmate-style) + scheduled backups + restore
   recipe in RUNBOOK are REQUIRED, day one, not later).
5. **Managed/cloud DB** — only when off-host durability or scale demands it.

## Escalate a rung when ANY of these appear

- **Read-modify-write with >1 writer** — append-atomicity no longer covers you (symptom: you are
  building push-race retry loops around a file).
- **Query-shaped access** — frequent filters/joins/aggregations where full scans hurt (symptom:
  ad-hoc scripts re-joining the same files; hot-path loads of an unbounded directory).
- **Invariants** — uniqueness/counters/foreign keys enforced by convention instead of a constraint.
- **Product data** — an app serving concurrent requests over user data is ALWAYS rung 4+.

## Rules

1. **One source of truth per fact** (same as ADR-0003): a DB may hold live/derived/product state;
   the durable record lives in git OR the DB has the declared durability story. Never both.
2. **Agent access is a requirement**: whatever the rung, agents must be able to read the state
   (SQL via a documented CLI, or jsonl exports). A DB nobody can inspect breaks observability.
3. **Downgrade is success**: if a DB's contents turn out re-derivable, declare it disposable and
   delete the backup ceremony.

## Context (fleet evidence, 2026-07)

- Orchestration state (queue, plans, incidents, telemetry) on git-files survived 24h of concurrent
  autonomous drains with zero data corruption — every race we hit was a working-TREE race, not a
  data-file race. Files were the right rung.
- Windmill's postgres is rung-4-disposable BY DESIGN (queue-of-record stayed in git) — cutover and
  recovery stayed trivial because of it.
- task-dag's postgres is rung-4-durable done right: dbmate migrations + declared ownership.
- Known boundary cases (watch, don't migrate yet): plan-number allocation uses a push-race retry
  loop (rung-3 symptom); an executor's run-records directory grows unbounded and is fully rescanned
  on boot (query-shape symptom). If either recurs as real pain, that's the SQLite trigger.
