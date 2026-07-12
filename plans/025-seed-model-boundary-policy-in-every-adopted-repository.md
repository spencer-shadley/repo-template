# Plan 025: Seed model-boundary policy in every adopted repository

- **Project:** repo-template
- **Branch:** feat/025-seed-model-boundary-policy-in-every-adopted-repository
- **Status:** ready for codex
- **Priority:** P1
- **Effort:** medium

## Risk

- **Tier:** auto
- **Rationale:** Additive template policy/config/documentation only; no runtime service, secrets, or destructive behavior.

## Objective

Make every newly adopted repository declare its legitimate model boundaries and inherit the CEO rule that roles choose capabilities, never sacred providers.

## Context

- Agent-orchestrator's fleet invariant needs a small per-repo declaration to distinguish adapters/catalogs from forbidden provider selection in business logic.
- The template should seed the declaration and adoption questions so exceptions are explicit, reviewable, and machine-readable instead of grep suppressions.
- This plan is the new-repo half; the orchestrator plan implements the fleet scanner.

## Changes

1. Add a copied JSON model-boundary declaration with schema version, whether the repo serves model tasks, canonical gateway, allowed adapter/catalog/config paths, fixture/history exceptions, and owning role. Default to no direct provider invocation.
2. `template-manifest.json` — copy the declaration into adopted repos and validate its JSON shape.
3. Template `AGENTS.md` — add the CEO model-interchangeability invariant, serving provenance requirement, and the rule that provider-specific code lives only in declared adapters/configuration.
4. Adoption/setup docs — ask whether the project has model-backed flows, whether it consumes the fleet gateway or owns an application-specific adapter registry, and which capability/independence constraints apply. Do not ask users to choose a sacred default model.
5. `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`, `README.md`, and `CHANGELOG.md` — document scanner behavior, exception ownership, and remediation; update template version/release metadata per the repo's versioning policy.
6. Add template-self validation proving the declaration is copied, parseable, and contains no unresolved setup placeholders after adoption answers are applied.

## Out of scope

- Implementing the central scanner or model-serving gateway.
- Shipping provider SDKs/CLIs in the template.
- Rewriting already-adopted repos; fleet rollout is orchestrator-owned.

## Acceptance criteria

- [ ] A freshly instantiated repo contains a parseable model-boundary declaration with a fail-closed default.
- [ ] Adoption captures model-backed capabilities and adapter/gateway ownership without assigning a role to a vendor.
- [ ] Legitimate provider-specific paths require explicit machine-readable declarations and an owner.
- [ ] Template docs state that serving provenance remains mandatory even though selection is provider-neutral.
- [ ] Manifest, changelog/versioning, placeholder, and template-self checks pass.

## Verify

```bash
node -e "const fs=require('fs'),path=require('path'),cp=require('child_process');const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const exts=new Set(['.md','.yml','.json','.jsonl']);const conflicts=[];function scan(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory()){if(ent.name!=='.git')scan(p);continue}if(!ent.isFile())continue;const rel=path.relative('.',p).split(path.sep).join('/');if(ent.name!=='TEMPLATE_VERSION'&&!exts.has(path.extname(ent.name)))continue;const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);lines.forEach((line,i)=>{if(line.startsWith('<<<<<<<'))conflicts.push(rel+':'+(i+1)+':'+line)})}}scan('.');const tracked=cp.execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!f.startsWith('plans/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>k+':'+v);if(conflicts.length||missing.length||invalid.length){if(conflicts.length)console.error('conflict markers:',conflicts);if(missing.length)console.error('unmanifested:',missing);if(invalid.length)console.error('invalid manifest modes:',invalid);process.exit(1)}"
```

No e2e — template docs/config only.

## Notes / risks

Exception paths are not blanket permission: they identify where provider-specific mechanics may live, while role selection remains routed and audited.
