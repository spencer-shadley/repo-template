---
name: pr-validation
description: >-
  Run the repository-owned minimum validation required before merge. This is deliberately selective
  and latency-conscious; exhaustive asynchronous health proof belongs to full-validation.
---

# PR validation

Use this skill for the merge-path validation contract of the repository that contains it.

Fresh-read the repository's `AGENTS.md`, package/build metadata, `local-ci.json` when present, and any
repo-owned impact/test-selection configuration before running checks. Validate the exact PR/candidate
SHA in an isolated checkout/worktree and report the SHA actually tested.

## Required-before-merge checklist

Run the smallest complete set that proves the changed surface is safe to merge:

1. **Static quality:** run the repository's declared lint/format/static-policy checks that apply to
   the changed files.
2. **Compile/type safety:** run the declared compiler, typecheck, or build check when the changed
   surface can affect compiled/runtime output.
3. **Relevant tests:** use the repository's own affected-test/dependency map when one exists. Otherwise
   run the narrowest deterministic test set that covers the changed package/module/feature. If safe
   relevance cannot be established, fall back to the repository's standard test command rather than
   guessing a smaller set.
4. **Cheap repo-specific integrity checks:** run any repository-declared merge-path checks required by
   `AGENTS.md`, `local-ci.json`, or equivalent local policy.
5. **Platform proof only when applicable:** route to a compatible host when the changed surface or
   repository contract requires an OS/runtime that the current host cannot provide.

Do not automatically run the exhaustive `full-validation` suite before every merge. A post-land
escape is not by itself evidence that this merge-path contract should become heavier.

## Authority and ambiguity

The repository-local declarations are authoritative. Do not invent commands that are absent from the
repo. If two declarations conflict, or a required relevant-test decision cannot be made safely, fail
closed and report the ambiguity so the repository contract can be repaired.

New/adopted repositories should specialize this skill when their merge-path commands or impact rules
cannot be derived unambiguously from local declarations.

## Result

`PASS` means every required merge-path check for the tested candidate passed. `FAIL` means an
applicable required check executed and failed. `UNABLE` means required environment/tooling or an
ambiguous repository contract prevented authoritative validation.

Emit a compact receipt naming repository, candidate SHA, commands/checks run, relevant-test selection
basis, result, environment/host identity, and diagnostic evidence.
