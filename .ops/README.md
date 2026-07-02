# .ops — machine operational state (tracked)

`incidents.jsonl` appears lazily on the first operational incident (stall, wedge, env failure,
phantom outcome...). Append-only JSONL, one incident per line, weekly-rotated into `archive/`.
Written automatically by the orchestrator; humans/agents append via
`node agent-orchestrator/lib/incident-log.mjs <project> '<json>'`.
Schema: `ts, repo, source, severity, kind, plan?, summary, rootCause?, fix?, evidence?, fingerprint`.
Discovery agents mine it for recurring patterns — never rewrite or delete entries.
