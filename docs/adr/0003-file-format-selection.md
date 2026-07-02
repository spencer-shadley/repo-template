# ADR-0003: File-format selection (md / json / jsonl / tsv / csv)

- **Status:** accepted (workspace default)
- **Date:** 2026-07-02

## Decision

Choose by CONTEXT vs RECORD (the primary axis — agents are the primary readers of everything):
- **RECORD** (things that HAPPENED: events, incidents, outcomes, metrics) → **jsonl, always.**
  Readable forms are GENERATED VIEWS rendered on demand — never maintained files.
- **CONTEXT** (things agents INGEST to act: instructions, doctrine, decision prose) → **md** — LLMs
  consume long prose most efficiently as markdown, and context gets diff-reviewed (md diffs read;
  escaped-prose jsonl diffs do not).
Secondary axes: write pattern (appended vs whole-state) and escaping risk.

| Format | Use when |
|---|---|
| **md** | Human/LLM-first documents: prose, decisions, instructions, generated reports. Authored/edited, PR-reviewed, GitHub-rendered. |
| **json** | One coherent config/state object read+written WHOLE (registry, marker, run record). Nested OK. Pretty-printed for diffs. Never for growing data. |
| **jsonl** | DEFAULT for anything machine-appended over time: telemetry, incidents, events, triage records. One self-describing object per line; append-atomic under concurrent writers; schema evolves freely; prose embeds safely; rotation-friendly. Write-once — never hand-edit. |
| **tsv** | Small hand-maintained flat tables, ≤~5 columns, where NO field can ever contain a tab/newline (e.g. watchlists). If a field needs escaping, it's jsonl. |
| **csv** | Never authored as a system format. Interchange-only when an external tool (spreadsheet) demands it. |

## Rules

0. **No maintained record-files in md.** A curated incident/report md file is a record wearing a context costume — it WILL drift from the stream. Generated views only (digest/ops-report pattern).
1. **md-as-data is banned for new surfaces.** Grandfathered only where the schema is
   one-line-regex-simple AND humans must hand-edit it (plans/QUEUE.md). Anything richer:
   **jsonl is the source of truth; md is a GENERATED view** (digest pattern). Never hand-maintain
   the same fact in two formats.
2. **Append vs rewrite decides json vs jsonl.** A file that grows or has >1 potential writer must
   be jsonl (one-line append is the only free atomic write). Whole-file JSON rewrite = race.
3. **Machine streams carry a schema note** — a header comment file (like `.ops/README.md`) or a
   `#`-prefixed first line documenting fields, so agents don't guess.
4. **Secrets never in tracked data files** regardless of format.

## Context (fleet evidence, 2026-07)

Three real bugs from format mistakes in one hardening run: a digest parsing a defunct md log format
(2 dead report sections); a QUEUE.md line-regex fragility in dequeue bookkeeping; a status-string
parse (`unknown:ready for codex`) that tripped a global circuit breaker on four SUCCESSFUL runs.
Convergent evidence: sharingan independently invented a locked JSONL audit ledger (.state/recycle-ledger.jsonl) for its destructive-op trail. Meanwhile every jsonl stream (telemetry, triage, incidents) survived concurrent writers and schema
drift without incident.

## Consequences

New operational surfaces default to jsonl + generated-md views; hand-edited registries stay
json/tsv by the table above; parsers for grandfathered md formats live in ONE shared lib per format
(never duplicated — the digest bug was a stale duplicate parser).
