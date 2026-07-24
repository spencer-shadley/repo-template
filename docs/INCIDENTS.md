# Incident log — curated post-mortems

Majors only; the machine stream is `.ops/incidents.jsonl`. Format per entry:
**symptom → root cause → fix → prevention**. Newest first. Workspace-wide patterns live in
[the canonical agent-orchestrator incident catalog](https://github.com/spencer-shadley/agent-orchestrator/blob/master/docs/INCIDENTS.md).

Per [ADR-0003: File-format selection (md / json / jsonl / tsv / csv)](adr/0003-file-format-selection.md),
post-mortem prose LESSONS are context distilled from the jsonl record — the record itself is never
maintained here. The incident schema lives in `.ops/README.md`.
