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
claim that revision 23 is published. The active combined producer candidate is
[`.github` PR #53](https://github.com/spencer-shadley/.github/pull/53) at carrier
`60fe03d17746c4c65482f918bd0dc0d77b28d433` (source
`4601851a0630d5ba9f3c42bffc66b794f234b079`, candidate payload
`sha256:d09609ceeed4cdaa3eb9e3162ed0e18f2b57ebe6f5f7febe77e886bfe280774d`).

The inactive pin is the owner-generated projection delivered by Code #7761 at
`b2963e2a8035cbd322ccd84fcca0a46a5434d1b2` from reviewed head
`7e2d5974e3116b01b3798708f618781eddd3afe4`: blob
`1ddde9ff669ea0f3f7d54dc4a5003797c70dc207`, `sourceCommit`
`5bdba91b0ac51f1f8815981f0c12b82bb292d951`, content digest
`sha256:cd2a9ffbc6ddb606b9634569f89ab20cdc9ddc152a37254173765de2098eec4d`.
That digest matches the accepted candidate blob
`d927b974e6b1440c1482af3d763190d8e2cb3957` (`sourceCommit`
`db228a27c32caec64234441e76edea8ab7c177b6`); the later head changes `sourceCommit`
only. The Code projection and Governed Intake release are distinct artifacts, so
their source commits and content digests are not interchangeable. The pin keeps
`type:proposal` and `metadata:direction-change`.
The projection's `publication` flag and producer pin are **not authoritative** for
provisioning (they remain only because Code owns the projection bytes; Code should drop them
at its next generation). This pin does not activate the producer or provision fleet stock.

Dry-run composition supports multiple `delivers`, `type`, and `source` values; exactly one
current `progress`; independent blockers; and structured risk, authority, and environment.
`type:regression` needs prior behavior/decision evidence. Benefits are intended outcomes,
not measurements. Priority is independently assessed from evidence; label edits/counts never
change it. `metadata:triage-vN` is the sole new completion family and is emitted only from an
activated, matching published projection after actual semantic assessment by its owner.
No completion alias is added during preparation.

Provisioning consumes the **latest** published Governed Intake release (fleet rule: no pins,
record resolved SHAs as evidence). At use time `scripts/governed-intake-release.ts` resolves the
head of `spencer-shadley/.github` `main`, reads `manifest.json` and the contract/policy payloads
at that exact SHA, and verifies them the way the producer's `verify.ts` does (schema/family,
repository, full commit SHA, payload digest recomputed from file metadata (UTF-16 order), alias identity, byte digests of contract/policy,
contract revision/owner). Only unreadable or forged input fails closed. The completion stamp is
`metadata:triage-v<resolved revision>`; the report records head commit, producer commit,
revision, and payload digest. Dry-run resolves too, so evidence is always recorded. A producer
revision bump needs no consumer code change. No local readiness, tier, legacy namespace, or
serialized-ready-only fallback authorizes effects.
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
