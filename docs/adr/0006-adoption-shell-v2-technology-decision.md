# ADR-0006: Pure TypeScript adoption shell and release boundary

- **Status:** accepted
- **Date:** 2026-07-24
- **Decider:** Repo Template Manager
- **Decision tier:** human-tier source implementation; producer-owned release
- **Applies to:** the next `repo-template` materializer, validator, capability-bundle, and
  `TemplateRelease` generations

## Authority and evidence

This decision is the complete Technology Decision Proposal required before the first replacement
source plan becomes executable. It binds:

| Input | Immutable identity |
|---|---|
| AI-First Engineering Stack | v1.1.0 at `agent-orchestrator@7264863f88e452c7bedf439b91bf47dbbebc3e49`; producer tree `c58850e1fc38005e923aaff9bb42570ad2bbcecd`; reconstructed file SHA-256 `7c06483e94a3321d7218f83d57c4f0e07b47135180f9e0156eae7c56c450a752` |
| Repo Template manager handoff | SHA-256 `4da29a7c0b22c7c70f769ce235a2b1053f7a00325c8a3de733336b836d4ecf7a` |
| Fleet architecture vision | SHA-256 `9fb84569b047a1c1d302456dc911c018cccca73378a645fb66be37a7fb60d349` |
| Manager coordination protocol | SHA-256 `97e32ed1ba2c267d151ebcc37aae9e87227bf874a7e933029d8dd357ace8b8a4` |
| Shared issue-template migration | SHA-256 `be7194d9aff536134ba56516b9558bf33b058535a72de0d0b323fb4c05966b62` |
| Factory pre-genesis compatibility input | generation `pre-genesis-factory-consumer-baseline:g0001`; raw envelope `7dbf15235e5a6b50046d15d272e4d3365555cf6d595663990a1942b6ac88f818`; five-artifact inventory `cbf068990a21e1a5162752ed0df41017f22352603f9c96b36af496708b2f7440`; four-artifact localization subset `90f2c2d55654cf350cf9231c6b88be8dc9c41b6cd40a5e39b647ec88dd9e8718` |

The Factory baseline is external, sealed, immutable, and zero-authority. It is compatibility input,
not a source of Template semantics, Factory implementation, Registry identity, Genesis authority,
or permission to perform effects.

## Context and concrete problem

The current template has no closed, independently consumable materializer contract. Its prior
Plan 030 lineage proposed JavaScript that discovers repositories, resolves fleet identity, invokes
Git and child processes, fetches mutable tool metadata, writes destination trees, and embeds
Registry, Factory, AO, schedule, activation, and target-repository policy. Those responsibilities
belong to other owners. The historical v1 verifier also imports `node:child_process` and Git, while
its schema mixes portable conformance with model, queue, path, identity, and plan authority.

At the same time, real consumers need more than copied file existence. Issue #92 proves that a
copied executable can advertise a mode while its fixture closure is classified `self`; issue #93
proves that copied documentation can retain a repository-local ADR number or checkout-depth path
whose meaning changes after adoption. Factory and Registry need a release whose exact bytes and
dependency closure can be recomputed without an ambient worktree or network.

The problem is therefore narrow: produce a portable, deterministic, offline-verifiable repository
shell and pure materialization result without importing any concrete fleet identity or performing
any lifecycle effect.

## Product and platform overlay

This is repository engineering tooling, not a product UI, service, daemon, mobile app, browser
extension, or deployable. Its primary runtime is a cross-platform Node.js library executed during
an already-authorized caller transaction. Windows is the current development host; Windows, Linux,
and macOS are supported consumers through Node's portable APIs and path-independent contract bytes.

There is no browser surface, accessibility surface, app store, payment system, authentication
system, customer data, database, network service, port, container, background schedule, or
availability SLO. Those sections of the guide are not silently omitted: they are inapplicable
because the capability has no deployable or persistent data authority.

## Decision

Build `adoption-shell-v2` as a TypeScript-first, ESM, no-runtime-dependency package inside
`repo-template`. Its public core accepts only closed caller-supplied generic values and immutable
payload bytes, then returns an in-memory materialized payload set plus a closed output manifest.

The public core:

- performs no network, Git, GitHub, child-process, credential, environment-discovery, clock,
  random, workspace-resolution, or filesystem operations;
- has no target repository name, owner, origin, default branch, checkout path, Registry row,
  lifecycle, charter, product profile, schedule, activation, queue, model/provider, verification
  command, or handoff field;
- accepts exact schema IDs/versions/digests, a verified release payload-set, sorted capability
  bundle references, and generic conformance flags;
- rejects unknown properties, duplicate or case-fold-colliding paths, traversal, absolute paths,
  unsupported modes/kinds, non-UTF-8 text roles, symlinks, devices, sockets, and special files;
- authenticates every entry hash and every bundle/dependency/fixture closure before producing
  output;
- uses RFC 8785 canonical JSON and named SHA-256 framing algorithms without ambient timestamps;
- returns bytes, per-path role/kind/mode/hash rows, aggregate digest/count, and deterministic
  validation diagnostics; and
- leaves any projection into a supplied empty output root to the effect-owning caller. Factory owns
  that invocation receipt and the actual output-tree digest.

Template owns the release payload-set digest. Factory owns the per-intent invocation receipt that
binds `TemplateRelease` plus Registry intent to the actual materialized output. These digests are
different identities and must never be conflated.

### Repository, package, deployable, and data boundaries

| Boundary | Decision |
|---|---|
| Repository | `repo-template` owns only generic schemas, payload manifests, validators, pure materialization semantics, compiled artifact, fixtures, migrations, and release receipts. |
| Package | One private workspace package, `@repo-template/adoption-shell`, exports the v2 types, validators, canonicalizer/digest helpers, and pure materializer. No package publication is required; a Template release carries exact compiled bytes and closure. |
| Deployable | None. There is no server, job, schedule, container, browser bundle, or host process. |
| Data authority | None. Inputs and outputs are immutable values. No database, durable store, cache authority, or operational journal is created. |
| Effect owner | Callers such as Repo Factory may write returned bytes only under their own separately authorized transaction and receipt. Template code never invokes their transports. |

### Contract and artifact boundaries

The implementation produces:

1. closed JSON Schemas for the materializer input and output-manifest envelopes, each with stable
   schema ID, version, and SHA-256 digest;
2. a closed release payload-set manifest whose sorted rows contain relative path, kind, mode,
   SHA-256 content digest, role, encoding policy, and capability-bundle membership;
3. a closed capability-bundle manifest whose rows bind every executable artifact to its complete
   runtime, dependency, fixture, and golden-test closure;
4. the exact compiled ESM entrypoint and an artifact manifest binding runtime compatibility,
   source closure, compiler version, emitted file hashes, and aggregate digest;
5. a validator entrypoint plus producer fixtures and golden reproducibility receipt; and
6. create-only migration references, initially an explicitly empty sorted set.

`TemplateRelease` publication is a later transaction. It uses
`repo-template/release-receipt/v1`, distinguishes `candidate` from `published`, and treats only
`publicationState=published` as authority. Its canonical body is RFC 8785 JSON in an annotated Git
tag message with:

```json
{
  "receiptTransport": {
    "kind": "annotated-git-tag-message/v1",
    "tagName": "v${string}",
    "targetObjectType": "commit",
    "bodyEncoding": "utf-8",
    "bodyCanonicalization": "rfc8785"
  }
}
```

`tagName` equals the producer tag. Tag-object ID, ref-to-tag-object proof, target-commit proof, and
message-body digest stay outside the canonical body to avoid a self-cycle. The receipt binds SemVer
to the exact landed commit and tree even before publication, contains no ambient-clock field in its
aggregate digest, and names the explicit receipt-digest algorithm.

## Technology and exact mutable versions

The 2026-07-24 bootstrap resolution selected:

| Tool | Exact selection | Evidence / policy |
|---|---|---|
| Node.js | `24.16.0` bootstrap runtime; package compatibility `>=24.16.0 <25` | Official Krypton LTS release; controlled host binary SHA-256 `b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3`. The later release candidate must re-resolve and record its exact Node 24 LTS patch without changing the v2 contract. |
| Corepack | `0.35.0` | Controlled bootstrap runtime. It is tooling only, never a materializer dependency. |
| pnpm | `11.17.0` | npm registry integrity `sha512-zKPOozKtJUu4QUX5ZtGfSHlhUhA0b8kseaBH8joNezzKPDeS8AdrofGDHSd++88KkRmzGppg7Kf7PWIx8zHvcg==`; requires Node `>=22.13`. |
| TypeScript | `7.0.2` | npm registry integrity `sha512-8FYau96o3NKOhbjKi/qNvG/W5jhzxkbdm5sj9AbZ/5T5sWqn3hJgLfGx27sRKZWTvyzCP8dLRBTf5tBTSRVUNA==`. |
| Node types | `@types/node@24.13.3` | npm registry integrity `sha512-Dh8vAsV36ig5wa9OX4pXvMc9D3Veibfw2wix0CUwYODLD8nkj9UsLjASr49nPg+2eKzxhBV+v7L8pXvT4e639Q==`. |

The package lock records complete transitive integrity. Versions are exact, never ranges. Install
scripts are disabled; the selected packages require no approved build-script exception. The public
runtime uses only emitted code plus Node built-ins and therefore has zero npm runtime dependency
closure. A new mutable version requires a governed lock/artifact regeneration and fresh
reproducibility receipt; it does not silently mutate a published release.

## Build versus buy

- **Buy/use:** TypeScript compiler, pnpm lock/install semantics, Node's standard crypto and UTF-8
  primitives. These are mature, narrow, and cheaper to verify than bespoke equivalents.
- **Build:** the small closed-envelope validators, path policy, RFC 8785 canonicalizer, named
  framing digests, bundle-closure checker, and materialization transform. These are the product
  contract and must remain inspectable, dependency-free at runtime, and stable across consumers.
- **Do not buy:** Ajv, a templating engine, a Git wrapper, a filesystem copier, a bundler, or a
  hosted generator. The v2 schemas are intentionally small enough for exact generated/handwritten
  validators; adding a runtime validator or templating framework would enlarge the executable
  closure and create behavior not needed by the contract.

The cost is modest local TypeScript maintenance and golden-vector work. The benefit is an exact
standalone artifact, auditable closure, no install-time code, and no supply-chain/runtime
dependency beyond Node. Revisit only if schema growth makes validator equivalence materially harder
than a pinned, bundled standards implementation.

## Representative implementation shape

```text
packages/adoption-shell/
  src/
    contract.ts
    validate.ts
    canonical-json.ts
    digest.ts
    capability-bundles.ts
    materialize.ts
    index.ts
  test/
    *.test.ts
contracts/adoption-shell-v2/
  *.schema.json
  fixtures/
  golden/
artifacts/adoption-shell-v2/
  *.mjs
  *.d.ts
  artifact-manifest.json
```

The root package exposes stable `build`, `typecheck`, `test`, `verify:artifact`, and `verify`
commands. A clean build emits to an OS-temporary directory and byte-compares every canonical
artifact to the committed artifact manifest. Tests import the committed artifact as a consumer,
not only TypeScript source.

## Alternatives considered

1. **Amend legacy Plan 030/v1 bytes.** Rejected: its network, Git, child-process, path, identity,
   Registry, schedule, and activation semantics cross ratified ownership boundaries; prior approval
   cannot survive the drift.
2. **Copy the three historical v1 artifacts.** Rejected: authenticated readback proved the verifier
   uses child processes/Git and the schema embeds foreign authority. Preserve them only as lineage.
3. **Keep JavaScript for speed.** Rejected for new portable behavior. Existing
   `lint-user-surface-leaks.mjs` is grandfathered only for bounded maintenance until its capability
   is replaced.
4. **Rust or Go single binary.** Rejected: no measured CPU, startup, distribution, or memory need
   clears the guide's TypeScript exception bar; a second toolchain increases migration and review
   cost.
5. **Hosted materializer/service.** Rejected: it destroys offline verification, creates deployment
   and availability authority, and adds credentials/network without user value.
6. **Factory-owned materializer.** Rejected: Factory owns privileged invocation/lifecycle effects,
   not the portable producer contract.
7. **Filesystem-writing Template CLI.** Rejected for v2: even a bounded writer obscures the clean
   seam between pure producer semantics and Factory's effect receipt. An adapter may be proposed
   later only with a new contract and owner review.

## Verification and reproducibility

The merge gate must prove:

- exact lockfile/frozen install with scripts disabled;
- format/lint, TypeScript `noEmit` typecheck, clean compile, Node test suite, and existing Template
  self-verification;
- RFC 8785 published vectors, Unicode/number edge cases, and named digest-vector goldens;
- valid/invalid closed-schema fixtures, unknown-field rejection, deterministic diagnostic order,
  path traversal/case-fold/Windows-reserved-name rejection, and symlink/special-file rejection;
- byte-stable materialization across shuffled input order and repeated fresh processes;
- zero imports of network, Git, child-process, credential, environment, clock, random, or filesystem
  APIs in the public artifact, enforced by AST/import scanning plus runtime tripwire tests;
- every advertised executable mode's complete dependency/fixture closure, including the
  `lint-user-surface-leaks` finding from #92;
- emitted documentation has no bare mutable `ADR-NNNN` authority and no checkout-depth fleet links,
  covering #93;
- no emitted `.github/ISSUE_TEMPLATE/` path in the v2 synthetic release fixture. Current repository
  copies remain untouched until the public `.github` native-selection canary authorizes removal;
- exact compiled artifact rebuild equivalence and consumer import/smoke from only the declared
  closure; and
- final immutable-candidate review by Gemini 3.6 Flash and Grok 4.5 under the ratified availability
  rule. Implementation uses no pre-5.6 GPT model.

GitHub Actions and GitHub App state are advisory and carry no readiness authority.

## Security, privacy, and operations

Inputs are public repository contract bytes and generic flags. Secret-shaped fields, credentials,
URLs for invocation, absolute paths, environment reads, and target identity are rejected by schema.
The materializer neither logs nor persists content. It has no network or service attack surface.
Digest checks authenticate content identity but are not a signature or authorization system.

Operationally there is nothing to deploy, monitor, page, restart, or back up. Release verification
is local and offline from exact Git objects. A malformed input returns a deterministic typed
diagnostic and no partial output. Consumers own their own effect telemetry and rollback.

## Migration, rollback, and exit

This is a breaking `adoption-shell-v2` generation. V1 bytes and their receipts remain immutable
lineage and are never silently reinterpreted. There is no in-place consumer upgrade in the
create-only MVP, so `migrationRefs` is an explicit empty set. Future upgrade semantics remain
Template-owned and require a new versioned contract.

Before publication, rollback is deletion of the unreferenced candidate branch/artifact only. After
publication, tags and receipts are immutable: correct forward with a new SemVer and capability
generation. Factory rollback is capability-selection/invocation rollback under Factory authority,
not a Template mutation. No schedule is enabled or restored by this work.

Exit is straightforward because the schemas, canonical framing, payload bytes, compiled ESM, and
golden fixtures are all repository-owned and runtime-dependency-free. A replacement can implement
the same closed contract and prove byte equivalence, or publish a new version with explicit
migration refs.

## Consequences and release ordering

The first source plan can now be small and owner-pure. It does not create repositories, write
files, call GitHub, register anything, choose verification commands, or activate schedules.

The minimal release train is:

1. land `adoption-shell-v2`, capability/dependency closure, and the #92/#93 regressions;
2. wait for the separately owned public `.github` native-selection canary, then remove the entire
   local `.github/ISSUE_TEMPLATE/` directory and prove no-local-override conformance;
3. publish the generic Template release/annotated-tag receipt against exact landed Git objects; and
4. hand the published release identity to Factory and Registry. They remain the sole owners of
   target intent, lifecycle, output projection, Git/GitHub effects, registration, and activation.

This decision adds no repo, queue, schedule, registration, credential, provider, deployment,
serving, default, rollback, or external-effect authority.
