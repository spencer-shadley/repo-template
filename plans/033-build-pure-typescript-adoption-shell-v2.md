# Plan 033: Build pure TypeScript adoption-shell-v2

- **Project:** repo-template
- **Branch:** feat/033-build-pure-typescript-adoption-shell-v2
- **Status:** ready for codex
- **Priority:** P1
- **Depends:** none
- **Effort:** high
- **Model:** critical
- **Risk tier:** L0 local-source (complex bounded slice)
- **Implementation model:** GPT-5.6-sol only; never invoke a pre-5.6 GPT model
- **External critics:** optional only if owner judgment finds them proportionate; not an L0 gate
- **Architecture decision:** `docs/adr/0006-adoption-shell-v2-technology-decision.md`
- **Issues:** #85, #89, #92, #93

## Objective

Land the smallest owner-pure `adoption-shell-v2`: a closed, deterministic TypeScript contract and
exact compiled artifact that turns verified generic Template payload bytes into an in-memory output
payload set with zero network, Git, GitHub, child-process, filesystem, credential, identity,
lifecycle, or other external effects.

This is the portable producer foundation that unblocks the later generic Template release and its
Factory/Registry consumers. It does not publish a release or create, name, write, register, enroll,
schedule, activate, or verify any concrete repository.

## Risk and execution lane

**L0 local-source.** This adds executable source, schemas, a lockfile, and a breaking v2 contract,
but publishes no release, activates no consumer, and has no credential, provider/network, GitHub
mutation beyond its own Git landing, registration, schedule, deployment, migration, shared writer,
or capability-cutover effect. Keep this plan as the complex slice's bounded specification and use
one manager-owned isolated worktree, the complete deterministic gate, an ordinary non-force landing,
and one lightweight exact-byte/check/no-effect/rollback receipt. A pull request, queue round trip,
preregistration, or external critic is not an L0 prerequisite. The repo-template discovery schedule
remains disabled and this plan grants no schedule re-enable authority.

The implementation ladder is explicitly all `gpt-5.6-sol` rungs. The critical marker makes any
credit/failure fallback park fail-closed instead of invoking a non-GPT-5.6 implementer. Any default
ladder containing GPT 5.5 or older is forbidden for this plan. External review remains available
through Gemini 3.6 Flash and Grok 4.5 if owner judgment finds it proportionate, but the superseding
direct-L0 authority makes it optional for these reversible repo-contained bytes.

## Bound inputs and current state

The accepted source architecture baseline is:

- commit `2499fd5511e921deedc67aa59550fe946469f036`; and
- tree `c5545e1c14fcb7b695ae82df68edc2bab306b102`.

Begin the governed retry worktree from the exact post-admission execution base:

- commit `8b76bb5680cc4c9dc9b974345e859ca82f80955f`;
- tree `2838ae81f3ea49ef80d9dc30c6757515545fdb17`;
- empty queue blob `bc942d4c39842cc7d534475de0c2481d2c5b323a`; and
- zero open pull requests at execution-base readback.

The commits between the architecture baseline and execution base are manager metadata/admission
and append-only incident preservation/weekly rotation only; they add no source, package, release,
schedule, provider, deployment, or serving behavior.

The first governed `gpt-5.6-sol@xhigh` turn was preserved as non-authoritative WIP commit
`0aeb8e36b6e0e5fd71e3869c1f7e395e37d61512`, tree
`5f45b0ac9b09d5bafa4150460c8468dc78df2c66`. Its source was never reviewed and its gate did not
reach project code: Git Bash invoked the extensionless Windows Corepack shim, whose internal MSYS
path conversion produced `C:\c\Program Files\...` and failed with `ERR_MODULE_NOT_FOUND`. On the
fresh retry, inspect that exact WIP diff as a draft recovery input, reapply only in-scope useful
bytes, complete the still-missing plan surfaces, and correct anything the deterministic gates find.
Do not treat the WIP commit, its changed plan status, or its partial artifact set as acceptance.

The second governed `gpt-5.6-sol@xhigh` turn is preserved as non-authoritative WIP commit
`f7beec183f230209dc2916b1a73cbaf1ee833c42`, tree
`9828d72e2c138900edb103a14a7453111a3de659`. Its 28-file candidate reached the project gate, where
`typecheck` passed and `build:check` failed before artifact construction because the directly
executed TypeScript tool imported `packages/adoption-shell/src/index.ts`, whose ESM graph uses
compiled `.js` specifiers; Node therefore could not resolve source-only `contract.js`. The
orchestrator's generic `ERR_MODULE_NOT_FOUND` rule misclassified this candidate defect as a host
environment fault and stalled after one identical retry. On the fresh retry, recover the useful
in-scope bytes from this exact WIP, correct the TypeScript source/tool execution seam under the
declared closed runtime and dependency closure, then complete every still-missing test, fixture,
artifact, documentation, and manifest surface. Do not weaken the ESM build contract, replace the
gate with a source-only shortcut, or treat the preserved WIP or its partial `typecheck` result as
acceptance.

Authority inputs:

- AI-First Engineering Stack v1.1.0 at
  `agent-orchestrator@7264863f88e452c7bedf439b91bf47dbbebc3e49`, file SHA-256
  `7c06483e94a3321d7218f83d57c4f0e07b47135180f9e0156eae7c56c450a752`;
- accepted ADR-0006, which contains the complete §34 Technology Decision Proposal;
- Template manager handoff SHA-256
  `4da29a7c0b22c7c70f769ce235a2b1053f7a00325c8a3de733336b836d4ecf7a`;
- current fleet architecture/protocol/reporting SHA-256
  `b02d64fbd7d28b6a814d937bbfa58a700f5ee680bfc01fc1bb12e9e073734022` /
  `6fa0168fd3cf7c793927794ac22c0cc4663fda4106779b1fadadbe81f7690d78` /
  `2e48b488e757515ce0b34d61b7c7ea0d80fa3fd24a6b6915968f00a486e48697`;
- the newly ratified `MeaningfulDeliveryV1` portable declaration requirement is a separately
  governed Template-owned follow-on before initial release publication; it does not expand this
  active plan's adoption-shell-v2 candidate;
- `PreGenesisFactoryConsumerBaselineV1` generation
  `pre-genesis-factory-consumer-baseline:g0001`, raw envelope
  `7dbf15235e5a6b50046d15d272e4d3365555cf6d595663990a1942b6ac88f818`,
  inventory `cbf068990a21e1a5162752ed0df41017f22352603f9c96b36af496708b2f7440`,
  localization subset `90f2c2d55654cf350cf9231c6b88be8dc9c41b6cd40a5e39b647ec88dd9e8718`;
  it is external zero-authority compatibility input, never copied Template semantics; and
- public issue-template migration SHA-256
  `be7194d9aff536134ba56516b9558bf33b058535a72de0d0b323fb4c05966b62`.

The existing `.github/ISSUE_TEMPLATE/task.md` blob
`1383ad89b6bdccc6369c490d27a8326fa05f49cc` is predecessor-era lineage. Do not edit, delete, move,
or use it as canonical content. Its entire directory is removed only after the separately owned
public `.github` native-selection canary.

## Ownership contract

Repo Template owns only:

- generic closed schemas and pure validators;
- versioned release payload-set, capability-bundle, artifact, and verification shapes;
- deterministic canonicalization/digest algorithms;
- exact compiled materializer/validator artifact and producer fixtures/goldens;
- generic no-local-template-override conformance; and
- future versioned migration references and Template release receipts.

It does not own:

- target repository/GitHub identity, owner, origin, default branch, checkout path, charter,
  membership, profile, lifecycle, or capability ownership;
- Registry rows or publication;
- Factory invocation/effect journals, actual output-root writes, Git/GitHub operations, repo
  creation, upgrade, enrollment, activation, rollback, or final output-tree digest;
- AO orchestration, plan/queue selection, verification-command selection, review transport,
  schedules, leases, processes, host execution, credentials, deployment, or serving;
- issue-template content, issue mutation, labels, retries, or GitHub transport; or
- any product, model-provider, billing, database, or runtime-service behavior.

Unknown or foreign fields fail closed. No convenience field may smuggle these responsibilities
back into a generic envelope.

## Changes

### 1. Exact TypeScript workspace and build boundary

Add:

- `package.json`;
- `pnpm-lock.yaml`;
- `.npmrc`;
- `tsconfig.json`;
- `tsconfig.build.json`; and
- any narrowly required `.gitignore` entries for `node_modules/` and noncanonical temporary build
  output.

Requirements:

1. Private ESM package, exact `packageManager: pnpm@11.17.0`, Node compatibility
   `>=24.16.0 <25`, and exact dev dependencies only:
   `typescript@7.0.2` and `@types/node@24.13.3`.
2. Lock every transitive package and integrity. Install scripts are disabled and there is no
   build-script allowlist entry.
3. Runtime dependency count is zero. The compiled artifact may import only explicitly allowed
   side-effect-free Node built-ins needed for hashing/encoding; `node:crypto` is expected.
4. Stable commands: `typecheck`, `build`, `build:check`, `test`, `verify:artifact`, and `verify`.
   The root `verify` composes every new artifact check plus the existing repo-template self gate.
5. Update only the Template-self verify block in `AGENTS.md` to the stable root gate; do not alter
   the copied adopter instructions below `<!-- /TEMPLATE-SELF -->` except where another acceptance
   criterion explicitly requires it.

### 2. Closed v2 schemas and named digest algorithms

Add under `contracts/adoption-shell-v2/`:

- `materializer-input.schema.json`;
- `materializer-output-manifest.schema.json`;
- `release-payload-set.schema.json`;
- `capability-bundle.schema.json`;
- `artifact-manifest.schema.json`;
- `verification-receipt.schema.json`; and
- a compact `README.md` defining schema IDs, versions, producer ownership, digest domains, and
  forbidden foreign fields.

Every schema uses a stable absolute `$id`, Draft 2020-12 declaration, `additionalProperties: false`
at every object boundary, bounded arrays/strings/counts, exact enums, and local-only references.
Schemas and validators must agree on:

- lowercase SHA-256 hex;
- SemVer grammar without mutable aliases;
- ASCII portable relative paths with `/` separators, no `.`/`..`, absolute/rooted/drive/UNC paths,
  control characters, trailing dot/space segments, Windows reserved basenames, duplicate paths, or
  case-fold collisions;
- entry kind exactly `file` for v2; symlink/device/socket/special kinds are rejected;
- mode exactly `100644` or `100755`;
- role and UTF-8/binary encoding policy;
- sorted unique capability bundle IDs/versions/digests;
- explicit empty `migrationRefs` for create-only v2; and
- deterministic, sorted diagnostic codes and JSON pointers.

Define and test:

- `rfc8785` canonical JSON;
- `sha256-rfc8785-v1` for closed JSON envelopes; and
- `sha256-framed-path-kind-mode-content-v1` for payload entries, using an unambiguous documented
  length-prefixed byte frame and sorted portable paths.

Aggregate digests exclude their own digest field and all ambient-clock values. No created/updated
timestamp is part of a canonical v2 envelope or digest.

### 3. Pure TypeScript package

Add focused modules under `packages/adoption-shell/src/`:

- `contract.ts` — exported v2 types and constants;
- `canonical-json.ts` — RFC 8785 implementation with non-finite/unsupported value rejection;
- `digest.ts` — named SHA-256 envelope and payload framing;
- `validate.ts` — closed semantic validators and deterministic diagnostics;
- `capability-bundles.ts` — bundle/dependency/fixture/golden closure verification;
- `materialize.ts` — pure in-memory materialization; and
- `index.ts` — the only public export surface.

No substantially modified source file may exceed 500 lines; split cohesive helpers before that
point. The public API accepts plain immutable values and content bytes represented by a closed
portable encoding. It returns a new immutable output value and never mutates caller inputs.

`materializeAdoptionShellV2()` must:

1. validate the exact input schema/version and verified Template release pointer;
2. authenticate every release payload entry and aggregate;
3. authenticate every requested bundle, dependency, fixture, golden, and artifact reference;
4. reject payload entries not owned by a selected bundle or generic base role;
5. return byte-identical selected content plus the canonical output manifest/digest/count; and
6. return no filesystem path, command, target identity, or effect instruction.

There is no templating/substitution in v2. Newly created repositories begin as an inert generic
shell; target-specific edits happen later under the target manager's custody. Template's release
payload-set digest remains distinct from Factory's later per-intent output-tree digest.

The public source and compiled artifact must have no imports or dynamic access for:

- `node:child_process`, Git, GitHub, `gh`, shell execution, or process spawning;
- `node:fs`, `node:path`, directory traversal, output-root writes, or ambient worktree reads;
- `node:http`, `node:https`, sockets, DNS, `fetch`, or any network client;
- environment variables, credentials, home/workspace discovery, current working directory;
- `Date`, timers, random values, UUID generation, locale-dependent collation, or host-specific path
  normalization; or
- Registry, Factory, AO, Host, Control Plane, queue, schedule, provider, or deployment modules.

### 4. Exact compiled artifact and reproducibility closure

Commit canonical emitted ESM and declarations under `artifacts/adoption-shell-v2/`, plus
`artifact-manifest.json`.

The manifest binds:

- contract ID/version;
- exact source file rows and digests;
- exact TypeScript, Node compatibility, and package-manager selections;
- exact compiled entrypoint and validator export;
- every emitted path/kind/mode/hash/byte length;
- runtime dependency count `0`;
- complete fixture/golden closure;
- named aggregate algorithm and digest; and
- compatible release receipt kind `repo-template/release-receipt/v1`.

`build:check` compiles from a clean source set to a fresh OS-temporary directory, compares the
sorted path set and every byte/digest with the committed artifact, and removes only its owned temp
directory. It may use filesystem APIs in the development-only verification harness; those APIs
must not enter the public compiled artifact. The harness performs no Git, network, child-process,
credential, or external-repository operation.

Tests import and exercise the committed artifact from only its declared closure. Source-only green
tests are insufficient.

### 5. Producer fixtures, goldens, and negative effects

Add fixtures under `contracts/adoption-shell-v2/fixtures/` and goldens under
`contracts/adoption-shell-v2/golden/` covering:

- smallest valid generic base shell;
- multiple sorted capability bundles;
- shuffled input order producing identical canonical bytes;
- RFC 8785 number, string, Unicode, and key-order vectors;
- every path/mode/kind/encoding rejection;
- unknown property, duplicate/case-fold collision, content-digest mismatch, aggregate mismatch,
  missing dependency, missing fixture, missing golden, and unowned-entry rejection;
- no-local-issue-template-override rejection for any
  `.github/ISSUE_TEMPLATE` path or case variant;
- target identity, GitHub, Registry, lifecycle, schedule, activation, queue, provider, credential,
  absolute path, verification command, and clock fields rejected as unknown; and
- two fresh-process-equivalent runs represented by independently reconstructed inputs and
  byte-identical golden receipts.

Add static import scanning and runtime tripwires that fail if the public artifact accesses a
forbidden API. Development tests may read committed fixtures but must not spawn commands, use the
network, mutate Git/GitHub, or write outside their owned OS-temp directory.

### 6. Capability closure class fix for issue #92

Add one closed capability-bundle registry for the current portable payload. Express the
`user-surface-lint` capability as an atomic bundle containing:

- `scripts/lint-user-surface-leaks.mjs`;
- `.user-surface-lint.json`;
- `.user-surface-lint.schema.json`; and
- every fixture required by the advertised `--self-test` mode.

Change the seven `tests/fixtures/user-surface-lint/**` manifest entries from `self` to `copy`.
The v2 closure validator and a materialized-consumer fixture must prove both advertised modes:

- `node scripts/lint-user-surface-leaks.mjs --config .user-surface-lint.json`; and
- `node scripts/lint-user-surface-leaks.mjs --self-test`.

If the existing legacy script needs a bounded maintenance correction to run from an arbitrary
consumer root, make only that correction in the existing `.mjs`; do not add new JavaScript
capability logic. A negative fixture must fail when any executable bundle advertises a mode whose
dependency/fixture closure is absent or `self`.

### 7. Portable documentation class fix for issue #93

Correct `docs/INCIDENTS.md`, `docs/adr/0004-when-to-use-a-real-database.md`, and only directly
related documentation so:

- every ADR authority reference names and links the exact decision title instead of using a bare
  mutable `ADR-NNNN` token;
- the fleet incident catalog uses a checkout-depth-independent canonical HTTPS link, never
  `../../agent-orchestrator/...`;
- `docs/MIGRATION.md` states that copied template ADRs keep their identity/title and adopters
  supersede rather than reuse an existing number; and
- an adoption fixture with an unrelated local ADR 0003 cannot pass if inherited prose falsely
  attributes incident/file-format authority.

The v2 validator checks emitted relative documentation links exist within the payload and optionally
checks a linked ADR heading matches the explicit link text. It must not resolve a workspace path or
network URL.

### 8. Manifest, documentation, and changelog integration

Update `template-manifest.json` for every new tracked file:

- package/build/source/test/contract/golden/canonical artifact files are `self` unless explicitly
  part of a portable capability bundle;
- user-surface-lint fixture closure is `copy`; and
- no new mode is invented in this plan.

Keep the current local `.github/ISSUE_TEMPLATE/task.md` path and bytes unchanged. Do not add any
file under `.github/ISSUE_TEMPLATE/`.

Update:

- `CHANGELOG.md` `[Unreleased]` with the breaking v2 foundation and #92/#93 fixes;
- `docs/ARCHITECTURE.md` only if needed to point from repo-template's current system map to
  ADR-0006 and the pure contract; and
- `AGENTS.md` Template-self verification instructions.

Do not bump `TEMPLATE_VERSION`, add a release heading, create/tag a version, or set
`publicationState=published`; the later release plan owns those changes.

## Out of scope

- Editing, deleting, replacing, or claiming authority over any issue-template content.
- Calling `gh`, filing/updating/closing issues from source, managing labels, or GitHub transport.
- A filesystem-writing materializer or CLI; Factory owns projection effects.
- Target repository answers, names, origins, paths, branches, charters, profiles, or membership.
- Registry schemas/rows/publication, Genesis, Factory implementation, repo creation or upgrade.
- Git initialization, commits, branches, tags, pushes, pull requests, or release publication from
  materializer code.
- Queue/adoption plan generation, verification-command selection, review orchestration, scheduling,
  host execution, enrollment, activation, canary jobs, or emergency recovery.
- Credentials, provider/model invocation, product code, UI, database, deployment, serving, billing,
  telemetry services, or external evidence-store writes.
- Existing-repository upgrade semantics; v2 is create-only with closed empty migration refs.
- Physical checkout relocation (#84).
- Weekly changelog rotation from #90; no evidence currently justifies that machinery.
- Refactoring unrelated legacy documentation or the existing lint script beyond a necessary bounded
  #92 compatibility repair.

## Acceptance criteria

- [ ] The exact toolchain, lockfile, package, repository, deployable, data-authority, and effect
      boundaries match ADR-0006.
- [ ] All new source is TypeScript; no new `.js`/`.mjs` source or non-TypeScript runtime is added.
- [ ] The public compiled artifact has zero runtime npm dependencies and no forbidden imports or
      ambient/effect APIs.
- [ ] Every closed schema has stable ID/version/digest, rejects unknown/foreign authority, and
      agrees with deterministic TypeScript validation.
- [ ] RFC 8785 and both named SHA-256 algorithms pass published/committed golden vectors and
      order-independence tests.
- [ ] Identical verified inputs produce byte-identical output values and receipts across
      independently reconstructed runs; no timestamp, random value, locale, path, environment, or
      worktree leaks into output.
- [ ] The release payload manifest expresses per-path kind/mode/hash/role/encoding/bundle plus
      aggregate digest/count; symlink and special-file policy is producer-owned and fail-closed.
- [ ] The materializer input and output schema IDs/versions/digests, exact compiled
      artifact/entrypoint/runtime compatibility, validator entrypoint, fixtures/goldens, and
      executable dependency closure are all content-addressed.
- [ ] `TemplateRelease` payload identity is explicitly distinct from Factory's future invocation
      and actual output-tree identities.
- [ ] Issue #92 is fixed as a class: every advertised user-surface-lint mode works from the exact
      materialized closure, and the negative missing-closure fixture fails.
- [ ] Issue #93 is fixed as a class: no bare mutable ADR authority or checkout-depth fleet link
      remains in emitted docs, and the unrelated-ADR/nested-checkout fixture passes.
- [ ] Synthetic v2 payloads reject local `.github/ISSUE_TEMPLATE/` overrides, while the current
      predecessor local `task.md` blob remains byte-identical and undeleted pending the external
      public canary.
- [ ] Existing Template self verification remains green through the stable root gate.
- [ ] `TEMPLATE_VERSION`, tags, releases, queues, schedules, registration, credentials, providers,
      deployments, serving, and all external repos remain unchanged.
- [ ] One immutable L0 receipt binds the landed commit/tree and changed-path digest, every check
      result, explicit zero-effect counters, and the ordinary revert rollback ref.

## Verify

```bash
set -euo pipefail
corepack_bin=corepack
if command -v corepack.cmd >/dev/null 2>&1; then corepack_bin=corepack.cmd; fi
"$corepack_bin" pnpm install --frozen-lockfile --ignore-scripts
"$corepack_bin" pnpm typecheck
"$corepack_bin" pnpm build:check
"$corepack_bin" pnpm test
"$corepack_bin" pnpm verify:artifact
"$corepack_bin" pnpm verify
git diff --check
test "$(git hash-object .github/ISSUE_TEMPLATE/task.md)" = "1383ad89b6bdccc6369c490d27a8326fa05f49cc"
test "$(git rev-parse HEAD:TEMPLATE_VERSION)" = "$(git hash-object TEMPLATE_VERSION)"
```

No deploy, browser, Docker, service smoke, or E2E: this is a pure offline library/contract with no
deployable or user interface. The tests and exact artifact consumer smoke are the behavioral gate.

After the deterministic gate passes, freeze the candidate commit/tree and emit the lightweight L0
receipt described above. External critics are optional under owner judgment; if invoked, use only
Gemini 3.6 Flash and Grok 4.5 against identical immutable bytes and never override an actual
negative. GitHub Actions/App status is never substituted for the local exact-byte gate receipt.

## Rollback and idempotency

- Before landing, discard only the plan-owned isolated candidate worktree/branch.
- After landing but before release, revert the single source commit if the v2 contract is invalid;
  no external consumer or effect has been activated.
- Published v1 lineage is never rewritten or deleted. This plan publishes no tag or release.
- Re-running build/tests against the same source and lock must reproduce identical artifacts and
  receipts. Any digest mismatch fails closed.

## Approval provenance

- **sourceKind:** human-chat
- **human:** Spencer Shadley
- **approvedAt:** 2026-07-23/24 PT repo-split charter and boundary delegations
- **scope:** bring repo-template to the ratified portable standard; new source TypeScript-first;
  preserve exact owner boundaries; land reversible repo-contained source under direct L0
- **decision:** approved under the sole Repo Template manager's bounded direct-L0 lane, with
  proportionate deterministic proof and zero external effects
