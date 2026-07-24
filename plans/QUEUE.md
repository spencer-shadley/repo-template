# Run queue — repo-template

RISK-TIERED repo: only docs/config `auto` plans belong in `## Pending`; executable or
cross-repository `human` plans are enqueued with `--no-queue` and use the one-off governed lane.

## Pending
- 033 P1 build-pure-typescript-adoption-shell-v2 hold:critic-death retry:critic-available
