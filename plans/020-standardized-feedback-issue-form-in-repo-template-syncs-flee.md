# Plan 020: Standardized feedback issue form in repo-template (syncs fleet-wide)

- **Project:** repo-template
- **Branch:** feat/020-standardized-feedback-issue-form-in-repo-template-syncs-flee
- **Status:** ready for codex
- **Priority:** P2
- **Effort:** low

## Objective

Give every repo a standardized, self-service path to file feedback that the orchestrator ingests, by
adding a GitHub **feedback issue form** and the required labels to `repo-template`. Because repos sync
from this template (`.template-sync.json`), the form propagates fleet-wide without per-repo plans.

## Context

- The template lives at `spencer-shadley/repo-template`; enrolled repos carry `.template-sync.json`
  (e.g. `agent-orchestrator/.template-sync.json`, `syncedVersion: 2.3.0`) and pull template changes.
- Today `repo-template/.github/ISSUE_TEMPLATE/` contains only `task.md`. There is NO feedback form.
- The orchestrator triage lane ingests issues carrying the `human-feedback` label (see the triage-lane
  plan in this same program). GitHub issue forms only auto-apply a label if that label already EXISTS
  in the repo, so the labels must be bootstrapped too.

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
5. `repo-template/README.md` (or the template's onboarding doc) — one line: every repo inherits the
   standardized feedback form via template-sync; apps additionally wire an in-app nub to it.
6. `repo-template/template-manifest.json` — register every NEW tracked file
   (`.github/ISSUE_TEMPLATE/feedback.yml`, `.github/labels.yml`, and any other new file) with mode
   `copy` (they should be copied verbatim into enrolled repos). The manifest-coverage gate fails on any
   unmanifested tracked file, so this is mandatory.

## Out of scope

- Do NOT modify enrolled repos directly — they receive this via template-sync.
- Do NOT build the in-app nub or the Todoist bridge (separate plans).
- Do NOT add GitHub Actions workflows (Actions are disabled fleet-wide).
- Label CREATION wiring (making adopt-project / the fleet setup run `gh label create` from
  `.github/labels.yml`) lives in the orchestrator repo — declared follow-up, NOT this plan. This plan
  only produces the canonical `.github/labels.yml` that the follow-up consumes.

## Acceptance criteria

- [ ] `repo-template/.github/ISSUE_TEMPLATE/feedback.yml` exists and is valid YAML for a GitHub issue
      form (parses; has `name`, `description`, `labels: [human-feedback]`, and a `body` array).
- [ ] `repo-template/.github/labels.yml` exists, is valid YAML, and contains entries for both
      `human-feedback` and `needs-info` (name + color + description). (If an existing differently-named
      label source was extended instead, this criterion checks that file for the two label names.)
- [ ] The template README notes the standardized feedback path and that it syncs fleet-wide.
- [ ] Every new tracked file is registered in `template-manifest.json` (the manifest-coverage gate
      passes with no `unmanifested` output).

## Verify

<!-- no e2e — config/template only. Gate = repo-template's standard TEMPLATE-SELF checks
     (conflict-marker grep + template-manifest coverage) PLUS YAML validity of the new form/labels
     files and a grep proving both label names are present. run-loop runs the gate inside repo-template/. -->

```bash
ec=0; grep -rn '^<''<<<<<<' --include='*.md' --include='*.yml' --include='*.json' --include='*.jsonl' --include='TEMPLATE_VERSION' . || ec=$?; if [ "$ec" -ne 1 ]; then exit 1; fi
node -e "const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const {execSync}=require('child_process');const tracked=execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!f.startsWith('plans/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>`${k}:${v}`);if(missing.length||invalid.length){if(missing.length)console.error('unmanifested:',missing);if(invalid.length)console.error('invalid manifest modes:',invalid);process.exit(1)}"
npx --yes js-yaml .github/ISSUE_TEMPLATE/feedback.yml >/dev/null
npx --yes js-yaml .github/labels.yml >/dev/null
grep -q human-feedback .github/labels.yml && grep -q needs-info .github/labels.yml
```

## Notes / risks

- After this merges, a template-sync run rolls the form out to enrolled repos; label creation happens
  per-repo via adopt-project / the bootstrap. Follow-up (not this plan): trigger a sync pass and
  confirm labels exist on each active repo.
- Issue forms can't auto-assign; that's fine — the human filing chooses. The Todoist bridge and any
  agent-created issues assign `spencer-shadley` themselves.
