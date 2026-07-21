# Plan archive

Archived means terminally dispositioned with evidence preserved; it does not mean deleted or
forgotten. The original plan and available loop sidecars remain byte-for-byte artifacts.

Machine-readable lifecycle decisions from the 2026-07-21 repo-wide coherence audit live in
`disposition-2026-07-21-repo-template.json`. The active delivery spine after that audit is:

```text
repo-template/030 -> code/059 -> repo-template/020 -> repo-template/031
```

GitHub issue #85 remains the program record. Issue #84 remains the separately triggered physical
checkout-relocation record under `spencer-shadley/code#475` and is not silently absorbed by the
materializer release.

The audit also repaired Plan 029's missed postcondition: `.ops/concurrency-capture.jsonl` remains an
ignored local runtime journal but is no longer Git-tracked. The exact landed Plan 029 result claimed
that removal, while merge `4fa4dac50f8a9e4769f0ad58fe0dd2efedb3ce0c` did not contain it. The
durable multi-repository class fix remains `agent-orchestrator#1919`.

The same audit found stale ignored loop sidecars still sitting in the live `plans/` directory for
already-archived Plans 007 and 017, plus Plan 020's superseded pre-refresh run. They are preserved
here with exact hashes in the disposition ledger. The `020.pre-refresh.*` names deliberately avoid
colliding with the eventual terminal Plan 020 archive receipts.
