## Summary

- Document fleet SLI 30 `repo_source_stock` thresholds and split-trigger policy in `docs/QUALITY-LINT.md`.
- Clarify that the per-file 500-line rule is not a repo-total LOC cap and that the Code measure/check is not copied into this template.
- Record the structural MINOR changelog entry for issue #164.

## Validation

- `git diff --check` passed.
- Prescribed `pnpm install --frozen-lockfile --ignore-scripts && pnpm verify` reached the verify gate but did not complete: the environment lacks the required host `betterleaks` binary, and Knip reported one existing configuration hint.

## Deploy state

- Not applicable; documentation-only change.
