# Plan 042: secret-scan history: pass core.longpaths to the Betterleaks git child so Windows deep-worktree scans complete

- **Project:** repo-template
- **Branch:** feat/042-secret-scan-history-pass-core-longpaths-to-the-betterleaks-g
- **Status:** ready for implement
- **Issue:** spencer-shadley/repo-template#466
- **WorkItemId:** 566a295c-566a-4b11-a295-6b11d5ac566a
- **Filed against:** ce0a93d0a6f855c960bac8f0fca2d16fcbe3bf66 (origin/master)
- **Filed-against commit time:** 2026-09-30T14:18:20-07:00
- **Filed at:** 2026-10-01T13:12:06.064Z
- **Priority:** P2
- **Effort:** low
- **Style card:** cli-heavy, coding-heavy, test-heavy, review-heavy
- **Style scores:** cli-heavy=0.70, coding-heavy=0.70, test-heavy=0.60, review-heavy=0.55, ux-heavy=0.15, frontend-heavy=0.15, docs-heavy=0.15, debug-heavy=0.15, architecture-heavy=0.15
- **Style scored at:** 2026-10-01T13:13:56.597Z
- **Style scorer:** work-style-scorer@heuristic
- **Concurrency:** parallel-safe
- **Scope-write:** packages/repo-quality/secret-scan.ts,packages/repo-quality/secret-scan.mjs,packages/repo-quality/package.json,packages/adoption-shell/test/repo-quality-secret-scan.test.ts,CHANGELOG.md
- **Scope-read:** packages/repo-quality/export-surface.json,scripts/build-repo-quality-npm.ts
- **Scope-resource:** none
- **Service class:** short

## Plan audit history

## Objective

Make `secret-scan.mjs history` complete a full scan on Windows when the consumer worktree path is deep and
`node_modules` is installed, so the consumer `verify` secret step stops failing as a partial scan
(spencer-shadley/code#7235).

## Context

- Wrapper source: `packages/repo-quality/secret-scan.ts`; published entrypoint `packages/repo-quality/secret-scan.mjs`
  is generated from it (`// @generated from secret-scan.ts. DO NOT EDIT.`).
- Existing test: `packages/adoption-shell/test/repo-quality-secret-scan.test.ts`.
- Observed on rinnegan, Betterleaks 1.9.0 via the `.cmd` shim, repo-quality `ce0a93d0`, cwd
  `C:\Users\spenc\AppData\Local\agent-orchestrator\worktrees\code-review-code-7247-drain0557` (90 characters),
  spencer-shadley/code at `2f17fa3846c7f9264f41fcae78a0caf9d533fb46`:
  - `secret-scan.mjs history` prints `ERR failed to scan Git repository error="git stderr: warning: unable to access
    'node_modules/.pnpm/@typescript-eslint+eslint-plugin@8.65.0_…/node_modules/typescript/.gitattributes': Filename too long; …"`,
    then `WRN partial scan completed in 28.8s`, `WRN no leaks found in partial scan`, exit 1. 2 of 2 runs.
  - `git config --show-origin --get-all core.longpaths` prints `true` from both `C:/Program Files/Git/etc/gitconfig` and
    `C:/Users/spenc/.gitconfig`, so the git child that Betterleaks starts does not honour the host setting.
  - With `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.longpaths GIT_CONFIG_VALUE_0=true` exported before the wrapper, the
    same scan completes fully (565.92 MB in 28.3 s): `no leaks found`, exit 0.
- Ruled out: a 30-second timeout (the full scan takes the same time) and real findings (the full scan is clean).
- Why the host setting is not honoured was not established. The env injection is the proven remedy.

## Changes

1. `packages/repo-quality/secret-scan.ts` — give the final scan `spawnSync` an `env` that copies `process.env` and
   appends `core.longpaths=true` through `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n`, at index
   `n = Number(process.env["GIT_CONFIG_COUNT"] ?? 0)` so caller-supplied entries are preserved. Applying it on every
   platform is acceptable (the setting is a no-op off Windows); restricting it to `win32` is also acceptable.
2. `packages/repo-quality/secret-scan.mjs` — regenerate from the `.ts` using the repository's existing generator; do not
   hand-edit.
3. `packages/adoption-shell/test/repo-quality-secret-scan.test.ts` — add a test that the scan child receives
   `core.longpaths=true` through `GIT_CONFIG_*` and that pre-existing caller `GIT_CONFIG_*` entries survive.
4. `packages/repo-quality/package.json` and `CHANGELOG.md` — patch version bump and changelog entry, following the
   convention the #464 change used.

## Out of scope

- Any change to `--confidence high --redact`, the probe, or the exit-3 behaviour for an unsupported Betterleaks.
- Repinning consumers (spencer-shadley/code repins separately under code#7235).
- The `--verbose` change owned by repo-template#465.
- Changing host git configuration.

## Acceptance criteria

- [ ] The scan child process environment contains `core.longpaths=true` via `GIT_CONFIG_COUNT`/`KEY`/`VALUE`.
- [ ] Caller-supplied `GIT_CONFIG_COUNT` entries are preserved, with the new entry appended after them.
- [ ] `secret-scan.mjs` matches what the generator produces from `secret-scan.ts`.
- [ ] All three commands still pass `--confidence high --redact`; an unsupported Betterleaks still exits 3.

## Verify

```bash
corepack pnpm typecheck && corepack pnpm lint && node --test packages/adoption-shell/test/repo-quality-secret-scan.test.ts
```

No e2e — tooling only. Manual check after a consumer repins: on rinnegan, in a worktree whose path is at least 90
characters with `node_modules` installed, `pnpm secret:history` prints no `partial scan` line and exits 0.

## Risk

- **Tier:** auto
- **Rationale:** Reversible source-only change to a scan wrapper's child environment; it adds a git setting and removes
  no scanner rule, so it cannot hide a finding. Reverts cleanly.

## Work-item bounds

- **Success:** Change merged to repo-template `origin/master` with the Verify gate green and repo-template#466 closed.
- **Terminal failure:** Verify cannot go green within the repair budget, or the env injection is shown not to reach the
  Betterleaks git child; evidence recorded on repo-template#466, which stays open.
- **Deadline:** 2026-10-08T13:00:00Z
- **Repair-round budget:** 2
- **TTL:** implement, verify, exact-head review, at most 2 repair rounds, all before the deadline.
- **Rollback:** Revert the merge commit; consumers keep the caller-side `GIT_CONFIG_*` override as the workaround.

## Notes / risks

- `GIT_CONFIG_COUNT` needs git 2.31 or newer; older git ignores it, which leaves today's behaviour.
