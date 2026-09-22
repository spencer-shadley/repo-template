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
