# Plan 028: AGENTS.md declares the steering sections BINDING for all agents

- **Project:** repo-template
- **Status:** ready for codex
- **Priority:** P2
- **Effort:** low

## Objective

CEO directive 2026-07-13 (sharingan principles session): every repo's AGENTS.md must ALWAYS point
to its ratified principles as binding steer — so that any agent reading the repo's single source
of truth (interactive or autonomous: discovery, triage, review, implementation, supervision) is
structurally directed to conform to `## Product principles` and `## Responsibilities & non-goals`,
not merely able to stumble on them.

## Context

- The 2.4.0 progressive-disclosure preamble tells readers what AGENTS.md is and where deeper docs
  live, and 2.4.0 made the two steering sections REQUIRED — but nothing declares them BINDING for
  automated agents, and nothing instructs that findings/PRs cite principles. The gap surfaced when
  the CEO asked whether discovery auto-files bugs against sharingan's newly ratified principles:
  the answer was no — reviewers were principle-blind (agy watchlist prompt was hand-patched
  2026-07-13 as an interim fix; the orchestrator-side prompt injection is tracked as
  agent-orchestrator#1223). This plan is the TEMPLATE side of the same class fix.
- Current template state: `AGENTS.md` is manifest `merge`; TEMPLATE_VERSION is 2.5.x — resolve the
  ACTUAL current version at implementation time; this is a MINOR bump.
- Downstream propagation needs no extra work: every queued fleet sync plan (task-dag 183,
  sharingan 017, code 057, gmail-markdown 085, model-router 006, dotfiles 009, orch 408) resolves
  repo-template origin/master at implementation time, so whichever drain runs after this merge
  carries the block automatically; repos that synced earlier catch it on the next drift wave.

## Changes

1. `AGENTS.md` — add a short standing block (<= 10 lines, keeping progressive-disclosure economy)
   immediately after the preamble, titled `## Binding steer`, stating: ALL agents operating on
   this repo — interactive or autonomous (discovery, triage, review, implementation, supervision)
   — MUST read `## Product principles` and `## Responsibilities & non-goals` and treat them as
   binding: (a) a change that violates a ratified principle is a DEFECT even when technically
   correct; (b) work that expands the repo beyond its ratified non-goals is rejected citing the
   charter; (c) findings, issues, and PR descriptions cite the relevant principle by number.
   Include a `TODO(setup!)`-free wording that works for every repo (no repo-specific content).
2. `TEMPLATE_VERSION` — MINOR bump from the current value at implementation time.
3. `CHANGELOG.md` — entry under the new version describing the binding-steer block and its
   motivation (CEO directive 2026-07-13; principle-blind discovery gap).

## Out of scope

- Orchestrator prompt changes (agent-orchestrator#1223 owns injecting these files into
  discovery/triage/critic/reviewer prompts).
- Downstream repo syncs (flow via the pending fleet sync plans / drift pipeline).
- Any change to the steering sections' own required content.

## Acceptance criteria

- [ ] AGENTS.md contains the `## Binding steer` block with the three obligations (defect,
      charter rejection, principle citation).
- [ ] TEMPLATE_VERSION minor-bumped; CHANGELOG documents the change under that version.
- [ ] Template self verify gate stays green.

## Verify

no e2e — docs-only template change.

```bash
node -e "const fs=require('fs');const ag=fs.readFileSync('AGENTS.md','utf8');if(!ag.includes('## Binding steer')){console.error('AGENTS.md missing Binding steer block');process.exit(1)}for(const s of['Product principles','Responsibilities & non-goals','defect','non-goals']){if(!ag.split('## Binding steer')[1].split(/\n## /)[0].toLowerCase().includes(s.toLowerCase())){console.error('Binding steer block missing: '+s);process.exit(1)}}const v=fs.readFileSync('TEMPLATE_VERSION','utf8').trim();if(!/^\d+\.\d+\.\d+$/.test(v)){console.error('TEMPLATE_VERSION not semver');process.exit(1)}const cl=fs.readFileSync('CHANGELOG.md','utf8');if(!cl.includes('## ['+v+']')){console.error('CHANGELOG missing section for '+v);process.exit(1)}if(!/binding steer/i.test(cl)){console.error('CHANGELOG does not document the binding-steer change');process.exit(1)}console.log('binding-steer gate OK')"
```

## Notes / risks

Docs-only, two-way (git revert). Tier: auto. The block must stay generic — repo-specific steer
belongs in each repo's own sections, not the template text.

**Overlap triage (2026-07-13):** pending plan 001 (workspace-context section) also touches
AGENTS.md — it adds a "lives under C:\code" context section; this plan adds the unrelated
`## Binding steer` block. Disjoint additive hunks; drain-order rebase resolves mechanically.
Genuinely distinct — enqueued with --overlap-triaged.

## Risk

Blast radius: one markdown file + version/changelog in the template repo; propagates only via
normal sync plans. Tier: `auto`.

**Tier reconciliation (protected-path promotion acknowledged):** this plan edits AGENTS.md, a
protected path, which promotes the critic's capability tier to critical. Auto tier stands
because: (1) this is the TEMPLATE repo — no live system, no runtime, no media; the edit affects
other repos only when their own sync plans (each separately reviewed and gated) carry it; (2) the
change is a strictly additive, repo-agnostic block — every existing line stays byte-identical,
matching the precedent of prior auto-tier template AGENTS/gate-text edits (plans 020/023 class);
(3) two-way door — git revert restores, and an unwanted propagation is stopped by simply reverting
before repos sync. The loop reviewer must fail the review if the diff modifies any existing
AGENTS.md prose or any file beyond AGENTS.md/TEMPLATE_VERSION/CHANGELOG.md. Operator approval
provenance: CEO directive in chat 2026-07-13 ("this should be a general thing in agents.md — it
should always point to the principles").

## Scope extension (CEO directive 2026-07-13, same day): fleet-wide principle numbering + SLO convention

The CEO ratified a fleet-wide FORM for `## Product principles` (piloted in sharingan plan 017's
review doc) — this plan's AGENTS.md changes must also encode the section spec, applying to EVERY
repo:

1. **Precedence numbering**: principles are a numbered list ordered by precedence — **P1 is the
   strongest; in any conflict the LOWER-numbered principle wins** and the higher yields and
   retries later. The section header states this convention explicitly. Nothing may be inserted
   above P1 without CEO sign-off.
2. **SLI/SLO per principle**: each principle carries an `SLI:` line (what is measured — durable)
   and an `SLO:` line (target — tunable; `report-only` is a valid initial target while
   baselining). An SLO breach is a principle-tagged defect.
3. **Principle-tagged findings**: reviews, discovery issues, and PRs cite principles as `P<n>`
   (machine-parseable), enabling per-principle violation trending (orchestrator side:
   agent-orchestrator#1223).

Verify-gate addition: the gate must also assert AGENTS.md's Product-principles section states the
"lower number wins" convention (e.g. contains the phrase "lower number wins" or "P1 is the
strongest").

Downstream note: repos whose principle sections predate this convention (model-router, dotfiles
completed theirs unordered) become non-conforming at the next template sync — their sync/drift
plans reorder WITH the repo owner's sign-off at merge per their tier; ordering proposals are
agent-drafted, never silently imposed.
