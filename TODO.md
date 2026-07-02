# Setup survey — complete these, then delete this file

Every item mirrors a `TODO(setup):` marker in the named file. `grep -rn "TODO(setup)"` must reach
zero before the repo is considered loop-ready. Duplicated on purpose: answering in the doc records
the DECISION; this list makes the audit one glance.

## Identity & commands (AGENTS.md)
- [ ] Project description + stack + package manager
- [ ] Test command · Lint command · Build/Run command · Deploy command (+ post-merge redeploy step if the app serves from a container)
- [ ] Verify gate: must exercise EVERY artifact type this repo contains (js→check/test, sh→bash -n, yaml/json→parse, sql→lint, e2e where safe)
- [ ] Environment constraints: does verify need a browser/docker/display? Guard those steps so a missing dependency SKIPS-WITH-NOTICE, never hangs (see ADR-0002)
- [ ] Risk tiers: which paths/changes are `human`-tier for THIS repo

## Design philosophies (docs/adr/0001)
- [ ] Error-handling philosophy (fail-fast vs degrade-with-notice)
- [ ] External side-effects policy (reversibility, rate limits, breakers)
- [ ] Testing depth + what CI blocks vs advises
- [ ] State/data ownership and migration story
- [ ] Dependency posture (vendored? pinned? update cadence?)

## Wiring
- [ ] `.github/workflows/ci.yml`: fill the lint/test steps (CI is ADVISORY here — the merge gate is the orchestrator's local worktree CI)
- [ ] Pre-commit hooks (if any) documented in AGENTS.md — and NEVER able to block WIP-preservation commits (loop uses --no-verify for those by design)
- [ ] Secrets: confirm `.gitignore` covers this repo's token/config patterns; no secret ever committed
- [ ] Register in `agent-orchestrator/projects.json` + create the Windmill drain schedule (adopt-project skill does this)
- [ ] Add to agy `watchlist.tsv` with a focus prompt
