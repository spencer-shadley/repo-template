# Plan 018: Resolve discovery findings in migration-rollout

- **Project:** repo-template
- **Branch:** feat/018-resolve-discovery-findings-in-migration-rollout
- **Status:** ready for user approval
<!-- retry reason: class=stall-retry, source=operator 2026-07-10, detail=verify gate was a literal unexpanded {{VERIFY_GATE_CMD}} template placeholder; replaced with the AGENTS.md repo gate (conflict-marker grep + manifest check). 19 identical env stalls in 14h. -->
- **Priority:** P3
- **Effort:** low

## Objective

Resolve the accepted discovery issues from GitHub triage so the queue can implement the verified finding.

Fixes #18
Fixes #20
Fixes #22
Fixes #24

## Context

Discovery triage accepted #18, #20, #22, #24 after checking the issue against the named code context.
Origin: fleet.
Relevant files: `docs/MIGRATION.md`.

## Changes

1. Replace 'the canary's next drain cycle added no … lines' with a concrete non-trivial window, e.g. N consecutive clean drain cycles or a 24h clean-drain window before declaring green.
2. State the window explicitly so a single clean 5-min cycle cannot satisfy the gate.
3. Add a concrete heuristic for classifying an .ops/incidents.jsonl line as migration-attributable, e.g. incident area/path matches a file touched by the migration PR, or rootCause references a feature introduced by the bump.
4. Reference the migration PR's changed-file set as the attribution surface.
5. Either move the canary designation to machine-readable config (a template-manifest.json field or a CANARY file) referenced by the doc, or add an explicit rule for when/how the default canary is re-validated and updated.
6. Note the selection criterion (smallest verify surface) so a stale default is detectable.
7. Add an 'if the canary goes red' subsection: block fleet rollout, open a P1 issue against the template, and choose revert-the-canary-PR vs hotfix-and-rerun.
8. Tie the red trigger to the same green criteria (verify failure or migration-attributable incidents).

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] The green definition specifies a concrete observation window (count of consecutive clean drains or a time bound), not a single drain cycle.
- [ ] The wording makes the fleet-wait gate resistant to delayed/first-run-after-restart failures.
- [ ] The rollout section states an unambiguous, agent-applicable rule for deciding whether an incident counts against the canary.
- [ ] No remaining reliance on the undefined phrase 'attributable to the migration' without a rule.
- [ ] The canary default is config-driven or paired with an explicit re-validation/update rule.
- [ ] The doctrine no longer depends on an unqualified hardcoded repo name that can silently go wrong.
- [ ] The rollout section defines the failure path with at least: halt fleet rollout, escalate (P1 template issue), and a stated recovery action.
- [ ] Green and red criteria reference the same attribution/observation definitions.

## Verify

```bash
ec=0; grep -rn '^<''<<<<<<' --include='*.md' --include='*.yml' --include='*.json' --include='*.jsonl' --include='TEMPLATE_VERSION' . || ec=$?; if [ "$ec" -ne 1 ]; then exit 1; fi
node -e "const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const cp=require('child_process');const NL=String.fromCharCode(10),CR=String.fromCharCode(13);const tracked=cp.execSync('git ls-files',{encoding:'utf8'}).split(NL).map(s=>s.split(CR).join('')).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!f.startsWith('plans/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>k+':'+v);if(missing.length||invalid.length){if(missing.length)console.error('unmanifested:',missing);if(invalid.length)console.error('invalid manifest modes:',invalid);process.exit(1)}"
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
