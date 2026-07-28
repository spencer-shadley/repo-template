# Adoption status refresh proposal — 2026-07-28

The requested target, `docs/adoption-status.md`, already exists and is tracked with no local
modification. The additive-only constraint therefore prohibits updating it.

## Confirmed stale metadata

- The existing page is dated 2026-07-27.
- It records template commit `63246489d458fa71ccfee1357b369daecaa1ba4b`.
- The current local template commit is `a58a4f56f30258a50dcf5c2a38f8a1e01b9efecb`.
- `TEMPLATE_VERSION` still declares `2.6.0`.
- The current manifest still classifies 162 paths: 43 `copy`, 4 `merge`, 114 `self`, and 1
  `generated`.

## Update that would have been made

If existing-file edits were allowed, `docs/adoption-status.md` would be refreshed by:

1. changing the status date and template commit to the current evidence;
2. re-reading the canonical repository set from `agent-orchestrator/projects.json`;
3. re-reading every canonical repository's `.template-sync.json`;
4. recalculating adopted-version totals and current-manifest path gaps;
5. rechecking same-version commit drift, reasoned versus bare `skipPaths`, release-tag evidence,
   and available per-file hash baselines; and
6. retaining explicit unknowns wherever local evidence cannot distinguish intentional
   customization from stale adoption.

The adopter ledger and drift findings were not copied into this proposal as current facts because
the constraint triggered before a fresh fleet scan. Yesterday's figures remain available in
`docs/adoption-status.md`, but they should not be treated as a 2026-07-28 snapshot without that
rescan.

Normal template discipline would also require deciding whether the adoption-status page belongs in
`template-manifest.json` and recording the structural documentation change in `CHANGELOG.md`.
Those are existing-file changes and were intentionally not performed.

An initial copy of this record was created at
`docs/adoption-status-refresh-note-2026-07-28.md`. That name is hidden by the repository's existing
private `.git/info/exclude` pattern `docs/**/*-note*.md`. The file was not removed because this task
explicitly prohibits deletion; this proposal uses a review-visible name instead.
