# adoption-shell-v2 contract

Repo Template owns this create-only, pure producer contract. All six schemas use Draft 2020-12,
stable absolute IDs under `https://schemas.repo-template.dev/adoption-shell-v2/`, version `2.0.0`,
closed object boundaries, bounded values, and only same-directory or fragment references. Their
exact byte digests are bound by `artifacts/adoption-shell-v2/artifact-manifest.json`.

`materializer-input` carries a verified `release-payload-set`, a closed `capability-bundle`
registry, sorted requested bundle references, and mandatory no-local-issue-template and
no-pre-custody-workflow conformance flags. `materializer-output-manifest` describes only returned
in-memory bytes.
`artifact-manifest` binds the exact compiler, source, schema, emitted, fixture, and golden closure.
`verification-receipt` proves two independently reconstructed runs without a clock.

Digest domains:

- `rfc8785` is UTF-8 RFC 8785 canonical JSON. Unsupported values, non-finite numbers, sparse
  arrays, cycles, non-plain objects, and lone Unicode surrogates fail closed.
- `sha256-rfc8785-v1` hashes the RFC 8785 bytes of a closed envelope after removing only that
  envelope's own aggregate-digest field.
- `sha256-framed-path-kind-mode-content-v1` sorts entries by portable ASCII path, then concatenates
  four fields per entry: `u64be(length) || bytes` for UTF-8 path, UTF-8 kind, UTF-8 mode, and raw
  content. SHA-256 hashes the resulting frame.

Aggregate digests never contain timestamps. Paths are portable ASCII relative paths with `/`
separators; traversal, rooted/drive/UNC paths, controls, trailing dot/space segments, Windows
reserved basenames, duplicates, case-fold collisions, non-files, and local
`.github/ISSUE_TEMPLATE/` overrides fail closed. Pre-custody `.github/workflows/` entries also
fail closed so a newly created repository cannot execute Template seed workflows before its manager
acquires custody. V2 modes are `100644` and `100755`; text roles require valid UTF-8 and binary
content requires `generic-base-binary`.

`migrationRefs` is exactly empty because v2 creates inert generic shells only. Target identity,
GitHub, Registry publication, lifecycle, queue, schedule, activation, verification commands,
credentials, providers, clocks, filesystem destinations, and effect instructions are foreign
authority and therefore rejected as unknown fields. Template's release payload digest is
deliberately distinct from a future Factory-owned per-intent output-tree identity.

## Delivery measurement v1

The same dependency-free artifact exports pure validators for two additional closed portable
schemas:

- `delivery-event` records append-only stable work/outcome identity, per-stage model/token usage,
  landed or non-delivery evidence, declared meaningful class, verified SLO deltas, human-message
  primary attribution, and explicit coverage errors.
- `delivery-declaration` binds domain-owned meaningful classes, the complete token-attribution
  boundary, anti-gaming exclusions, all six required repo/plane/fleet SLI identities, target/budget/
  window/exception/revisit references, and the central rollup reference.

Commits, plans, pull requests, documentation, receipts, review attempts, elapsed turns, and token
consumption alone are activity, never meaningful delivery. Coverage errors remain visible event
data and do not block repo-local source. Registry owns concrete maps and target references;
Observatory owns aggregation. This artifact computes neither.
