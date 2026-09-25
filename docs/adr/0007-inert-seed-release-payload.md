# ADR-0007: Separate raw Template structure from the inert release payload

- **Status:** accepted
- **Date:** 2026-07-29
- **Decider:** Repo Template Manager
- **Applies to:** Template releases consumed by `adoption-shell-v2`

## Context

`template-manifest.json` is the complete overlay/synchronization map. It does not overlay a local
issue template; GitHub inherits account-wide forms from `spencer-shadley/.github`. Portable `copy`
and `merge` rows can still include an advisory CI workflow. The pure v2 materializer rejects
`.github/ISSUE_TEMPLATE/**` (`E_PATH_ISSUE_TEMPLATE`) and pre-custody workflow paths before a new
repository has manager custody, so treating every raw overlay row as an inert release payload
remains unsafe whenever a forbidden path is present.

## Decision

Keep `template-manifest.json` complete and unchanged in meaning. Publish a separate
`release/inert-seed-manifest.json` for the pre-custody materializer. It partitions every raw
`copy`/`merge` row into:

- selected inert bytes, with exact Template mode, Git mode, byte length, content SHA-256, and a
  canonical aggregate inventory digest; or
- an explicit exclusion for `.github/ISSUE_TEMPLATE/` or `.github/workflows/` when such a path is
  present in the overlay map, with the applicable conformance reason (`no-local-issue-template-override`
  or `no-pre-custody-workflow`); or
- an explicit exclusion for a raw overlay document whose checkout-relative or Template-self
  authority requires a later portable projection.

`release/release-payload-set.json` carries the selected bytes under the existing closed v2 schema.
`tools/release-payload.ts check` reconstructs both artifacts from tracked source bytes and rejects
drift. The exact compiled materializer must accept and materialize the complete payload in memory
before publication. Factory remains the sole owner of destination writes, repository creation, and
custody acquisition. Local issue-template installation remains forbidden; GitHub inherits the
account-wide form. Pre-custody workflow installation remains Factory-owned after custody.

## Consequences

Raw overlay consumers continue to see the complete Template structure. Create-only consumers get a
named inert contract rather than silently filtering producer bytes or bypassing path policy.
Adding another pre-custody-forbidden raw path becomes an explicit exclusion automatically; removing
or changing a selected byte requires regenerating the content-addressed release artifacts.

Published tags remain immutable. Correct forward with a fresh SemVer and annotated receipt; never
reinterpret `v3.0.1`.
