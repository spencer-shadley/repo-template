# Observability — <project-name>

<!-- TODO(setup): fill the three questions -->
1. **What do we log?** (events, levels, where they land)
2. **What do we measure?** (the 3-5 numbers that say "healthy")
3. **Where does a human look first** when something's wrong?

Standard surfaces every repo already has: `.ops/incidents.jsonl` (operational incidents),
`plans/archive/` (what the loop did), PR history. Never log secrets; redact tokens.
