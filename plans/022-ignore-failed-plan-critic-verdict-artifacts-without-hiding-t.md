# Plan 022: Ignore failed plan-critic verdict artifacts without hiding tracked ops

- **Project:** repo-template
- **Branch:** feat/022-ignore-failed-plan-critic-verdict-artifacts-without-hiding-t
- **Status:** ready for user approval
- **Stall-retries:** 1
- **Last-stall:** stalled - deterministic-verify-wedge
- **Requeue-reason:** stall-retry: implementation was correct, but Bash consumed template-literal backticks in the captured Verify command; use shell-safe concatenation in both the plan gate and canonical AGENTS.md gate, then resume preserved WIP
- **Priority:** P1
- **Effort:** low

## Objective

Add the file-precise transient ignore rule for failed pre-enqueue plan-critic verdict reports to the
living template. Adopted repos must retain diagnostic verdicts locally without those generated files
dirtying or wedging their scheduled drains, while tracked incident and ops evidence remains visible.

## Context

- `agent-orchestrator/lib/artifacts.mjs` canonically classifies `.ops/critic/*.md` as transient,
  written by `plan-critic/pre-enqueue`; successful verdicts are separately copied into tracked
  `plans/<NNN>.critic.md`.
- `repo-template/.gitignore` broadly re-includes `.ops/**` so incident logs remain tracked, but it
  never re-ignores the critic-only transient path. Failed critic runs therefore leave `??
  .ops/critic/` and this repo has already recorded a queue-abort-dirty instance of the class.
- The same leak is present in newly adopted `model-router`. Fix the canonical template first;
  consumer migrations are separate governed plans per cross-repo doctrine.
- Git ignore ordering is load-bearing: `.ops/critic/*.md` must appear after `!.ops/**`, otherwise
  the later broad re-include makes the transient rule ineffective.
- The first plan-022 run made the intended ignore/CHANGELOG edits but stalled before evaluating them:
  Bash consumed JavaScript template-literal backticks in the double-quoted `node -e` Verify command.
  The identical unsafe command is also the canonical repo Verify example in `AGENTS.md`, so this
  retry includes the incident class fix instead of correcting only the one captured plan gate.

## Changes

1. `.gitignore` — after the broad `.ops` re-includes, add `.ops/critic/*.md`. Revise the nearby
   “keep LAST” wording so it accurately says file-precise transient re-ignores may follow, while
   blanket `.ops/` ignores remain forbidden.
2. `CHANGELOG.md` — add an Unreleased Changed entry citing the observed queue-abort-dirty class and
   the canonical artifact-manifest ownership. Do not cut a template release in this plan.
3. `AGENTS.md` — make the canonical template-manifest Verify command shell-safe by replacing only
   the JavaScript template-literal mapping with equivalent string concatenation. Preserve its
   diagnostics and all other repo protocol text.
4. Confirm `template-manifest.json` still accounts for every tracked template file; no new manifest
   entry should be necessary because only existing tracked files change.

## Out of scope

- Do not ignore `.ops/`, `.ops/**`, `.ops/incidents.jsonl`, or tracked `plans/*.critic.md`.
- Do not delete existing local critic reports; they remain useful diagnostics and become invisible
  to Git status through the exact rule.
- Do not modify model-router, task-dag, agent-orchestrator, or the adopt-project skill in this
  cross-repo plan. Each consumer/sync change gets its own governed plan after this class fix lands.
- Do not bump `TEMPLATE_VERSION`, create a tag, or publish a release.
- Do not otherwise change `AGENTS.md`; the exact quoting repair is the complete class fix.

## Acceptance criteria

- [ ] `.ops/critic/probe.md` is ignored by the exact `.ops/critic/*.md` rule placed after
      `!.ops/**`.
- [ ] `.ops/incidents.jsonl` remains unignored and trackable.
- [ ] No blanket `.ops` ignore or tracked-plan critic ignore is introduced.
- [ ] CHANGELOG records the incident-backed class fix under Unreleased.
- [ ] The canonical `AGENTS.md` manifest check uses shell-safe string concatenation and retains its
      existing missing/invalid diagnostics.
- [ ] Conflict-marker and template-manifest gates pass.

## Verify

Config/docs-only template change; no runtime or e2e surface.

```bash
ec=0; grep -rn '^<''<<<<<<' --include='*.md' --include='*.yml' --include='*.json' --include='*.jsonl' --include='TEMPLATE_VERSION' . || ec=$?; if [ "$ec" -ne 1 ]; then exit 1; fi
node -e "const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const {execSync}=require('child_process');const tracked=execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!f.startsWith('plans/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>k+':'+v);if(missing.length||invalid.length)process.exit(1)"
grep -qF "map(([k,v])=>k+':'+v)" AGENTS.md || { echo 'canonical manifest gate is not shell-safe' >&2; exit 1; }
git check-ignore -q --no-index .ops/critic/probe.md || { echo 'critic verdict probe is not ignored' >&2; exit 1; }
git check-ignore -v --no-index .ops/critic/probe.md | grep -qF '.ops/critic/*.md' || { echo 'exact critic ignore rule did not match' >&2; exit 1; }
if git check-ignore -q --no-index .ops/incidents.jsonl; then echo 'tracked incident log became ignored' >&2; exit 1; fi
```

## Risk

Tier: auto

Reason: file-precise ignore and changelog update only. The rule aligns the template with the
already-enforced artifact manifest and reduces queue-wedge risk without hiding tracked evidence.

## Notes / risks

- This is an Unreleased structural fix. The normal template release process decides the next
  version/tag; consumer plans may pin this exact commit before a semver release if necessary.
- After merge, separately migrate model-router and synchronize the tracked adopt-project template
  asset. Do not combine those repos into this plan.

## Retry history

- 2026-07-11T00:57:08.194Z stall-retry: plan 021 never started; fresh-number retry avoided
  cross-repo legacy approved-not-merged counter contamination.
- 2026-07-11T01:12:25.849Z stall-retry: captured Verify command deterministically failed because
  Bash consumed JavaScript template-literal backticks; the retry uses shell-safe concatenation and
  explicitly includes the same repair in the canonical `AGENTS.md` gate.
