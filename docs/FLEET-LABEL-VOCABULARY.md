# Portable fleet label vocabulary (SSOT)

Repo Template owns the **portable** fleet label vocabulary that every adopted repository
bootstraps with. Fleet Registry responsibility map question
`portable-repo-template-and-label-vocabulary` points here.

## What this repo owns

| Layer | Authority | Location |
| --- | --- | --- |
| Code fleet-law projection (priority / work-spine / intake / banned) | Code publishes; Template pins | `scripts/generated/fleet-law-projection.v1.json` via `scripts/generated/fleet-law.ts` |
| Template-portable additions (`agent-review`, `needs-rebase`, …) | Repo Template | `TEMPLATE_PORTABLE_LABELS` in `scripts/provision-canonical-labels.ts` |
| Composition + provision plan | Repo Template | `buildCanonicalLabels()` / `pnpm provision:labels` |
| Sync/check against Code source | Repo Template | `pnpm check:fleet-law` / `pnpm verify:fleet-law` |
| Charter claim | Repo Template | `AGENTS.md` TEMPLATE-SELF **Responsibilities** (label vocabulary bullet) |

## What this repo does not own

- Authoring or revising Code fleet-law projection bytes (Code `tools/work-spine`).
- Consumer-only or product-specific labels outside the portable kit.
- Live GitHub label mutation for already-adopted repos merely because the template kit changes
  (adoption/refresh paths stay effect owners).

## Operator commands

```bash
pnpm check:fleet-law          # pin matches generated consumer
pnpm verify:fleet-law         # self-test + check
pnpm provision:labels --dry-run
node scripts/provision-canonical-labels.selfcheck.ts
```

## Evidence

- Charter gap closed by repo-template#418 (was flagged on fleet-registry#110 / code#5900 as
  “label vocabulary proposed but missing from TEMPLATE-SELF Responsibilities”).
- Mechanical kit already shipped under repo-template#308 / #381; this doc + charter bullet make
  ownership discoverable for `who-owns` / responsibility routing.

## Taxonomy preparation and activation (repo-template#468 / code#7581)

The pinned Code-generated revision-2 projection is **inactive preparation data**. Its
assessment authority records the published producer used during preparation; it is not a
claim that revision 23 is published. The producer candidate is `.github` PR #36 at
`6701e9e5b9ef8e7cab3793241eea656fb3c11e1a` (source
`6425de19f8a401226ef8b332e78c428c10092f93`, candidate payload
`170617c8552f89750fe3457a710edc3f8c8324a90a337cd337c126d9a77a338b`).

The inactive pin is the owner-generated projection at Code #7761 head
`7e2d5974e3116b01b3798708f618781eddd3afe4`: blob
`1ddde9ff669ea0f3f7d54dc4a5003797c70dc207`, `sourceCommit`
`5bdba91b0ac51f1f8815981f0c12b82bb292d951`, content digest
`sha256:cd2a9ffbc6ddb606b9634569f89ab20cdc9ddc152a37254173765de2098eec4d`.
That digest matches the accepted candidate blob
`d927b974e6b1440c1482af3d763190d8e2cb3957` (`sourceCommit`
`db228a27c32caec64234441e76edea8ab7c177b6`); the later head changes `sourceCommit`
only. The pin keeps `type:proposal` and `metadata:direction-change`.
`publication.ready` stays false (`candidate-producer-not-activated`). Published
Governed Intake revision 22 stays live. This pin does not activate Code #7761 or
the producer.

Dry-run composition supports multiple `delivers`, `type`, and `source` values; exactly one
current `progress`; independent blockers; and structured risk, authority, and environment.
`type:regression` needs prior behavior/decision evidence. Benefits are intended outcomes,
not measurements. Priority is independently assessed from evidence; label edits/counts never
change it. `metadata:triage-vN` is the sole new completion family and is emitted only from an
activated, matching published projection after actual semantic assessment by its owner.
No completion alias is added during preparation.

Live provisioning refuses inactive preparation and freshly reads the producer's published
manifest before effects. Coordinated activation must first publish the accepted producer,
then obtain its Code-generated active projection and run `--sync` / scoped checks. No local
readiness, tier, legacy namespace, or serialized-ready-only fallback authorizes effects.
Existing deployed consumers retain their published contract until the coordinated switch.
Do not use this preparation to provision fleet stock or activate inherited forms.

Non-delivery closure retains last actual progress. `resolution:obsolete` closes genuinely
valueless accepted work immediately after its direction decision, before retirement lands,
with exact causing issue + accepted decision comment and a backlink on the cause.
Deletion/migration tags alone never authorize closure. `resolution:superseded` instead
conserves still-valid work at its destination. Reopening clears resolution and invalid stamps
and requires current published assessment. Provisioning preserves unrelated labels and does
not delete retired repository labels from closed history by default; stock migration remains
the programme owner's separate transaction. GitHub native inheritance remains the only form
distribution: no `.github/ISSUE_TEMPLATE/**` copies.

This migration follows P0.1 (producer ownership/custody), P1.2 (fail-closed release evidence),
and P2.1 (bounded reversible preparation). The adopt-project skill's label provisioning step
must use dry-run until the coordinated release switch; no form-copy instructions are added.
