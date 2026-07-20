# Plan 029: Ignore orchestrator transient state without hiding durable incidents

- **Project:** repo-template
- **Branch:** feat/029-ignore-orchestrator-transient-state-without-hiding-durable-i
- **Status:** ready for codex
- **Requeue-reason:** manual: refreshed to address every critic finding before fleet execution
- **Priority:** P1
- **Effort:** low

## Objective

Keep routine orchestrator runtime state from dirtying `repo-template` and aborting every scheduled
drain, while preserving `.ops/incidents.jsonl` as durable tracked evidence.

## Context

- The live checkout is currently dirty from `.ops-auto-commit-state.json`; this untracked runtime
  state is enough for the fail-closed drain preflight to abort before selecting a plan.
- `agent-orchestrator/lib/artifacts.invariant.test.mjs` independently detects that repo-template is
  missing transient ignore coverage required across queue-enabled repositories.
- The shared runtime inventory also includes per-resource `.orchestrator-*.lease` files and
  `.ops/freeze-expired.notify`. These are coordination/notification state, not repository content.
- `.ops/incidents.jsonl` is intentionally tracked and append-only. The broad `.ops` re-inclusion in
  `.gitignore` must remain fail-closed so no durable incident evidence is accidentally hidden.
- `.orchestrator-tree.lock` currently appears twice in `.gitignore`; this is harmless but should be
  normalized while touching the exact block.
- This is the immediate unblock. The separately governed `.ops` external-store migration owns the
  durable class fix for tracked operational telemetry and must not be duplicated here.
- Direct human authorization comes from the 2026-07-20 request to get repo-template ready for fleet
  autonomy. Under the repository's TEMPLATE-SELF policy this isolated config/docs repair is
  auto-tier.

## Changes

1. `.gitignore` — keep one `.orchestrator-tree.lock` rule and add exact transient rules for:
   - `.orchestrator-*.lease`;
   - `.ops-auto-commit-state.json`; and
   - `.ops/freeze-expired.notify`.
   Place the freeze notification rule after the `.ops/**` re-inclusion so the precise ignore wins.
   Do not add a blanket `.ops` ignore.
2. `CHANGELOG.md` — add an Unreleased Changed entry explaining that queue runtime state no longer
   wedges scheduled drains and that durable incident evidence remains tracked.

## Out of scope

- Rewriting, deduplicating, rotating, or committing the current `.ops/incidents.jsonl`.
- Moving `.ops` outside the repository; agent-orchestrator Plans 418–419 own that migration.
- Changing drain dirty-tree policy, runtime artifact definitions, projects registry shape,
  schedules, breakers, or live checkout state.
- Implementing the AI-first bootstrap contract, Plan 028, or changing `TEMPLATE_VERSION`.

## Acceptance criteria

- [ ] `.orchestrator-tree.lock`, every root `.orchestrator-*.lease`,
      `.ops-auto-commit-state.json`, and `.ops/freeze-expired.notify` are ignored.
- [ ] `.ops/incidents.jsonl` remains unignored and tracked.
- [ ] No blanket `.ops/` or `.ops/**` ignore is introduced.
- [ ] `.orchestrator-tree.lock` appears exactly once in `.gitignore`.
- [ ] The changelog records the fleet-starvation fix under Unreleased.
- [ ] Excluding loop-owned `plans/` and `.ops/` artifacts, only `.gitignore` and `CHANGELOG.md`
      change.
- [ ] The complete template self gate passes.

## Verify

No e2e — ignore policy and changelog only.

```bash
git check-ignore --no-index --quiet .orchestrator-tree.lock &&
git check-ignore --no-index --quiet .orchestrator-test.lease &&
git check-ignore --no-index --quiet .ops-auto-commit-state.json &&
git check-ignore --no-index --quiet .ops/freeze-expired.notify &&
! git check-ignore --no-index --quiet .ops/incidents.jsonl &&
! grep -qxE '^\.ops/(\*\*)?$' .gitignore &&
test "$(grep -c '^\.orchestrator-tree\.lock$' .gitignore)" -eq 1 &&
test "$(grep -c '^\.orchestrator-\*\.lease$' .gitignore)" -eq 1 &&
test "$(grep -c '^\.ops-auto-commit-state\.json$' .gitignore)" -eq 1 &&
test "$(grep -c '^\.ops/freeze-expired\.notify$' .gitignore)" -eq 1 &&
node --input-type=module <<'NODE'
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const changelog = readFileSync("CHANGELOG.md", "utf8");
const unreleased = changelog
  .split(/^## \[Unreleased\]\s*$/m)[1]
  ?.split(/^## \[/m)[0] ?? "";
if (!/runtime state|scheduled drain|dirty/i.test(unreleased)) {
  console.error("Unreleased changelog does not describe the runtime-state drain unblock");
  process.exit(1);
}

const base = execFileSync("git", ["merge-base", "origin/master", "HEAD"], {
  encoding: "utf8",
}).trim();
const changed = execFileSync("git", ["diff", "--name-only", base, "--"], {
  encoding: "utf8",
}).trim().split(/\r?\n/).filter(Boolean);
const unexpected = changed.filter((path) =>
  ![".gitignore", "CHANGELOG.md"].includes(path) &&
  !path.startsWith("plans/") &&
  !path.startsWith(".ops/")
);
if (unexpected.length) {
  console.error("unexpected changed files:", unexpected);
  process.exit(1);
}
NODE
[ "$?" -eq 0 ] &&
node scripts/lint-user-surface-leaks.mjs --self-test &&
node -e "const fs=require('fs'),path=require('path'),cp=require('child_process');const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const exts=new Set(['.md','.yml','.json','.jsonl']);const conflicts=[];function scan(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory()){if(ent.name!=='.git')scan(p);continue}if(!ent.isFile())continue;const rel=path.relative('.',p).split(path.sep).join('/');if(ent.name!=='TEMPLATE_VERSION'&&!exts.has(path.extname(ent.name)))continue;const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);lines.forEach((line,i)=>{if(line.startsWith('<<<<<<<'))conflicts.push(rel+':'+(i+1)+':'+line)})}}scan('.');const tracked=cp.execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!f.startsWith('plans/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>k+':'+v);const boundaryErrors=[];if(m['model-boundary.json']!=='copy')boundaryErrors.push('model-boundary.json must be manifest copy');let b;try{const raw=fs.readFileSync('model-boundary.json','utf8');if(/TODO\\(setup!?\\):|\\{\\{[A-Z0-9_]+\\}\\}/.test(raw))boundaryErrors.push('model-boundary.json has unresolved setup placeholders');b=JSON.parse(raw)}catch(e){boundaryErrors.push('model-boundary.json parse failed: '+e.message)}if(b){if(b.schemaVersion!==1)boundaryErrors.push('schemaVersion must be 1');if(b.servesModelTasks!==false)boundaryErrors.push('default servesModelTasks must be false');if(b.directProviderInvocation!=='forbidden')boundaryErrors.push('default directProviderInvocation must be forbidden');if(b.servingProvenanceRequired!==true)boundaryErrors.push('servingProvenanceRequired must be true');if(typeof b.ownerRole!=='string'||!b.ownerRole.trim())boundaryErrors.push('ownerRole required');const p=b.allowedProviderSpecificPaths;if(!p||typeof p!=='object')boundaryErrors.push('allowedProviderSpecificPaths required');else for(const k of ['adapters','catalogs','configuration','fixtures','history'])if(!Array.isArray(p[k]))boundaryErrors.push('allowedProviderSpecificPaths.'+k+' must be an array')}if(conflicts.length||missing.length||invalid.length||boundaryErrors.length){if(conflicts.length)console.error('conflict markers:',conflicts);if(missing.length)console.error('unmanifested:',missing);if(invalid.length)console.error('invalid manifest modes:',invalid);if(boundaryErrors.length)console.error('model boundary:',boundaryErrors);process.exit(1)}"
```

## Notes / risks

The precise rules are reversible and do not relax the drain's fail-closed dirty-tree gate. A
future runtime artifact still fails dirty until it is explicitly registered, which preserves the
intended discovery pressure. The current checkout's already-created transient file becomes ignored
after this lands; no cleanup command is needed.

## Retry history


- 2026-07-20T17:50:23.063Z manual (manual): refreshed to address every critic finding before fleet execution
- 2026-07-20T17:47:03.645Z manual (manual): Plan 029 fixes gitignore runtime-state starvation; Plan 028 governs binding steer and only shares an additive changelog file
