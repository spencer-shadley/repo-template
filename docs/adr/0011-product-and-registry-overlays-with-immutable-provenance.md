# ADR-0011: Product and registry overlays with immutable bootstrap provenance

- **Status:** accepted
- **Date:** 2026-09-14
- **Decider:** Repo Template Manager (Issue #336)
- **Applies to:** Generated repositories and adoption-shell-v2 materializer

## Context

Prior to this decision, newly generated fleet repositories lacked portable, machine-readable product/platform overlays and registry overlays. Historical bootstrapping attempted to bind provenance to mutable external references such as `agent-orchestrator/master` branch URLs or living guide prose. This allowed upstream drift to mutate repository authority after genesis and violated the core architectural requirement that repository materialization must be pure, offline-reproducible, and digest-stable.

Issue #85 (RT85 M2 / #336) established that generated repositories require:
1. A closed product/platform overlay (`product-overlay.yaml`) with canonical role vocabulary (`primary`, `secondary`, `accessory`, `specialized`, `dormant`, `not-targeted`), mandatory revisit triggers for dormant surfaces, and required rationale for not-targeted surfaces.
2. Technology and component registry overlays (`technology-registry.overlay.yaml`, `component-registry.overlay.yaml`) reflecting the selected product profile and canonical registry lifecycles (`preferred-default`, `context-preferred`, `supported-alternative`, `candidate`, `legacy-compatibility`, `discouraged`, `prohibited`).
3. Immutable bootstrap and audit provenance bound strictly to content-addressed Repo Template/adoption-shell release evidence, rejecting any mutable branch reference or external URL.

## Decision

1. **Schemas and Contracts:**
   - Publish strict schemas under `contracts/overlays/v1/`:
     - `product-overlay.schema.json` (`contractId: "repo-template/product-overlay-v1"`, `schemaVersion: "product-overlay/v1"`)
     - `technology-registry.overlay.schema.json` (`contractId: "repo-template/technology-registry-overlay-v1"`, `schemaVersion: "technology-registry-overlay/v1"`)
     - `component-registry.overlay.schema.json` (`contractId: "repo-template/component-registry-overlay-v1"`, `schemaVersion: "component-registry-overlay/v1"`)
   - Group them under the portable capability bundle `repo-template/product-registry-overlays`.

2. **Closed Role and Lifecycle Vocabularies:**
   - Product platform roles are strictly closed: `primary`, `secondary`, `accessory`, `specialized`, `dormant`, `not-targeted`. Unrecognized roles fail closed (`E_OVERLAY_ROLE`).
   - Every dormant surface must declare a non-empty `revisitTrigger`. Omitting it fails closed (`E_DORMANT_REVISIT_TRIGGER`).
   - Every not-targeted surface must declare a non-empty `rationale` (`E_NOT_TARGETED_RATIONALE`).
   - Technology and component lifecycles are strictly closed to canonical states: `preferred-default`, `context-preferred`, `supported-alternative`, `candidate`, `legacy-compatibility`, `discouraged`, `prohibited` (`E_REGISTRY_LIFECYCLE`).

3. **Immutable Provenance Binding:**
   - Bootstrap provenance must carry immutable template release identity (`templateRelease.repository`, `semver`, `releaseDigest`).
   - Mutable branch references (such as `/master`, `/main`, `/HEAD`, `agent-orchestrator/master`, or unpinned branch URLs) are structurally rejected at the validator boundary (`E_PROVENANCE_INCOMPATIBLE`).
   - Provenance cannot be satisfied by mutable ambient URLs.

4. **Adoption Shell Integration:**
   - Materialization through `adoption-shell-v2` (`materializeAdoptionShellV2`) executes pure deterministic validation over selected overlay entries.
   - Any malformed YAML/JSON, unknown role, missing dormant trigger, or mutable provenance throws `AdoptionShellValidationError` with sorted diagnostics.

## Consequences

- Generated repositories receive immutable, offline-verifiable product and registry overlays upon creation.
- Drift audits can consume stable, content-addressed bootstrap provenance without reliance on central mutable branches.
- Upstream template changes do not mutate existing consumer repositories.
