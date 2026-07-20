# Plan 032: Reconcile repo-template plan debt without discarding commissioned autonomy

- **Project:** repo-template
- **Branch:** feat/032-reconcile-repo-template-plan-debt-without-discarding-commiss
- **Status:** ready for codex
- **Priority:** P2
- **Depends:** 030
- **Effort:** medium

## Risk

**Tier: human.** This changes live-plan and queue membership and preserves historical contracts in
the archive. It performs no source implementation, branch deletion, PR closure, issue closure, or
autonomy downgrade. Spencer's direct commission authorizes the disposition work; the human lane is
for protected queue-history review, not a second product-decision stop.

## Objective

Give every pre-wave live repo-template plan exactly one evidence-backed disposition after the
materializer foundation lands. Preserve useful intent and every immutable artifact, refresh still
valuable work against the current system, and remove obsolete selection ambiguity from `plans/`.

Age, stall count, and automatic routability are never retirement reasons. A plan written before
current commission/risk metadata existed is reevaluated on current product value and evidence.
Commissioned auto work remains auto when its current scope still qualifies.

## Frozen audit set

This plan owns only the exact snapshot:

`001, 006, 010, 011, 012, 014, 016, 020, 021, 023`.

Plans 028, 029, the materializer foundation, terminal release/canary, and any plan created after the
snapshot are explicitly untouched.

## Initial dispositions to prove

| Plan(s) | Expected disposition | Required immutable evidence |
|---|---|---|
| 001, 006 | `implemented-by-foundation` then archive | Foundation merge SHA and acceptance receipts for separate Git ownership, inherited steering, logical resolver identity, generated queue/incident/discovery contract, and no physical `C:\code\<repo>` assumption. |
| 010, 011, 012 | `superseded-landed` then archive | Exact archived Plans 015, 019, and 024 blobs/merge SHAs proving the grep-status and conflict-scan fixes; preserve unique issue refs #33/#45. |
| 014, 016 | `duplicate-landed` then archive both | Origin commit `d97d3ed` and exact `plans/QUEUE.md` readback showing `# Run queue — repo-template` plus current risk-tier policy; preserve issue #15 lineage. |
| 020 | `retain-refresh-auto` | No implementation receipt exists; refresh the feedback form, labels, and Verify contract against the materializer/adoption label-provisioning boundary, obtain a fresh critic verdict, and place it once in Pending when dependency-ready. Do not convert it to human tier merely because it predates current commissioning metadata. |
| 021 | `superseded-landed` then archive | Plan 022 archive/commit `5ed5ed8` plus exact ignore-rule and durable-incident visibility readback. |
| 023 | `implemented-by-foundation` then archive only if proven | Foundation validator must scan every textual tracked/materialized file independent of extension and ignore NUL-detected binary bytes. If that exact proof is absent, retain and refresh 023 instead. |

These are hypotheses, not authority to force the outcome. If the required evidence is absent or a
remote branch/PR contains unique unmerged work, record `salvage-required` and keep the plan live
with a precise revisit trigger.

## Changes

1. Create `plans/archive/disposition-2026-07-repo-template.json` with a closed schema and one row per
   frozen plan:
   - plan number, path, Git blob SHA, status, declared risk/commission provenance;
   - issue references, remote branch name/SHA, PR URL/state when any;
   - critic/result/log/feedback/paused artifact paths and content hashes when any;
   - disposition enum, rationale, replacement plan/commit/blob/test evidence;
   - unique-WIP result, remaining value, owner, and exact revisit trigger.
2. Query remote branch/PR state read-only. Never infer “no unique work” from a missing local branch.
   Compare every remote tip to origin and record the unique diff hash/path set.
3. For an evidenced archive disposition, move the original plan and existing sidecars into
   `plans/archive/` without rewriting their bytes. Preserve blob/content hashes in the ledger.
4. For Plan 020:
   - keep its human-feedback form and label intent;
   - consume the new materializer/adoption label-provisioning contract instead of assuming labels
     already exist;
   - update its Verify block to the current repo-template commands and offline/local YAML schema
     validation;
   - preserve the existing auto lane and direct human provenance;
   - obtain a fresh critic verdict; and
   - insert exactly one dependency-aware Pending row only when every same-repo dependency is live
     or archived. Do not start an executor.
5. For Plan 023, choose archive or refresh strictly from the foundation's landed production tests.
6. Reconcile `plans/QUEUE.md` so each retained `ready for codex` auto plan appears exactly once and
   no archived/parked/human plan appears in Pending. Do not touch Plans 028/029 or later wave rows.
7. Add a short `plans/archive/README.md` pointer to the machine ledger and state that archived means
   evidence-preserved disposition, never deletion or loss of commission.

## Prohibited

- Deleting or force-moving a remote branch.
- Closing, merging, or editing a PR or issue.
- Rewriting an archived plan, critic verdict, result, or log to fit the new narrative.
- Retiring work because it is old, stalled, redundant-looking, or auto-routable.
- Downgrading auto work to human approval without a current protected-surface reason.
- Touching source/template behavior outside Plan 020's refreshed contract.
- Starting a manual or scheduled drain.

## Acceptance criteria

- [ ] The frozen audit set has exactly one schema-valid ledger row per plan.
- [ ] Every claimed replacement is bound to immutable plan/blob/commit/test evidence.
- [ ] Every remote branch and PR is read back; unique WIP is preserved as `salvage-required`.
- [ ] Archived artifacts retain their original bytes and recorded hashes.
- [ ] Plan 020 remains represented, current, auto-routable, freshly criticized, and queued exactly
      once when dependency-ready.
- [ ] Plan 023 archives only with exact all-text/binary-negative-space foundation proof.
- [ ] Queue/live-plan bijection is exact without changing Plans 028/029 or later wave rows.
- [ ] No branch was deleted; no PR or issue was closed/merged/edited.
- [ ] No disposition cites age, stall count, or auto eligibility as its reason.
- [ ] The change increases clarity and forward autonomy without creating a new human gate.

## Verify

```bash
corepack pnpm validate
corepack pnpm test
node --input-type=module <<'NODE'
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ledger = JSON.parse(readFileSync("plans/archive/disposition-2026-07-repo-template.json", "utf8"));
const expected = ["001","006","010","011","012","014","016","020","021","023"];
if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.plans)) throw new Error("invalid disposition ledger");
const ids = ledger.plans.map((row) => row.plan).sort();
if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error(`wrong audit set: ${ids}`);
for (const row of ledger.plans) {
  for (const key of ["plan","originalPath","originalBlobSha","status","disposition","rationale","evidence","remote","revisitTrigger"]) {
    if (!(key in row)) throw new Error(`${row.plan}: missing ${key}`);
  }
  if (/(?:age|old|stall count|auto-routable)/i.test(row.rationale)) {
    throw new Error(`${row.plan}: prohibited retirement rationale`);
  }
  if (row.disposition !== "salvage-required" && !row.evidence.length) {
    throw new Error(`${row.plan}: disposition lacks immutable evidence`);
  }
}
const queue = readFileSync("plans/QUEUE.md", "utf8");
if ((queue.match(/^- 020\b/gm) || []).length > 1) throw new Error("Plan 020 duplicated in queue");
for (const protectedId of ["028","029"]) {
  if (!(queue.match(new RegExp(`^- ${protectedId}\\b`, "gm")) || []).length) {
    throw new Error(`protected active row ${protectedId} changed or removed`);
  }
}
execFileSync("git", ["diff", "--check"], { stdio: "inherit" });
NODE
```

The implementation must also record read-only `git ls-remote` and PR-query receipts in the ledger.
Those network receipts are evidence inputs; the Verify gate itself remains deterministic.

## Rollback

Revert the disposition commit. Because original artifacts are moved rather than deleted and remote
branches/PRs are untouched, rollback restores live paths without reconstructing history.
