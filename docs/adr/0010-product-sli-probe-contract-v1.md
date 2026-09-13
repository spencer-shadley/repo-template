# ADR-0010: ProductSliProbeV1 portable contract and migration rules

- **Status:** accepted
- **Date:** 2026-09-13
- **Decider:** Repo Template Sole Source Writer (Issue #110)
- **Applies to:** Product repositories declaring local SLIs/SLOs, workflow schedulers, and fleet observability

## Context

Fleet `NORMS.md` and completed Repo Template #326 established sibling `PRIORITIES.md` as the exclusive authority for local SLI and SLO rows, prohibiting conflicting definitions in `AGENTS.md`. However, #326 intentionally stopped at the surface boundary. Prior to this decision, no portable contract defined how an active local SLI row binds to a product-owned execution entrypoint or typed observation receipt.

Without a standard contract, product repositories had no uniform way to declare safe, read-only continuous probes, and workflow/observability consumers (such as Windmill or Fleet Observatory) had to invent repository-specific ad-hoc configurations. Furthermore, past attempts to unify SLI observability coupled probe definitions with centralized orchestrator runtimes (AO #2867). Architecture review clarified that probe declarations and implementations belong to product repositories, generic cadence/retry belongs to the workflow substrate, and retention/aggregation belongs to observability authorities.

## Decision

1. **`ProductSliProbeV1` Contract (`contracts/product-sli-probe/v1/product-sli-probe.schema.json`):**
   - Published as a strict, runtime-neutral JSON schema (`contractId: "repo-template/product-sli-probe-v1"`, `schemaVersion: "product-sli-probe/v1"`).
   - Binds each probe directly to an active local SLI row in `PRIORITIES.md` (`sliId`, `bindsPrinciple`).
   - Supports observation kinds: `gauge`, `count-ratio`, `boolean`, and `report-only`.
   - References SLO targets from `PRIORITIES.md` without duplicating or overriding target authority.
   - Requires fixed repository-relative entrypoint paths and structural argv. Arbitrary shell interpolation, outside-repository paths, and shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `<`, `>`) are structurally rejected.
   - Enforces safe effect classes: only `read-only` and `fixture-only` are allowed. Destructive actions, live mutation, and provider spend are structurally refused for unattended product probes (`E_FORBIDDEN_EFFECT`).
   - Requires explicit `disposition` (`report-only | unsupported | non-mechanizable`) with non-blank `owner`, `reviewDate` (`YYYY-MM-DD`), and rationale for non-mechanized rows.
   - Includes cadence and freshness metadata as hints for external schedulers, not scheduler execution authority.

2. **Typed Observation Schema (`contracts/product-sli-probe/v1/product-sli-observation.schema.json`):**
   - Published under `schemaVersion: "product-sli-observation/v1"`.
   - Provides a stable, typed observation receipt shape containing observation identity, timestamp, status, value, target, and evidence payload.

3. **Fail-Closed Binding Validation (`validateProductSliProbeContractV1`):**
   - Every active row in `PRIORITIES.md` must have exactly one compatible probe binding or explicit report-only disposition. Unbound active rows fail closed (`E_UNBOUND_ACTIVE_ROW`).
   - Every probe must reference a valid, matching row in `PRIORITIES.md` (`E_UNKNOWN_SLI_ROW`, `E_PRINCIPLE_MISMATCH`).
   - Duplicate SLI IDs are prohibited in both `PRIORITIES.md` and probe declarations (`E_DUPLICATE_ID`).
   - Composes directly with #326's surface guard in `scripts/check-local-sli-authority.ts`.

4. **Preserved Migration Playbook and Receipts (`ProductSliMigrationReceiptV1`):**
   - Moves legacy measurement definitions from `AGENTS.md` to `PRIORITIES.md` without altering principle bindings, IDs, targets, or decider provenance.
   - Generates deterministic before/after canonical SHA-256 digests (`beforeSemanticDigest`, `afterSemanticDigest`) proving semantic preservation.

## Consequences

- Product repositories (including canaries `gmail-markdown` #554 and `sharingan` #140) gain a standard, safe contract for continuous core-flow probes without depending on a central scheduler runtime.
- Destructive operations and shell injection risks are eliminated at the schema and validator boundary.
- Unattended product observation remains pure, deterministic, and fail-closed.
