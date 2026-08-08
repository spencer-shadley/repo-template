# Plan NNN: concise outcome

- **Project:** `{{PROJECT_NAME}}`
- **Repository:** `{{OWNER}}/{{REPOSITORY}}`
- **Status:** `planned`
- **Issue:** `github:{{OWNER}}/{{REPOSITORY}}#{{ISSUE_NUMBER}}`
- **enqueuedAt:** `{{ENQUEUED_AT_RFC3339}}`
- **Owner:** `{{OWNER_ROLE}}`
- **Trigger:** `{{NEXT_RETRY_OR_AUTHORITY_TRIGGER}}`
- **Retry-reason:** `{{STRUCTURED_RETRY_REASON}}`
- **Superseded-by:** `{{OWNER}}/{{REPOSITORY}}/plans/{{PLAN_NUMBER}}`
- **Priority:** P2
- **Effort:** medium

Omit optional `Owner`, `Trigger`, `Retry-reason`, and `Superseded-by` lines when they do not apply.
The enqueuer replaces `enqueuedAt` exactly once when admitting the plan; later writers must preserve
both that timestamp byte-for-byte and its internal `enqueueTimeSource` (`recorded` or
`file-add-backfill`). A backfilled source cannot later be relabeled as recorded. Use either
`github:owner/repo#N` for an existing accountable issue or `plan-host:owner/repo/plans/NNN` when the
plan itself composes the work. A plan-host reference is not a GitHub issue and creates no
issue-closure credit.

## Objective

Describe one observable outcome.

## Changes

1. Describe the bounded implementation.

## Applicable governance (material choices only)

- [ ] Considered where relevant: `PRIORITIES.md`; `DOCTRINE.md`; architecture/decision records; and
  the full applicable `AGENTS.md` breadcrumb chain from `C:\code\AGENTS.md` through every ancestor
  `AGENTS.md` between the workspace root and each changed path.

Delete this section when the change presents no material governance tradeoff and recording it would
add no decision-relevant evidence. Applicability follows actual hazards and choices, not an
enumerated change-type allowlist. Do not add per-principle prose merely to fill the template.

## Acceptance criteria

- [ ] State the evidence that proves the outcome.

## Verify

```bash
{{VERIFY_GATE_CMD}}
```

## Risk

- **Tier:** auto
- **Rationale:** Explain why this tier is correct.
- **Effect-classes:** repo-write

## PlanRecordV1 adapter mapping

The Markdown header is a compatibility adapter, not a second lifecycle schema:

| Markdown | `PlanRecordV1` |
|---|---|
| title `Plan NNN` | `planNumber`, `title` |
| `Project`, `Repository` | `project`, `repository` |
| `Status` | `status`: `planned`, `in-progress`, `implemented`, `closed`, or `held-authority` |
| `Issue` | typed `issue`: `github` or `plan-host` |
| `enqueuedAt` | immutable admitted RFC3339 timestamp |
| `Owner`, `Trigger`, `Retry-reason`, `Superseded-by` | separate structured fields |
| `Risk` (`Tier`, `Rationale`, `Effect-classes`) | the single structured `risk` object |

`blocked`, `stale`, `queued`, and `eligible` are computed overlays and must never be stored in
`Status`. Pre-claim `planned` records carry no contract snapshot; `in-progress` starts the immutable
claim snapshot. `implemented` requires claim/land snapshots and a landed receipt. `closed` always
requires a disposition: `completed` requires claim/land snapshots and a deployed receipt, while
`duplicate`, `not-planned`, and `invalid` must not invent land/deploy evidence. `Superseded-by` is
valid only with the `duplicate` disposition.
