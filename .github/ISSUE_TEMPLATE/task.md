---
name: Task / bug / feature
about: Triage-ready issue — the autonomous pipeline authors a plan from this
labels: agent-review
---

## Work type
<!-- Defect | Task | Risk reduction | Discovery / experiment | Feature | Mixed -->

## What happened or what is needed?
<!-- One paragraph. For bugs: symptom + repro. For features: the user-visible outcome. -->

## Initial priority guess
<!-- P0 candidate | P1 | P2 | P3 | P4 | P5 -->

## Why this initial priority?
<!-- One short reason: current harm, urgency, expected value, or time saved. -->

## Relevant details
<!-- Evidence, links, impact. When filing via cli-wrappers, fill provenance exactly: -->
- repository: <!-- owner/name hosting this template -->
- commit: <!-- ≥7-char SHA of the template tip -->
- path: .github/ISSUE_TEMPLATE/task.md

## Root-cause taxonomy and disposition
<!-- Required by fleet DOCTRINE.md §14 / governed-intake-body-v1. Climb all nine ranks.
     Use honest "TBD — planner" when a rank is not yet known — TBD is an open triage
     obligation, not decoration. Disposition one of: immediate | reordered-plan |
     assigned-issue | already-owned | evidence-ceiling. Cite §14; do not restate doctrine. -->

| Rank | Finding at this scope | Fix or next action | Disposition | Reified as |
|---|---|---|---|---|
| Subspecies | <!-- this exact symptom --> | <!-- immediate unblock --> | <!-- disposition --> | this issue |
| Species | <!-- same mode + proximate cause elsewhere --> | <!-- class fix --> | <!-- disposition --> | <!-- issue/plan or TBD — planner --> |
| Genus | <!-- shared mechanism --> | <!-- mechanism fix --> | <!-- disposition --> | <!-- issue/plan or TBD — planner --> |
| Family | <!-- subsystem invariant --> | <!-- contract/boundary fix --> | <!-- disposition --> | <!-- issue/plan or TBD — planner --> |
| Order | <!-- architectural pattern --> | <!-- architecture fix --> | <!-- disposition --> | <!-- issue/plan or TBD — planner --> |
| Class | <!-- standard/tool/prompt producing it --> | <!-- engineering-system fix --> | <!-- disposition --> | <!-- issue/plan or TBD — planner --> |
| Phylum | <!-- ownership/lifecycle structure --> | <!-- org/process fix --> | <!-- disposition --> | <!-- issue/plan or TBD — planner --> |
| Kingdom | <!-- incentive / reward shape --> | <!-- governance fix --> | <!-- disposition --> | <!-- issue/plan or TBD — planner --> |
| Domain | <!-- optimization model --> | <!-- objective change or stop --> | evidence-ceiling | <!-- CEO / terminal stop reason -->

At planning/closure, all nine rows require an acted-on artifact or an explicit evidence-backed reason for delegation, non-action, unsupported scope, or evidence ceiling.

## Durable fix and acceptance
<!-- Bullet list the loop's verify gate can check. The better this is, the likelier a clean
     autonomous fix. -->

## Human-decision state
<!-- No human decision required | Decision needed: <exact question for Spencer> -->
