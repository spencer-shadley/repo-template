# .ops — machine operational state

This README is tracked so a clean clone receives the operational schema. Runtime streams follow the
repository's local tracking policy and must never make routine operational writes wedge its queue.

`incidents.jsonl` appears lazily on the first operational incident (stall, wedge, environment
failure, phantom outcome...). It is append-only JSONL, one incident per line, weekly-rotated into
`archive/`. The orchestrator writes it automatically; humans and agents append via
`node agent-orchestrator/lib/incident-log.mjs <project> '<json>'`.
Schema: `ts, repo, source, severity, kind, plan?, summary, rootCause?, fix?, evidence?, fingerprint`.
Discovery agents mine it for recurring patterns — never rewrite or delete entries.
