# Incident log — curated post-mortems

Majors only; the machine stream is `.ops/incidents.jsonl`. Format per entry:
**symptom → root cause → fix → prevention**. Newest first. Workspace-wide patterns live in
`../agent-orchestrator/docs/INCIDENTS.md` from the project root in the standard sibling layout.

Per ADR-0003, post-mortem prose LESSONS are context distilled from the jsonl record — the record
itself is never maintained here. The incident schema lives in `.ops/README.md`.
