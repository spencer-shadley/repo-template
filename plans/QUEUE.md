# Run queue — repo-template

RISK-TIERED repo: only docs/config `auto` plans belong in `## Pending`; executable or
cross-repository `human` plans are enqueued with `--no-queue` and use the one-off governed lane.

## Pending
- 035 P1 repo-template-product-sli-contract-plan retry:manual hold:critic-death retry:critic-available
- 036 P2 require-explicit-repository-charters
