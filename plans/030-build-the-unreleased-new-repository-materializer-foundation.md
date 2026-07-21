# Plan 030: Build the unreleased new-repository materializer foundation

- **Project:** repo-template
- **Branch:** feat/030-build-the-unreleased-new-repository-materializer-foundation
- **Status:** draft - blocked on AO Plan 423 exact landed receipt
- **Priority:** P1
- **Depends:** 028, 029
- **External dependency:** agent-orchestrator/423
- **Effort:** high
- **Plan 028 landed SHA:** c75dcd9ff1aacd56628a8bfd88fe7b8fa40fb5b2
- **Plan 029 landed SHA:** 4fa4dac50f8a9e4769f0ad58fe0dd2efedb3ce0c
- **AO Plan 423 landed SHA:** pending

## Risk

**Tier: human.** Enqueue with `--no-queue` and run through the one-off governed lane. This plan adds
networked executable tooling, writes destination trees, and changes inherited AGENTS, CI, package,
and verification surfaces. The operator's direct request is approval provenance for this work, not
an auto-tier override. The implementation receives independent review and merge approval under the
repository's human lane; it does not require Spencer to repeat the commission.

## Objective

Turn AI-First Engineering Stack v1.0.0 into one deterministic, unreleased foundation for creating a
**brand-new** product repository. A fixture canary must produce a validated pre-Git repository with:

- exact toolchain and source provenance;
- the required root-family skeleton and machine-readable product decisions;
- no repo-template self-state or operational evidence;
- a single generated verification entrypoint; and
- byte-stable create/noop/drift behavior with fail-closed publication.

This plan deliberately does not release the template, enroll a repository, enable autonomy, or
migrate an existing tree. Plan 031 owns the live canary, version/tag, real enrollment proof, and
issue #85 closure after every production consumer exists.

The executable consumer order is explicit and acyclic:
`Plan 030 foundation -> Code Plan 059 adoption consumer -> refreshed Plan 020 feedback contract ->
Plan 031 release canary`. Plan 031's release receipt gates ordinary later production adoption; it is
not a Plan-059 implementation or landing prerequisite. Plan 020 lands before the release so the
materialized canary proves the issue form and idempotently provisioned label catalog as part of the
same immutable template version.

## Context and ownership

- Implements the repository side of repo-template issue #85 and the ratified guide at
  `agent-orchestrator/docs/AI-FIRST-ENGINEERING-STACK.md` v1.0.0.
- Plan 028 establishes binding responsibilities, non-goals, and `P<X>.<Y>` principles; Plan 029
  removes known transient checkout dirt without hiding incident evidence. Both are landed at the
  exact SHAs recorded above; their archive/status text is not authority.
- Agent-orchestrator Plan 423 is the exact Phase-A producer for fleet registry schemas, schema IDs,
  lifecycle values, logical identities, and registry validation/resolution receipts. It was
  durably drafted at origin commit `077dcbf`; this plan may be prepared now but may implement only
  after Plan 423 lands and the landed validation receipt is bound to its immutable producer SHA and
  content hashes. This plan consumes that contract and does not invent a second fleet schema.
- Agent-orchestrator Plan 389 already landed the canonical workspace resolver
  `resolveProjectDirectory()` and its exact `status/source/dir/workspaceRoot/reason` result. The
  adoption consumer calls that owner and wraps its result with producer SHA plus a canonical hash;
  this plan validates the receipt but never recreates path resolution.
- Agent-orchestrator Plan 424 owns production consumption of repo-local `local-ci.json` by
  `effectiveVerifyGate` and `localCiGreen`. Until that lands, this foundation proves only its own
  fixture contract and cannot satisfy the terminal scheduled-canary gate.
- Code issue #404 adds only the fleet-registry pointer and the responsibilities/non-goals/product-
  principles interview. Code Plan 059 is the separate human-tier consumer linked to AO #1278; it
  owns invoking this materializer from the adoption skill, collecting the full input packet once,
  initializing external operational state, and idempotently reconciling the label catalog consumed
  by Plan 020.
- The external `.ops` migration's primitive/store plans are not the cutover. The terminal release
  is blocked until the reusable new-repository initializer and the externally stored operational-
  state contract are complete. Generated docs refer to its logical CLI/resolver interface without
  tracking live `.ops` telemetry. The canonical `ops-store-activation/v1` journal is authority;
  `.store-active` is only a derived cache/receipt and can never activate or recover authority by
  existence.
- The 2026-07-21 manager re-baseline retired Plans 001, 006, 010, 011, 012, 014, 016, 021, 023, and
  032 into the archive with a machine-readable disposition ledger. Their remaining useful intent is
  consolidated here or in Plan 020; no later cleanup framework is a release dependency.
- `engineering-stack-compatibility.json` remains `releaseState: "unreleased"` in this plan.
  Normal production materialization must refuse an unreleased, dirty, or non-exact template source.
  Tests may exercise the foundation only through explicit fixture provenance.

## Changes

### 1. Root package, exact toolchain policy, and stable commands

Add `package.json`, `.npmrc`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `turbo.json`.

1. `package.json` is private ESM and pins:
   - `packageManager` to exact `pnpm@x.y.z`;
   - `engines.pnpm` to that exact pnpm version;
   - `engines.node` to the supported semver range for the selected Active-LTS major; and
   - exact devDependency versions, including `markdownlint-cli2`, Ajv 2020-12 support, a bounded
     YAML parser, and the pinned official `mermaid` package. Diagram validation calls
     `await mermaid.parse(text, { suppressErrors: false })` directly; it does not render SVG,
     invoke Mermaid CLI, require a DOM/browser, or trigger Chromium download.
2. Expose these stable commands:
   - `bootstrap` — thin materializer CLI;
   - `bootstrap:canary` — OS-temp fixture canary with guaranteed cleanup;
   - `validate` — template contract validation;
   - `verify` — the one generated-repository entrypoint;
   - `docs:lint` — Markdown lint + real Mermaid parse/compile + mutable-version lint;
   - `test` — focused Node tests.
3. Keep `.npmrc` limited to registry/authentication-safe settings. Put pnpm behavior in
   `pnpm-workspace.yaml`:

   ```yaml
   minimumReleaseAge: 10080
   minimumReleaseAgeStrict: true
   minimumReleaseAgeIgnoreMissingTime: false
   engineStrict: true
   nodeVersion: "<resolved exact Node version>"
   strictDepBuilds: true
   dangerouslyAllowAllBuilds: false
   allowBuilds: {}
   ```

   A non-empty `allowBuilds` entry is permitted only when a pinned dependency demonstrably needs a
   build script and the same change adds its exact package selector, rationale, negative test, and
   expected artifact. Never permit arbitrary scripts. The resolved pnpm version must support every
   exact listed setting; schema/behavior probes fail the implementation rather than silently omit,
   rename, or approximate an unsupported key.
4. The materializer creates a lock in staging using the generated package-manager version,
   `install --lockfile-only --ignore-scripts`, and `cwd=staging`. It validates the full allowlist
   and publishes no `node_modules`. Fixture-selected pnpm and every generated bootstrap
   dependency/version must equal the root packageManager and a subset of the root lock. Before the
   first fixture materialization, the canary derives that expected dependency set without writing,
   proves the subset, primes a dedicated OS-temp pnpm store from the root lock, and switches to an
   intentionally unreachable registry. Fixture-mode staging lock creation must itself use
   `--offline --store-dir <dedicated-store>` in addition to `--lockfile-only --ignore-scripts`;
   the later generated-tree install uses
   `--offline --frozen-lockfile --store-dir <dedicated-store>`. Production lock generation instead
   consumes Plan 031's separately bounded and receipt-bound production resolution path. No
   global/default store or unrecorded network fallback may satisfy either fixture operation.
5. Future pin changes are explicit governed updates owned by the AO #1278 compatibility/audit
   route. No adopted repository silently follows a mutable upstream version.

### 2. One complete input packet and strict document modes

Add `schemas/bootstrap-input.schema.json` and
`schemas/release-prerequisites.schema.json`. `--input <file>` is the sole noninteractive product
answer packet and is reusable by the adoption consumer. It covers every must-answer surface:

- repository and package name, one-line purpose, responsibilities, non-goals;
- two to five ratified `P<X>.<Y>` principles with SLI, SLO, decider, and decision date;
- platform roles, stack/deployment decisions, exact commands and gate applicability;
- external-service constraints and frozen infrastructure namespace;
- model boundary, user surfaces, tutorial/design-sync contract, telemetry;
- autonomy tier, human triggers, and default effort;
- logical project/registry identities and the canonical resolver/registry receipt hashes.

The input schema uses JSON Schema 2020-12, Ajv strict mode, `additionalProperties: false`, bounded
strings/arrays/files, repository/package-name grammar, no path separators in logical names, no NUL
or control characters, and no credential/secret fields. External GitHub, branch-protection,
watchlist, permissions, schedule, and autonomy-enablement decisions remain enrollment effects and
are not materializer inputs.

Every bootstrap YAML/JSON document has `documentMode: template | materialized`.

- Template branches permit only the exact `__MUST_ANSWER__` sentinel at explicitly named schema
  pointers.
- Materialized branches require the real type and forbid all bootstrap sentinels.
- The role enum contains exactly `primary`, `secondary`, `accessory`, `specialized`, `dormant`,
  and `not-targeted`; the sentinel is never a seventh role.
- Schemas use local-only `$ref`, `additionalProperties: false`, and bounded YAML aliases.

The release-prerequisites schema is the already-landed contract that Plan 031 later uses for its
metadata-only readiness amendment. It is JSON Schema 2020-12, strict and closed, with:

- `schemaVersion: 1` and `kind: "repo-template-release-prerequisites/v1"`;
- exact foundation plan/source/content-tree/materializer-contract identities;
- the exact prerequisite IDs `ao-stack-registry`, `ao-local-ci`, `code-adoption`,
  `workspace-resolver`, `external-ops`, `schedule-truth`, and `worker-capacity`;
- for each prerequisite, project identity, non-empty plan numbers and landed SHAs, closed
  schema-identity/version/hash rows, receipt hashes, and named readbacks; and
- a canonical prerequisite-set digest.

The production validator enforces the exact prerequisite-ID set, SHA/hash grammar, global
uniqueness, canonical ordering/digest, and no ambient path/timestamp/status/prose authority.
Plan 030 tests valid and tampered synthetic fixtures but does not commit
`plans/031.prerequisites.json`; Plan 031 later commits only that data after the real immutable
receipts exist.

### 3. Product controls and canonical registry consumption

Add:

- `product-platform.yaml` and schema;
- `technology-registry.overlay.yaml` and schema;
- `component-registry.overlay.yaml` and schema;
- `local-ci.json` and schema;
- `engineering-stack-compatibility.json` and schema;
- `.mutable-version-lint.json` and schema.

Requirements:

1. Platform records carry role, integer priority, rationale, owner, acceptance suites, guide
   bootstrap/audit versions, and explicit grandfathered divergences. `dormant` requires a revisit
   trigger; `not-targeted` requires rationale.
2. Registry overlays reference exact AO Phase-A logical IDs, schema IDs/versions, content hashes,
   and registry receipt hash. They persist no physical workspace/orchestrator path. Lifecycle values
   are exactly:
   `preferred-default`, `context-preferred`, `supported-alternative`, `candidate`,
   `legacy-compatibility`, `discouraged`, and `prohibited`.
   Each AO Plan-423 resolution-receipt item is authoritative for lifecycle state, disposition,
   package, version policy, source references, and entry digest. Product overlays may add only
   product context, priority, rationale, selected version stamp, and evaluation evidence/route;
   they cannot rewrite canonical authority fields or convert `blocked` or `evaluation-required`
   into `resolved`. A fleet-unknown candidate stays eligible when it has an evaluation owner,
   deadline or review trigger, evidence target, and exit criteria. Preserve trial-by-fire:
   each `evaluation-required` item deterministically generates an implementation-ready evaluation
   plan outside `QUEUE.md`, bound to the resolution receipt and explicitly classified against the
   packet's target autonomy/human-trigger policy plus current protected-path classifier. After
   enrollment succeeds, policy-auto evaluations enter Pending automatically through the standard
   authorized auto lane. Human-tier evaluations stay outside Pending and use the already-carried
   commission when it covers their exact effects; they do not trigger a new interview or repeated
   product approval. The materializer never enqueues a plan, changes the declared autonomy policy,
   or decides merge authority. Only a canonical `blocked` disposition prevents materialization.
3. `local-ci.json` contains each stable gate ID exactly once:
   `format-lint`, `compiler-static`, `unit`, `integration`, `production-build`,
   `api-event-compatibility`, `secret-detection`, `critical-vulnerabilities`,
   `migration-safety`, `accessibility`, `platform-smoke`, `store-manifest`, `performance`,
   `exhaustive-e2e`, and `documentation-exemption`.
   Each gate disposition is `required`, `not-applicable`, `report-only`, or `asynchronous`.
   `required` has a command and timeout. `not-applicable` has platform predicate, rationale, owner,
   and revisit trigger. Only performance may be report-only and an SLO breach is red. Only
   exhaustive E2E may be asynchronous and it requires issue, notification, owner, rollback, and
   retreat routes. Semantic validation enforces exact set cardinality and applicability.
   Its executable handshake is exactly
   `schemaVersion: 1` plus `execution: { shell: "bash", command: "corepack pnpm verify" }`, matching
   the later AO production consumer. Rich gate metadata remains in the same document but does not
   create a second executable command source.
4. The empty product scaffold's generated CI runs `pnpm verify`, whose initial applicable contract
   is bootstrap/docs/schema/structure validation. It does not claim DB, runtime build, store, or
   deployment coverage before adoption supplies those commands.
5. Compatibility metadata contains guide identity/version/commit/blob hash, AO contract schema
   identities, materializer-contract version, and `releaseState: "unreleased"`. It cannot contain
   its own eventual template commit. Runtime source SHA/version belongs in the generated receipt.
6. Mutable-version policy contains exactly the reviewed guardrail numerals PowerShell 7, WSL2, and
   Manifest V3, each with a non-empty platform review trigger. Immutable IDs and fixture exclusions
   are separate closed classes.

### 4. Required root-family skeleton and executable manifest

Add a tracked README or `.gitkeep` under each required root family:

- `apps/`
- `services/`
- `native/`
- `tools/`
- `packages/`
- `database/`
- `infrastructure/`

Keep the family globs harmless when they contain no packages. Do not infer app/service/worker/native
leaf topology from platform roles and do not generate product code.

Make `template-manifest.json` executable input with exactly four modes:

- `copy` — copy the committed blob;
- `merge` — copy then substitute only schema-declared fields;
- `self` — never emit into a product repository;
- `generated` — synthesize then read back and validate.

Production reads blobs from the exact clean source commit, not ambient working-tree bytes. The
materializer must:

- strip the `TEMPLATE-SELF` block from `AGENTS.md`;
- omit repo-template live/draft/archive plans, plan sidecars, tests/fixtures, materializer source,
  `.ops/incidents*`, `.ops/archive`, other runtime evidence, `template-manifest.json`, and
  `TEMPLATE_VERSION`;
- retain a generated `.ops/README.md` only as a logical pointer to the future external ops contract;
- generate fresh `plans/QUEUE.md`, `plans/ROADMAP.md`, `plans/drafts/000-smoke.md`, and
  `plans/archive/.gitkeep`;
- make the smoke plan emit a durable enrollment-receipt/status artifact outside `.ops`; and
- generate `.template-sync.json` with exact source version/commit, manifest identity, guide
  identity, materialized time, and no `_setup` field.

No copied source `.ops` dirt may appear in output. A generated repository may not claim
`enrolled`, `scheduled`, or `loop-ready`; `.bootstrap-receipt.json` proves only `materialized`.

### 5. Resolver and toolchain resolution

The materializer accepts one machine-produced receipt around Plan 389's exact canonical resolver
result: `status`, `source`, `dir`, `workspaceRoot`, and `reason`, plus logical project identity,
configured relative path, producer commit, and digests. It fails unresolved. The full execution
receipt containing absolute paths stays in external adoption evidence. The generated portable tree
stores only logical identity, configured relative path, producer commit, and a `portableDigest`
computed from those fields plus status/source/reason; that projection excludes `dir` and
`workspaceRoot`. Resolved absolute paths are execution inputs only and are excluded from normalized
portable inputs, tree hashes, and committed output. Do not import or duplicate AO workspace
path-discovery logic.

Production toolchain resolution:

1. Read the official Node Release Working Group `schedule.json` and Node distribution `index.json`.
   At one injected clock instant, identify the single current **Active LTS** line from the schedule,
   then select the newest exact release in that major from the distribution index.
2. Read official npm registry metadata for pnpm and select `dist-tags.latest` plus its exact version
   record/integrity.
3. Enforce bounded timeout/retries, successful status, expected content type, maximum response
   size, schema/semver checks, raw-response SHA-256, selected-record canonical SHA-256, and no local
   installed-version fallback.
4. Run a preflight proving the host can execute the generated engine before publication.
5. Retrieval timestamps and raw hashes are evidence; drift identity is the canonical selected
   resolution object, not unrelated upstream metadata changes.

Hermetic tests use recorded responses or a local HTTP fixture server through the exact paired flags
`--test-mode --allow-fixture-provenance`, an injected clock, and synthetic clean source identities.
That pair alone admits fixture provenance and an unreleased source; either flag alone is rejected,
and either flag is rejected in production mode. Fixture output stamps `sourceMode: "fixture"`.

### 6. New-only materializer, publication, and receipt semantics

Keep `scripts/materialize-bootstrap.mjs` a thin CLI over focused modules for input/schema
validation, resolver/toolchain selection, manifest expansion, Windows-safe publication, receipt
hashing, and validation. Do not create a monolith over the repository's 1,000-line soft limit.

Destination state machine:

1. **create** — destination is absent. Generate and publish once.
2. **noop** — destination has a valid receipt, normalized inputs and selected resolution are
   identical, and every stamped content byte matches. Return read-only status with
   `wroteBytes: 0`.
3. **drift** — a valid stamped destination differs in inputs, resolution, or bytes. Return a
   structured diff with `wroteBytes: 0`.
4. Any other existing destination is rejected unchanged.

There is no `--adopt-existing`, refresh, in-place update, or existing-repository migration mode.

Publication on Windows:

- canonicalize the nearest existing destination parent with native path semantics;
- reject `..`, case-insensitive boundary escape, drive/UNC escape, and symlink/junction/reparse
  traversal; recheck containment immediately before publication;
- acquire an exclusive same-parent lock and create a unique sibling staging directory on the same
  volume;
- write the full stage, create the lockfile with `cwd=staging`, validate and read back every output,
  close handles, fsync files, and attempt directory fsync;
- treat only documented unsupported directory-fsync errors as unsupported and record that result;
- rename the complete stage only to an absent destination;
- on failure clean only the owned stage/lock in `finally`; never overwrite or delete a product
  destination.

Tests cover two-process contention and injected write, lockfile, validation, fsync, reparse, and
pre-rename failures. One creator may win; every loser is a deterministic non-writer.

Receipt definitions:

- `contentTreeHash` hashes sorted normalized `/` paths plus file type, executable policy, byte
  length, and bytes for every published file except `.bootstrap-receipt.json`; exclude `.git`,
  `node_modules`, and transients. Executable policy comes from the manifest/source Git blob mode,
  never ambient Windows filesystem mode.
- `receiptHash` hashes the RFC-8785-canonical receipt with `receiptHash` omitted.
- The receipt records source template SHA/version, guide and AO-contract identities, resolver
  receipt hash, selected toolchain object, raw evidence hashes, normalized input hash,
  `outputInventory` for every published file except `.bootstrap-receipt.json`, content-tree hash,
  validation result, and publication/fsync result. The receipt is verified through `receiptHash`;
  it never attempts to embed its own byte hash.
- Production timestamps are written only during create. Fixture time is injected. Noop/drift never
  mutate audit fields. Tests also compare a full byte-tree hash including the finished receipt.

### 7. Validator, docs lint, tests, and inherited operating contract

Add `scripts/validate-template.mjs` plus cohesive helpers.

- Template mode enumerates `git ls-files -z` and fails red if Git enumeration fails.
- Materialized mode recursively enumerates the actual destination and requires exact set equality
  with `outputInventory` plus `.bootstrap-receipt.json`; missing, extra, symlink,
  junction/reparse, or special entries are red. It has no Git dependency.
- Both modes read bytes themselves, NUL-detect binary files, and scan every textual file for
  line-start conflict markers independent of extension. Template mode verifies source
  blob/manifest identities; materialized mode verifies the receipt's per-file inventory hashes.
- Schema validation, manifest coverage/modes, required scaffolds, exact gate IDs/dispositions,
  registry-contract identity, compatibility state, toolchain/lock coherence, self-state absence,
  receipt hashes, and portable-path prohibitions are fail-closed.
- Materialized mode rejects `__MUST_ANSWER__`, every `{{...}}`, `TODO(setup)`, and `TODO(setup!)`.
  Optional product decisions must be explicit `n/a` or a deferred record with owner and trigger.

Add real Markdown and diagram checks:

- `markdownlint-cli2` is pinned with committed config;
- every Mermaid fence in manifest-selected prose is passed to the pinned `mermaid.parse()` syntax
  boundary with errors unsuppressed; rendering is not part of this repository-only lint gate;
- mutable-version lint uses named immutable/fixture/plan/incident/changelog exclusions, never an
  open extension skip;
- conflict scanning still covers all tracked text, including excluded prose classes.

This all-text, NUL-aware validator contract is the consolidated replacement for Plan 023. It is not
permitted to regress to an extension allowlist.

Add fixtures and focused tests for every role/lifecycle/gate disposition, unknown-candidate
evaluation, AO schema receipt compatibility, Node Active-versus-Maintenance LTS selection, pnpm
selection/integrity, bad HTTP/size/semver/clock cases, source provenance refusal, input bounds,
manifest modes, pre-Git validation, conflicts in extensionless/UTF-8/binary files, Mermaid failure,
mutable versions, create/noop/drift, exact tree/receipt hashes, frozen offline install,
unallowlisted install-script refusal, dedicated-store/no-network negative space, contention, reparse
paths, and injected rollback failures.

Update `AGENTS.md`, `README.md`, `TODO.md`, `.github/workflows/ci.yml`,
`docs/ARCHITECTURE.md`, `docs/MIGRATION.md`, `docs/QUEUE-ENROLLMENT.md`,
`docs/adr/0002-verify-gate-contract.md`, `CHANGELOG.md`, and `template-manifest.json`.

Fold forward Plan 001's still-useful operating intent:

- separate repository Git ownership and inherited root-AGENTS precedence;
- governed queue, incident CLI, template-drift subscription, discovery, and triage services;
- logical project identity and resolver receipts rather than `C:\code\<repo>`,
  `../AGENTS.md`, or `../agent-orchestrator`.

Validator assertions—not prose review—prove command/link/manifest agreement and forbidden path
absence. Add an Unreleased entry. Do not change `TEMPLATE_VERSION` or create a tag.

## Out of scope

- Critic consumption, quarterly audits, or adoption-skill changes from later AO #1278 phases.
- Making repo-local `local-ci.json` authoritative in AO runtime; a separate AO human-tier consumer
  plan owns that cross-fleet behavior.
- The `code` adoption-skill consumer, Git/GitHub creation, registry enrollment, branch protection,
  permissions, schedules, runners, drains, autonomy enablement, or a real merge.
- Completing/cutting over the external `.ops` store contract.
- Existing-repository adoption, refresh, in-place mutation, or migration.
- Product leaf topology, application code, deployment infrastructure, credentials, or services.
- Flipping `releaseState`, bumping `TEMPLATE_VERSION`, tagging, or closing issue #85.
- Rewriting or deleting historical plan evidence; the 2026-07-21 disposition ledger and archived
  bytes are immutable audit inputs.

## Acceptance criteria

- [ ] Plan 028, Plan 029, and AO Plan 423's exact landed registry/resolver contract are landed and
      their immutable SHAs, schema hashes, and validation-receipt hash are pinned.
- [ ] Root package metadata and lock are exact; the resolved pnpm proves every listed setting and a
      seven-day `minimumReleaseAge`; unallowlisted dependency scripts cannot execute.
- [ ] One complete input packet covers every setup marker and produces no unresolved marker.
- [ ] Template/materialized schema modes are strict, local-only, bounded, and independently tested.
- [ ] Platform roles, registry lifecycle values, candidate evaluation, mutable guardrails, and all
      15 local-CI gate IDs/dispositions are exact and semantically validated.
- [ ] The seven root families contain tracked manifest-covered sentinels.
- [ ] Manifest modes drive output; product output contains no template self-state, plan history,
      tests/materializer, live `.ops` evidence, `TEMPLATE_VERSION`, or physical workspace paths.
- [ ] Fresh queue/roadmap/smoke/archive and `.template-sync.json` are generated and read back.
- [ ] Production resolution uses official Node schedule+index and npm pnpm metadata with bounded
      fetches and canonical selected-record hashes; fixtures run the identical parser.
- [ ] Production refuses unreleased/dirty/non-exact source; fixture provenance is explicit and
      rejected without the validation override.
- [ ] Destination behavior is exactly create/noop/drift/reject; no existing tree is mutated.
- [ ] Same-parent atomic publication, exclusive locking, reparse/escape checks, contention, and
      injected rollback failures pass on Windows.
- [ ] `contentTreeHash`, `receiptHash`, and full byte-tree comparisons prove noop/drift write zero
      bytes; independent fixed-clock fixture generations are byte-identical.
- [ ] Materialized validation succeeds without `.git`, verifies its receipt inventory, and catches
      conflicts in every textual format while ignoring binary bytes.
- [ ] Pinned Markdown/Mermaid/mutable-version checks fail closed without implicit browser setup.
- [ ] A generated repository installs frozen/offline and passes its own `pnpm verify`.
- [ ] Compatibility state remains `unreleased`; `TEMPLATE_VERSION` is unchanged; Plan 020 and Plan
      031 exist, remain blocked on exact receipts, and name this Plan 030 dependency.
- [ ] The closed Plan-031 prerequisite schema and production validator land before any readiness
      fixture; valid/tampered synthetic fixtures prove exact-set and digest enforcement.

## Verify

No materializer production lookup, GitHub, enrollment, schedule, or product E2E occurs in this
foundation gate. The root dependency install and dedicated-store priming are the bounded bootstrap
network steps. `bootstrap:canary` owns the detailed OS-temp lifecycle so early failure cannot dirty
the checkout:

```bash
git diff --check &&
base="$(git merge-base origin/master HEAD)" &&
test "$(cat TEMPLATE_VERSION)" = "$(git show "${base}:TEMPLATE_VERSION")" &&
corepack pnpm install --frozen-lockfile &&
corepack pnpm docs:lint &&
corepack pnpm validate &&
corepack pnpm test &&
corepack pnpm bootstrap:canary
```

`bootstrap:canary` must:

1. create a unique root with `fs.mkdtemp()` under `os.tmpdir()` and remove only that root in
   `try/finally`;
2. derive the fixed fixture's expected generated manifest without writing, prove its pnpm/dependency
   set is an exact subset of the root lock, prime a dedicated temp store, and set the registry to an
   intentionally unreachable endpoint before either materialization;
3. materialize identical fixed packet/toolchain/source/resolver/clock inputs into two distinct absent
   destinations using `--test-mode --allow-fixture-provenance`; require fixture staging lock creation
   to use the same dedicated store and offline/unreachable-registry controls;
4. validate both pre-Git outputs, exact intended-file inventories, self-state omissions, and
   `status=created, sourceMode=fixture`;
5. compare the two complete byte-tree hashes including finished receipts and require exact equality;
6. rerun identical input against one destination, assert `noop`/`wroteBytes=0`, and prove its bytes
   remain unchanged;
7. run changed input against that destination, assert `drift`/`wroteBytes=0`, and prove its bytes
   remain unchanged;
8. `cd` into each generated tree, run
   `corepack pnpm install --offline --frozen-lockfile --store-dir <dedicated-store>`, then
   `corepack pnpm verify`; assert no default/global store or network access;
9. prove each fixture flag alone is rejected; a no-flag production invocation rejects fixture
   provenance and an unreleased source; the exact paired flags enter test mode and stamp
   `sourceMode: "fixture"`—the paired invocation is never classified as production;
10. prove an unallowlisted install script cannot execute; and
11. inject staging/publication failures plus two-process contention and prove the destination is
    either absent or one fully valid output, never partial.

## Terminal dependencies and rollback

Plans 020 and 031 are the named same-repository dependents. Plan 020 first consumes Code Plan 059's
landed label-reconciliation contract and then lands the canonical feedback form/catalog. Plan 031
remains blocked on:

1. AO Plan 423's landed registry/schema/resolution receipt contract;
2. AO Plan 424's repo-local `local-ci.json` runtime consumer, proven through `effectiveVerifyGate` and
   `localCiGreen`;
3. Code Plan 059, the human-tier adoption-skill consumer;
4. Plan 389 resolver readback plus a nonlegacy relocation/path-independence proof using exact
   resolver receipts; physical closure of repo-template issue #84 is audit-only when that proof is
   green;
5. the exact landed external `.ops` store/publish/cutover/readback plan receipts named in the
   terminal plan (not broad issue status); and
6. a real newly generated repository enrollment plus one scheduled-drain merge.

Only the terminal plan may first invoke production-mode live Node/pnpm resolution as release
evidence, flip compatibility to `released`, bump `TEMPLATE_VERSION`, tag, enroll the real canary,
close #85, and publish the release receipt. Rollback before that terminal is a normal git revert:
no released compatibility signal or template version advertises this foundation to downstream
repositories.

## Notes

- This is one atomic foundation because package/lock, schemas, manifest, generator, validator,
  docs, and tests are mutually dependent; splitting them would make master clonable in a state it
  cannot validate.
- The human tier protects a cross-repository generator while retaining operational autonomy: the
  accepted orchestrator can implement, review, and merge it under its delegated lane without
  another design decision from Spencer.
- Existence is not function. The bootstrap receipt says `materialized`; separate adoption receipts
  prove registration, schedule readback, gate execution, and a real autonomous merge.
