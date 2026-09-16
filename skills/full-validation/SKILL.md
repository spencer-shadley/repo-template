---
name: full-validation
description: >-
  Run the repository's complete authoritative validation suite at an exact commit SHA for
  asynchronous post-land/default-branch health validation and red recovery.
---

# Full validation

Use this skill for exhaustive repository health proof. It is intentionally broader than the
merge-path `pr-validation` contract.

Fresh-read the repository's `AGENTS.md`, package/build metadata, `local-ci.json` when present, and any
repo-owned validation documentation before execution. Fetch the requested SHA and validate from a
clean isolated checkout/worktree whose full HEAD SHA matches it. Never edit source, configuration,
baselines, suppressions, snapshots, generated expectations, or lockfiles to obtain green.

## Resolve the authoritative suite

The repository-local declaration is authoritative. Resolve it in this order without inventing a new
fleet-wide command:

1. If repo-local policy explicitly names an exhaustive/full-validation command or script, run that.
2. Otherwise, if `local-ci.json` declares the repository's authoritative gate and local policy says
   that gate is exhaustive, run that exact command with its declared environment/timeout semantics.
3. Otherwise, if the repository package/build metadata exposes a `verify` entry point documented as
   the complete gate, run it through the repository's pinned package manager/toolchain.
4. Otherwise, run the complete native validation sequence explicitly documented by the repository
   (for example compiler + lint + unit/integration suites + build).
5. If no unique exhaustive authority can be resolved, return `UNABLE` and name the missing/ambiguous
   contract. Do not guess from a subset of convenient commands.

A repo-specific specialization of this skill may name the exact command(s) directly. New/adopted
repositories should specialize it whenever the generic resolution above is not unambiguous.

## Execution constraints

- Bind every result to the exact requested SHA and actual tested SHA.
- Use the existing fleet routing/execution path when the current host does not satisfy OS/toolchain or
  other declared constraints; do not hardcode one fleet machine.
- Exhaustive validation is asynchronous and must not be inserted into every PR merge path merely
  because an occasional escape exists.
- An older green receipt never proves a newer default tip green.

## Result

`PASS` = every authoritative full-validation step passed at the requested SHA. `FAIL` = the suite
executed and an authoritative step failed. `UNABLE` = environment/tooling/checkout or an unresolved
repository contract prevented execution; include the exact unblock.

Emit `full-validation-result-v1` with repository, requested SHA, tested SHA, authoritative command or
command set, result, exit status, elapsed time, environment/host identity, and enough diagnostic
stdout/stderr to support red recovery.
