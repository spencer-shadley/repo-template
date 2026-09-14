# ADR-0011: Portable product and registry overlays with immutable bootstrap provenance

- **Status:** accepted
- **Date:** 2026-09-14
- **Decider:** Repo Template Sole Source Writer (Issue #336)
- **Applies to:** Newly generated repositories, adoption-shell-v2, product platform declarations, technology registry overlays, component registry overlays, and bootstrap/audit provenance verification

## Context

During historical materializer evolution (Plan 030, epic #85, and AO #1279), multiple fleet-wide incidents and learnings established that repository bootstrapping and ongoing auditability require deterministic, immutable foundations:

1. **Provenance Drift and Non-Deterministic Audits:** Earlier adoption passes recorded provenance by referencing mutable branch names or URLs (e.g. `agent-orchestrator/master` or floating branch heads). When upstream branch heads were updated or mutated, downstream audits became non-reproducible, breaking deterministic replay and provenance verification. Audits must resolve to immutable release identity (SemVer release tags, commit SHAs, or content-addressed digests).
2. **Platform Surface Decay and Missing Revisit Triggers:** Product repositories declaring platforms without structured roles or explicit revisit triggers suffered from silent surface decay. Dormant platforms were frequently forgotten without an active revisit trigger, and unaddressed surfaces lacked rationale explaining why they were not targeted.
3. **Unstructured Registry Overlays:** Adoption shells lacked a portable, closed contract for registering repo-specific overlays against canonical fleet technology and component registries. Cross-fleet recurring audit machinery (AO #1279) had no machine-readable overlay format to inspect lifecycle state (`preferred-default`, `context-preferred`, `supported-alternative`, `candidate`, `legacy-compatibility`, `discouraged`, `prohibited`) without coupling to a specific centralized scheduler runtime.

## Decision

1. **Runtime-Neutral JSON Schemas (`contracts/product-overlay/v1/`):**
   - Publish `product-overlay.schema.json` (`repo-template/product-overlay/v1`, version `1.0.0`) requiring non-empty platforms (`minProperties: 1`) and closed platform definitions.
   - Publish `technology-registry.overlay.schema.json` and `component-registry.overlay.schema.json` defining lifecycle states and overlay entries.
2. **Closed Platform Roles & Mandatory Revisit Triggers:**
   - Platform roles are strictly closed: `primary`, `secondary`, `accessory`, `specialized`, `dormant`, `not-targeted`.
   - `dormant` platforms strictly require a non-empty `revisitTrigger` (`E_MISSING_DORMANT_REVISIT_TRIGGER`).
   - `not-targeted` platforms strictly require a non-empty `rationale` (`E_MISSING_NOT_TARGETED_RATIONALE`).
   - Rejection of unknown roles and malformed platform definitions fails closed.
3. **Immutable Bootstrap & Audit Provenance:**
   - Provenance requires immutable release evidence: SemVer release version, 40-character commit SHA, 64-character SHA-256 digest, or immutable release tag URL.
   - Mutable branch names (`master`, `main`, `HEAD`, `origin/master`, `trunk`, `dev`, `develop`, `latest`) and mutable branch URLs fail closed (`E_MUTABLE_PROVENANCE`).
   - Historical names `bootstrappedFromGuideVersion` and `lastAuditedAgainstGuideVersion` are retained for backward compatibility with audit consumers, but must carry immutable release values rather than mutable branch authority.
4. **Deterministic Pure Materialization in `adoption-shell-v2`:**
   - Extend `packages/adoption-shell/src/` with `product-overlay.ts`, `product-overlay-contract.ts`, `product-overlay-validation.ts`, and `product-overlay-yaml.ts`.
   - Pure TypeScript, zero external runtime dependencies, deterministic YAML serializer and bounded YAML parser with maximum nesting depth protection (max depth 32) to prevent DOS/memory exhaustion.
   - Materializes `product-overlay.yaml`, `technology-registry.overlay.yaml`, and `component-registry.overlay.yaml` matching the repository profile (`full-stack`, `service`, `library`, `standalone`).
   - Retains byte/digest stability on identical inputs.

## Consequences

- Generated repositories obtain clear, structured product platform definitions and registry overlay files.
- Cross-fleet recurring audit machinery (AO #1279) can deterministically inspect repository adherence against fleet standards without Repo Template owning runtime scheduler or registry authority.
- Mutable branch references can never satisfy provenance, guaranteeing deterministic auditability.
