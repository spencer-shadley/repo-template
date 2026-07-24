# Plan 020: Standardized feedback issue form in repo-template (syncs fleet-wide)

- **Project:** repo-template
- **Branch:** feat/020-standardized-feedback-issue-form-in-repo-template-syncs-flee
- **Status:** draft - blocked on Plan 030, Code Plan 059 label reconciliation, and exact landed receipts
- **Depends:** 030
- **Plan 030 landed SHA:** pending
- **Code Plan 059 landed SHA:** pending
- **Requeue-reason:** manual: CEO survey approval 2026-07-10 (.ops/human-survey record) - machine-recovery unblock
- **Stall-retries:** 3
- **Last-stall:** stalled - deterministic-verify-wedge
- **Priority:** P2
- **Effort:** low
- **Risk tier:** auto

## Objective

Give every repo a standardized, self-service path to file feedback that the orchestrator ingests, by
adding a GitHub **feedback issue form** and the required labels to `repo-template`. Because repos sync
from this template (`.template-sync.json`), the form propagates fleet-wide without per-repo plans.

## Context and sequencing

- This plan is the small automatic template-content step in the release spine:
  `Plan 030 foundation -> Code Plan 059 adoption consumer -> Plan 020 -> Plan 031 release canary`.
  Plan 031 must not publish the new materializer until this plan is archived as landed.
- On current `master`, `.github/ISSUE_TEMPLATE/` contains only `task.md`; there is no feedback form.
- The preserved remote WIP branch
  `feat/020-standardized-feedback-issue-form-in-repo-template-syncs-flee` at
  `b1c31048572f269ab8aae079c24d89838751f839` contains the form, label catalog, manifest, README,
  and changelog changes. It is salvage evidence, not an implementation base: implementation starts
  fresh from current `origin/master`, inspects that exact diff, and carries forward only bytes that
  still satisfy this refreshed contract.
- The orchestrator triage lane ingests issues carrying the `human-feedback` label (see the triage-lane
  plan in this same program). GitHub issue forms only auto-apply a label if that label already EXISTS
  in the repo, so the labels must be bootstrapped too.
- Code Plan 059 owns idempotent reconciliation of `.github/labels.yml` during new-repository
  adoption. This plan owns the canonical label catalog and issue form; it does not create labels in
  live repositories or duplicate the adoption transaction.
- Code Plan 059's exact landed receipt is a consumed-contract precondition, not behavior implemented
  or re-proved by this plan. Before promotion, its receipt must name the reconciler entrypoint and
  show a second apply is a no-op before `staged-ready`.
- Before promotion, a metadata-only governed amendment replaces both pending SHAs above with exact
  landed 40-hex SHAs, confirms Plan 030 actually exposes the exact package scripts used below and
  Code Plan 059's receipt satisfies the consumed contract above, changes Status to `ready for codex`,
  obtains a fresh critic verdict, and inserts this plan exactly once in `plans/QUEUE.md`. Missing or
  mismatched receipts, or missing script names, are a no-op.

## Changes

1. `repo-template/.github/ISSUE_TEMPLATE/feedback.yml` — a GitHub **issue form** (YAML) titled
   "Feedback / bug", `labels: [human-feedback]`, with fields:
   - `source` (dropdown: app, phone, chat, other) — where the feedback came from.
   - `summary` (short, required), `what_happened` / `expected` (textareas),
   - `context` (textarea, optional) — auto-filled by app nubs (commit SHA, route, console errors).
   Keep it short; this is the human-facing capture surface.
2. `repo-template/.github/ISSUE_TEMPLATE/config.yml` — ensure `blank_issues_enabled` stays true and the
   feedback form is listed; add a contact link if the template already uses one.
3. `repo-template/.github/labels.yml` — the canonical repo-label list. Create it if absent; it MUST
   contain `human-feedback` (color + description: human-sourced feedback intake) and `needs-info`
   (triage awaiting author reply). These labels must exist for the form to apply `human-feedback` and
   for triage to apply `needs-info`. If the template already has a label source of a different name,
   add the two labels there and point this plan's acceptance at that actual file instead.
4. `repo-template/README.md` (or the template's onboarding doc) — one line: every repo inherits the
   standardized feedback form via template-sync; apps additionally wire an in-app nub to it.
5. `repo-template/template-manifest.json` — register every NEW tracked file
   (`.github/ISSUE_TEMPLATE/feedback.yml`, `.github/labels.yml`, and any other new file) with mode
   `copy` (they should be copied verbatim into enrolled repos). The manifest-coverage gate fails on any
   unmanifested tracked file, so this is mandatory.

## Out of scope

- Do NOT modify enrolled repos directly — they receive this via template-sync.
- Do NOT build the in-app nub or the Todoist bridge (separate plans).
- Do NOT add GitHub Actions workflows (Actions are disabled fleet-wide).
- Do not implement or change label reconciliation here. Code Plan 059 is the sole adoption owner and
  this plan consumes its exact landed contract.
- Do not publish a template release, tag, or canary; Plan 031 owns the terminal release.

## Acceptance criteria

- [ ] `repo-template/.github/ISSUE_TEMPLATE/feedback.yml` exists and is valid YAML for a GitHub issue
      form (parses; has `name`, `description`, `labels: [human-feedback]`, and a `body` array).
- [ ] `repo-template/.github/labels.yml` exists, is valid YAML, and contains entries for both
      `human-feedback` and `needs-info` (name + color + description). (If an existing differently-named
      label source was extended instead, this criterion checks that file for the two label names.)
- [ ] The template README notes the standardized feedback path and that it syncs fleet-wide.
- [ ] Every new tracked file is registered in `template-manifest.json` (the manifest-coverage gate
      passes with no `unmanifested` output).
- [ ] A generated fixture includes the form/catalog, contains no unresolved setup marker, validates
      pre-Git, installs offline from the dedicated store, and passes its own `pnpm verify`.

## Verify

No product E2E or live label mutation occurs. Plan 030's pinned toolchain, validator, and fixture
canary are the authority; no `npx`, ambient YAML parser, or network lookup is permitted.

```bash
set -e
corepack pnpm install --frozen-lockfile
corepack pnpm docs:lint
corepack pnpm validate
node scripts/validate-template.mjs
corepack pnpm test
corepack pnpm bootstrap:canary
node scripts/lint-user-surface-leaks.mjs --self-test
git diff --check
```

## Notes / risks

- Plan 031 proves the catalog is materialized, reconciled into its private canary, and auto-labels a
  canary feedback issue before publishing the release receipt. This plan does not modify or promise
  rollout to existing repositories; any such rollout requires a separately commissioned owner.
- Issue forms can't auto-assign; that's fine — the human filing chooses. The Todoist bridge and any
  agent-created issues assign `spencer-shadley` themselves.
