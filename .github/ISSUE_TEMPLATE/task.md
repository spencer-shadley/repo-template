---
name: Task / bug / feature
about: Triage-ready issue — the autonomous pipeline authors a plan from this
labels: agent-review, priority:triage-tbd
---

<!-- Generated from contracts/governed-intake-body.v1.json. Do not hand-edit; run: node contracts/governed-intake-body.generate.mjs -->

## Work type
<!-- Defect | Task | Risk reduction | Discovery / experiment | Feature | Mixed -->

## What happened or what is needed?
<!-- One paragraph. For bugs: symptom + repro. For features: the user-visible outcome. -->

## Initial priority guess
<!-- P0 candidate | P1 | P2 | P3 | P4 | P5.
     Triage TODO: Consult docs/guides/issue-priority.md (Defect Evidence Scale / Economic Case) before selection.
     Key rule: Non-crashing defects, performance debt, and resource leaks are capped at <= P2.
     P0 candidate is strictly reserved for actively blocked critical paths without safe workarounds. -->

## Why this initial priority?
<!-- One short reason: current harm, urgency, expected value, or time saved (cite docs/guides/issue-priority.md defect scale: frequency x severity x urgency). -->

## Triage checklist (TODO for triage agent)
<!-- The triage worker/agent must complete and check off these items during asynchronous triage: -->
- [ ] **Fix-owner repository verified**: Confirmed via `fleet-repo-responsibility-routing` that this issue is filed in the true fix-owner repository (not a symptom/catchall repo).
- [ ] **Deduplication checked**: Searched open and closed issues in this repository for duplicate or same-class occurrences.
- [ ] **Priority assessed via [`docs/guides/issue-priority.md`](docs/guides/issue-priority.md)**:
  - [ ] Defect evidence scale assessed (`frequency × severity × urgency`) or economic return modeled.
  - [ ] Non-crashing defects, performance debt, and resource leaks capped at `≤ P2`.
  - [ ] `P0 candidate` validated against all six P0 immediate-unblock predicates (or downgraded).
- [ ] **Authoritative priority triplet applied**:
  - [ ] `priority:rubric-v1`
  - [ ] Exactly one `priority:repo:pN`
  - [ ] Exactly one `priority:fleet:pN`
- [ ] **Work dimensions applied via [`docs/guides/issue-work-spine.md`](docs/guides/issue-work-spine.md)**:
  - [ ] Exactly one `effort:low` | `effort:medium` | `effort:high`
  - [ ] Exactly one `tier:auto` | `human-required`
- [ ] **Pending labels cleared**: Removed `priority:triage-tbd`, `work:untriaged`, and coarse legacy priority labels (`priority:p1`, etc.).
- [ ] **Root-cause taxonomy validated**: All nine DOCTRINE §14 ranks have findings, dispositions, and dual Defect ladders (Prevention vs Detect/heal/recover) — not a single Fix column.

## Relevant details
<!-- Evidence, links, impact. When filing via cli-wrappers, fill provenance exactly: -->
- repository: <!-- owner/name hosting this template -->
- commit: <!-- ≥7-char SHA of the template tip -->
- path: .github/ISSUE_TEMPLATE/task.md

## Root-cause taxonomy and disposition
<!-- Required by fleet DOCTRINE.md §14 / governed-intake-body-v1. Climb all nine ranks.
     Use honest TBD — triage when a rank is not yet known — TBD is an open triage
     obligation, not decoration. Cite §14; do not restate doctrine.
     Causal climb columns are Rank, Finding, Disposition, Reified as.
     Defects MUST complete ladders A (Prevention / never again) and B (Detect/heal/recover / §18)
     as distinct structures. Do not keep a single Fix or next action column as the only action.
     Legal status tokens: `landed` | `assigned-issue` | `already-owned` | `inherited` | `N/A` | `evidence-ceiling` | `TBD — triage`. -->

| Rank | Finding | Disposition | Reified as |
|---|---|---|---|
| Subspecies | <!-- this exact symptom --> | <!-- disposition --> | this issue |
| Species | <!-- same mode + proximate cause elsewhere --> | <!-- disposition --> | issue/plan or TBD — triage |
| Genus | <!-- shared mechanism --> | <!-- disposition --> | issue/plan or TBD — triage |
| Family | <!-- subsystem invariant --> | <!-- disposition --> | issue/plan or TBD — triage |
| Order | <!-- architectural pattern --> | <!-- disposition --> | issue/plan or TBD — triage |
| Class | <!-- standard/tool/prompt producing it --> | <!-- disposition --> | issue/plan or TBD — triage |
| Phylum | <!-- ownership/lifecycle structure --> | <!-- disposition --> | issue/plan or TBD — triage |
| Kingdom | <!-- incentive / reward shape --> | <!-- disposition --> | issue/plan or TBD — triage |
| Domain | <!-- optimization model --> | evidence-ceiling | CEO / terminal stop reason |

### A. Prevention — never again
<!-- Required for Defects. Other work types may use N/A per row. Preventive control at each §14 rank. -->

| Rank | Preventive control | Status |
|---|---|---|
| Subspecies | <!-- control so this occurrence cannot recur --> | TBD — triage |
| Species | <!-- class control across the same mode --> | TBD — triage |
| Genus | <!-- mechanism cannot produce this species --> | TBD — triage |
| Family | <!-- contract/boundary that forbids the mechanism --> | TBD — triage |
| Order | <!-- architecture that does not share the weakness --> | TBD — triage |
| Class | <!-- engineering-system change so tools cannot emit it --> | TBD — triage |
| Phylum | <!-- org/process that owns the class --> | TBD — triage |
| Kingdom | <!-- governance that does not reward this mode --> | TBD — triage |
| Domain | <!-- objective that does not select for this class --> | TBD — triage |

### B. Detect / self-heal / recover — if it still happens
<!-- Required for Defects. Other work types may use N/A per row. If it still happens: notice, heal, restore, escalate. -->

| Rank | Notice | Self-heal / contain | Restore | Escalate if no progress | Status |
|---|---|---|---|---|---|
| Subspecies | <!-- how this occurrence is noticed --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |
| Species | <!-- how the class is detected --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |
| Genus | <!-- how the mechanism is detected --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |
| Family | <!-- how the invariant breach is noticed --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |
| Order | <!-- how the pattern failure is noticed --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |
| Class | <!-- how the producing standard is detected --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |
| Phylum | <!-- how ownership/lifecycle miss is noticed --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |
| Kingdom | <!-- how the incentive failure is noticed --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |
| Domain | <!-- how objective-model failure is noticed --> | <!-- heal/contain --> | <!-- restore --> | <!-- escalate if no progress --> | TBD — triage |

At planning/closure, all nine rows require an acted-on artifact or an explicit evidence-backed reason for delegation, non-action, unsupported scope, or evidence ceiling. Defects also require both ladders at each rank.

## Durable fix and acceptance
<!-- Bullet list the loop's verify gate can check. The better this is, the likelier a clean
     autonomous fix. -->

## Human-decision state
<!-- No human decision required | Decision needed: <exact question for Spencer> -->
