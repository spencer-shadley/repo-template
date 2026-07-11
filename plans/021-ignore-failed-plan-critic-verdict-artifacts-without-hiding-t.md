# Plan 021: Ignore failed plan-critic verdict artifacts without hiding tracked ops

- **Project:** repo-template
- **Branch:** feat/021-ignore-failed-plan-critic-verdict-artifacts-without-hiding-t
- **Status:** ready for codex
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

## Changes

1. `.gitignore` — after the broad `.ops` re-includes, add `.ops/critic/*.md`. Revise the nearby
   “keep LAST” wording so it accurately says file-precise transient re-ignores may follow, while
   blanket `.ops/` ignores remain forbidden.
2. `CHANGELOG.md` — add an Unreleased Changed entry citing the observed queue-abort-dirty class and
   the canonical artifact-manifest ownership. Do not cut a template release in this plan.
3. Confirm `template-manifest.json` still accounts for every tracked template file; no new manifest
   entry should be necessary because only existing tracked files change.

## Out of scope

- Do not ignore `.ops/`, `.ops/**`, `.ops/incidents.jsonl`, or tracked `plans/*.critic.md`.
- Do not delete existing local critic reports; they remain useful diagnostics and become invisible
  to Git status through the exact rule.
- Do not modify model-router, task-dag, agent-orchestrator, or the adopt-project skill in this
  cross-repo plan. Each consumer/sync change gets its own governed plan after this class fix lands.
- Do not bump `TEMPLATE_VERSION`, create a tag, or publish a release.

## Acceptance criteria

- [ ] `.ops/critic/probe.md` is ignored by the exact `.ops/critic/*.md` rule placed after
      `!.ops/**`.
- [ ] `.ops/incidents.jsonl` remains unignored and trackable.
- [ ] No blanket `.ops` ignore or tracked-plan critic ignore is introduced.
- [ ] CHANGELOG records the incident-backed class fix under Unreleased.
- [ ] Conflict-marker and template-manifest gates pass.

## Verify

Config/docs-only template change; no runtime or e2e surface.

```bash
ec=0; grep -rn '^<''<<<<<<' --include='*.md' --include='*.yml' --include='*.json' --include='*.jsonl' --include='TEMPLATE_VERSION' . || ec=$?; if [ "$ec" -ne 1 ]; then exit 1; fi
node -e "const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const {execSync}=require('child_process');const tracked=execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!f.startsWith('plans/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>`${k}:${v}`);if(missing.length||invalid.length)process.exit(1)"
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
