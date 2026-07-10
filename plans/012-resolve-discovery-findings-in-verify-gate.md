# Plan 012: Resolve discovery findings in verify-gate

- **Project:** repo-template
- **Branch:** feat/012-resolve-discovery-findings-in-verify-gate
- **Status:** stalled - plan staleness drift
- **Stall-retries:** 2
- **Last-stall:** stalled - plan staleness drift
- **Priority:** P2
- **Effort:** low

## Objective

Resolve the accepted discovery issues from GitHub triage so the queue can implement the verified finding.

Fixes #33
Fixes #45

## Context

Discovery triage accepted #33, #45 after checking the issue against the named code context.
Relevant files: `AGENTS.md`, `template-manifest.json`.

## Changes

1. In the TEMPLATE-SELF verify-gate block of AGENTS.md, replace the `! grep -rn '<''<<<<<<' ...` line with a set-e-safe form that succeeds only when grep exits 1, e.g. `grep -rn '<''<<<<<<' --include=... . && exit 1; test $? -eq 1` (do NOT use `; [ $? -eq 1 ]` alone — under set -e grep exit 1 aborts before the test)
2. Archive the obsolete stalled plans 010 and 011 so they do not linger in plans/
3. Do not touch the {{VERIFY_GATE_CMD}} placeholder block below /TEMPLATE-SELF
4. In the node -e manifest check in AGENTS.md's TEMPLATE-SELF verify gate, extend the tracked.filter exemption to also skip `plans/` (e.g. `!f.startsWith('plans/')`), or alternatively skip `plans/` while keeping plans/QUEUE.md manifested — pick one and keep template-manifest.json consistent (remove now-redundant per-plan entries if plans/ is fully exempted)
5. Do not touch content below the /TEMPLATE-SELF marker

## Out of scope

- Unrelated refactors, renames, formatting churn, or behavior not needed for the accepted issue.
- Runtime-signal ingestion or discovery lane retuning.

## Acceptance criteria

- [ ] Gate fails when conflict markers exist, fails when grep exits 2, passes when grep exits 1, all under `set -e`
- [ ] {{VERIFY_GATE_CMD}} placeholder section unchanged
- [ ] Plans 010 and 011 archived
- [ ] Verify gate passes with an unmanifested tracked file under plans/ present
- [ ] Gate still fails for unmanifested tracked files outside plans/ and .ops/archive/
- [ ] template-manifest.json has no invalid modes

## Verify

```bash
bash -ec 'd=$(mktemp -d); printf x > "$d/a.md"; cd "$d"; grep -rn zzz --include="*.md" . && exit 1; test $? -eq 1' && grep -c '{{VERIFY_GATE_CMD}}' AGENTS.md | grep -q '^1$'
```

## Risk

Auto tier: discovery triage accepted bounded issue work and the existing queue verify/review gates remain in force.
