# ADR-0008: LocalCiContractV2 portable local verification contract and legacy migration

- **Status:** accepted
- **Date:** 2026-07-29
- **Decider:** Repo Template Sole Source Writer (Issue #102)
- **Applies to:** Portable repository verification contracts, adoption-shell-v2, and consumer canaries

## Context

Prior local verification contracts across the fleet suffered from ambiguous, fragmented numeric-V1 definitions. Model Gateway used a `runtime + checks[{id, command}] + effects` shape, while Repo Factory used an `entrypoint + gates[] + flags` shape. Neither schema provided closed, explicit command identity, shell/CWD/timeout semantics, comprehensive environment requirements, or a closed effects vocabulary. This lack of a single portable contract risked invalid routing or silent execution under wrong gate assumptions.

## Decision

Define and publish `LocalCiContractV2` as the single portable, machine-readable schema and pure offline validator for repository local verification contracts:

1. **Contract & Schema Authority:** Published at `contracts/local-ci/v2/local-ci-contract-v2.schema.json` with schema ID `https://schemas.repo-template.dev/local-ci-v2/local-ci-contract-v2.schema.json` and contract ID `repo-template/local-ci-v2`.
2. **Explicit Semantics:**
   - **Commands:** A closed object keyed by stable command identity. The reserved, required `authoritative-gate` key is always executed last; all other keys execute first in lexical key order. Each command declares `name`, `executable`, non-empty `args`, `shell`, `cwd`, `timeoutSeconds`, `expectedExitCode`, and `failureDisposition`. This structural form makes command identity, ordering, and the single authoritative gate portable and equally enforceable by the published JSON Schema and runtime validator.
   - **Environment:** Complete runtime/package-manager specifications, supported platform/architecture constraints, required environment variables/credentials, and explicit network expectations (`offline-only`, `local-loopback`, `outbound-allowed`).
   - **Effects Vocabulary:** Strictly closed boolean vocabulary covering credentials access, network access, provider spend, external mutation, registration, schedules, deployment, consumer binding, and serving authority. Unknown or extra fields fail validation.
3. **Legacy Lineage Migration & Non-Routable Fail-Closed:**
   - Pure offline validator `classifyAndMigrateLegacyLocalCiV1` identifies both legacy V1 lineages (`model-gateway-v1` and `repo-factory-v1`) but rejects them with `INCOMPLETE_LEGACY_EVIDENCE` unless a consumer supplies an independently authenticated complete V2 declaration; it never guesses fields or coerces effects.
   - Any unknown, missing, malformed, duplicate, or conflicting declaration yields a typed reason code and a **non-routable** disposition while preserving the source blob SHA-256 digest.

## Consequences

- Repo Template serves as the single source of truth for portable local-CI contracts.
- Consumers (such as Agent Orchestrator #2098, Model Gateway, and Repo Factory) import/pin the immutable candidate or release contract without claiming schema authority.
- Canaries consume candidate artifacts deterministically; no tag or floating ref is updated during candidate review.
