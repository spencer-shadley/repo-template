# Plan 032: Reconcile repo-template plan debt without discarding commissioned autonomy

- **Project:** repo-template
- **Branch:** feat/032-reconcile-repo-template-plan-debt-without-discarding-commiss
- **Status:** draft - blocked on Plan 030 landed disposition evidence
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

1. Add `schemas/plan-disposition.schema.json`,
   `scripts/validate-plan-disposition.mjs`, and
   `scripts/restore-plan-disposition.mjs`. Create
   `plans/archive/disposition-2026-07-repo-template.json` under that pinned, offline-validated,
   closed schema with one row per frozen plan:
   - `schemaVersion: 1` and `kind: "repo-template-plan-disposition/v1"`;
   - plan number, path, Git blob SHA, status, declared risk/commission provenance;
   - issue references, remote branch name/SHA, PR URL/state when any;
   - critic/result/log/feedback/paused artifact paths and content hashes when any;
   - `evidence` as a non-empty array of closed references containing kind, immutable identity, and
     optional content hash; never an untyped object/string;
   - `artifacts` as a closed array of original path, archived path, `originalTracked`, nullable
     `originalGitBlobSha`, mandatory byte SHA-256, and
     `restoreStrategy: git-revert | copy-back` for every moved plan/sidecar;
   - disposition enum restricted to `implemented-by-foundation`, `superseded-landed`,
     `duplicate-landed`, `retain-refresh-auto`, `retain-refresh`, and `salvage-required`;
   - `targetRiskTier` restricted to `auto`, `human`, or `none`; every retained target-auto row must
     use `retain-refresh-auto`, every `retain-refresh-auto` row must target auto, and no generic
     `retain-refresh` row may conceal an automatic target;
   - remote receipt state restricted to `none`, `branch-only`, `pr-open`, `pr-closed`,
     `pr-merged`, and `query-failed`;
   - rationale;
   - unique-WIP result, remaining value, owner, and exact revisit trigger.
   Tracked artifacts require a 40-hex original blob plus `git-revert`; untracked/ignored artifacts
   require a null blob plus `copy-back`. Every artifact requires the byte SHA-256 regardless of
   tracked state. The validator compiles the schema and validates the real ledger; JSON parsing alone
   is not acceptance. Register the new schema and both scripts in `template-manifest.json` with mode
   `self`; they never materialize into product repositories.
2. Query remote branch/PR state read-only. Never infer “no unique work” from a missing local branch.
   Compare every remote tip to origin and record the unique diff hash/path set.
3. For an evidenced archive disposition, move each tracked original and copy each untracked/ignored
   sidecar into `plans/archive/` without rewriting bytes. Read back every archived byte hash before
   removing an untracked live original. Preserve blob/content hashes and restore strategy in the
   ledger. `scripts/restore-plan-disposition.mjs` supports a dry-run plus an explicit
   `--restore-untracked` operation that copy-backs only `copy-back` rows after hash/conflict checks;
   it never overwrites a differing live path.
4. For Plan 020:
   - keep its human-feedback form and label intent;
   - consume the new materializer/adoption label-provisioning contract instead of assuming labels
     already exist;
   - update its Verify block to the current repo-template commands and offline/local YAML schema
     validation;
   - preserve the existing auto lane and direct human provenance;
   - add the canonical metadata line `- **Risk tier:** auto`;
   - obtain a fresh critic verdict; and
   - insert exactly one dependency-aware Pending row only when every same-repo dependency is live
     or archived. Do not start an executor.
5. For Plan 023, choose archive or refresh strictly from the foundation's landed production tests.
   Every plan retained as automatic must carry the same canonical explicit
   `- **Risk tier:** auto` metadata; prose, age, or historical commission wording is not a substitute.
6. Reconcile `plans/QUEUE.md` so each retained `ready for codex` auto plan appears exactly once and
   no archived/parked/human plan appears in Pending. Preserve Plans 028/029 exactly in whatever
   current live/archived/queued state exists when this plan branches. Compare the complete ordered
   sequence of every non-frozen Pending row to the merge base, and reject any changed numbered
   live/archive plan artifact outside the frozen audit set (hyphenated plan files and dot-named
   sidecars alike). This protects 028/029, later-wave rows, and their relative order without assuming
   any are still Pending.
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
- [ ] Tracked and untracked artifact provenance is explicit; the restore helper dry-run proves every
      `copy-back` row can be restored without overwriting divergent bytes.
- [ ] Plan 020 remains represented, current, auto-routable, freshly criticized, and queued exactly
      once when dependency-ready.
- [ ] Plan 023 archives only with exact all-text/binary-negative-space foundation proof.
- [ ] Queue/live-plan bijection is exact; the entire ordered non-frozen Pending sequence and every
      non-frozen numbered plan/sidecar artifact are unchanged from the merge base.
- [ ] No branch was deleted; no PR or issue was closed/merged/edited.
- [ ] No disposition cites age, stall count, or auto eligibility as its reason.
- [ ] The diff adds no Pending human-tier row, no approval step, and no autonomy downgrade; every
      retained auto plan has canonical explicit `Risk tier: auto` metadata and remains on the
      standard authorized lane.

## Verify

```bash
corepack pnpm validate
corepack pnpm test
node scripts/lint-user-surface-leaks.mjs --self-test
node scripts/validate-plan-disposition.mjs plans/archive/disposition-2026-07-repo-template.json
node scripts/restore-plan-disposition.mjs plans/archive/disposition-2026-07-repo-template.json --dry-run
node --input-type=module <<'NODE'
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const ledger = JSON.parse(readFileSync("plans/archive/disposition-2026-07-repo-template.json", "utf8"));
const expected = ["001","006","010","011","012","014","016","020","021","023"];
if (ledger.schemaVersion !== 1 || ledger.kind !== "repo-template-plan-disposition/v1" ||
    !Array.isArray(ledger.plans)) throw new Error("invalid disposition ledger");
const ids = ledger.plans.map((row) => row.plan).sort();
if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error(`wrong audit set: ${ids}`);
for (const row of ledger.plans) {
  for (const key of ["plan","originalPath","status","disposition","rationale","evidence","artifacts","remote","revisitTrigger"]) {
    if (!(key in row)) throw new Error(`${row.plan}: missing ${key}`);
  }
  if (/(?:age|old|stall count|auto-routable)/i.test(row.rationale)) {
    throw new Error(`${row.plan}: prohibited retirement rationale`);
  }
  if (row.disposition !== "salvage-required" && !row.evidence.length) {
    throw new Error(`${row.plan}: disposition lacks immutable evidence`);
  }
  if (!Array.isArray(row.evidence) || !Array.isArray(row.artifacts)) {
    throw new Error(`${row.plan}: evidence/artifacts must be arrays`);
  }
  for (const artifact of row.artifacts) {
    const bytes = readFileSync(artifact.archivedPath);
    const byteHash = createHash("sha256").update(bytes).digest("hex");
    if (byteHash !== artifact.byteSha256) {
      throw new Error(`${row.plan}: byte hash changed for ${artifact.archivedPath}`);
    }
    if (artifact.originalTracked) {
      const blob = execFileSync("git", ["hash-object", artifact.archivedPath], { encoding: "utf8" }).trim();
      if (blob !== artifact.originalGitBlobSha || artifact.restoreStrategy !== "git-revert") {
        throw new Error(`${row.plan}: tracked provenance invalid for ${artifact.archivedPath}`);
      }
    } else if (artifact.originalGitBlobSha !== null || artifact.restoreStrategy !== "copy-back") {
      throw new Error(`${row.plan}: untracked provenance invalid for ${artifact.archivedPath}`);
    }
  }
  if (row.targetRiskTier === "auto") {
    if (row.disposition !== "retain-refresh-auto") {
      throw new Error(`${row.plan}: target-auto retention uses the wrong disposition`);
    }
    const body = readFileSync(row.originalPath, "utf8");
    if (!/^- \*\*Risk tier:\*\* auto$/m.test(body)) {
      throw new Error(`${row.plan}: retained auto plan lacks canonical risk metadata`);
    }
  } else if (row.disposition === "retain-refresh-auto") {
    throw new Error(`${row.plan}: retain-refresh-auto lacks targetRiskTier=auto`);
  }
}
const queue = readFileSync("plans/QUEUE.md", "utf8");
const base = execFileSync("git", ["merge-base", "origin/master", "HEAD"], { encoding: "utf8" }).trim();
const baseQueue = execFileSync("git", ["show", `${base}:plans/QUEUE.md`], { encoding: "utf8" });
const pending = [...queue.matchAll(/^- (\d{3,})\b/gm)].map((match) => match[1]);
const pendingCount = (id) => pending.filter((value) => value === id).length;
if (pendingCount("020") > 1) throw new Error("Plan 020 duplicated in queue");
const frozen = new Set(expected);
const nonFrozenRows = (text) => text.split(/\r?\n/).filter((line) => {
  const match = line.match(/^- (\d{3,})\b/);
  return match && !frozen.has(match[1]);
});
if (JSON.stringify(nonFrozenRows(queue)) !== JSON.stringify(nonFrozenRows(baseQueue))) {
  throw new Error("ordered non-frozen Pending sequence changed");
}
const changedProtected = execFileSync(
  "git", ["diff", "--name-only", base, "--", "plans"], { encoding: "utf8" },
).split(/\r?\n/).filter((path) => {
  const match = path.match(/^plans\/(?:archive\/)?(\d{3,})(?:-|\.)/);
  return match && !frozen.has(match[1]);
});
if (changedProtected.length) {
  throw new Error(`non-frozen plan artifacts changed: ${changedProtected.join(",")}`);
}
const archivedIds = new Set(
  readdirSync("plans/archive").map((name) => name.match(/^(\d{3,})-/)?.[1]).filter(Boolean),
);
for (const id of pending) {
  if (archivedIds.has(id)) throw new Error(`archived plan ${id} remains Pending`);
}
for (const name of readdirSync("plans").filter((value) => /^\d{3,}-.*\.md$/.test(value))) {
  const body = readFileSync(join("plans", name), "utf8");
  const id = basename(name).slice(0, 3);
  const readyAuto = /^- \*\*Status:\*\* ready for codex$/m.test(body) &&
    /^- \*\*Risk tier:\*\* auto$/m.test(body);
  if (readyAuto && pendingCount(id) !== 1) throw new Error(`ready auto plan ${id} not queued exactly once`);
}
execFileSync("git", ["diff", "--check"], { stdio: "inherit" });
NODE
node -e "const fs=require('fs'),path=require('path'),cp=require('child_process');const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const conflicts=[];function scan(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory()){if(ent.name!=='.git')scan(p);continue}if(!ent.isFile())continue;const b=fs.readFileSync(p);if(b.includes(0))continue;const rel=path.relative('.',p).split(path.sep).join('/');b.toString('utf8').split(/\r?\n/).forEach((line,i)=>{if(/^(?:<<<<<<<|=======|>>>>>>>)/.test(line))conflicts.push(rel+':'+(i+1))})}}scan('.');const tracked=cp.execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!f.startsWith('plans/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>k+':'+v);if(conflicts.length||missing.length||invalid.length){console.error({conflicts,missing,invalid});process.exit(1)}"
```

The implementation must also record read-only `git ls-remote` and PR-query receipts in the ledger.
Those network receipts are evidence inputs; the Verify gate itself remains deterministic.

## Rollback

Before reverting, run the restore helper with `--restore-untracked`; it verifies archived byte hashes,
refuses conflicts, and copy-backs only originally untracked/ignored sidecars. Then revert the
disposition commit so Git restores tracked live paths and removes tracked archive additions. Verify
the ledger's original hashes after both steps. Remote branches/PRs remain untouched throughout.
