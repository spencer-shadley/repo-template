# Plan 028: Make repository steering binding and machine-addressable

- **Project:** repo-template
- **Branch:** feat/028-agents-md-declares-the-steering-sections-binding-for-all-age
- **Status:** merged
- **Requeue-reason:** manual: consolidated contradictory amendments and requested a fresh critic verdict before execution
- **Priority:** P2
- **Depends:** 029
- **Effort:** medium

## Objective

Every agent operating in a repository—interactive or autonomous—must treat the repository's
ratified responsibilities, non-goals, and product principles as binding steer.

Define one fleet-wide, machine-addressable principle format so discovery findings, reviews, issues,
implementation reports, and PR descriptions can cite the exact principle they affect. This plan
publishes the repository-side contract; agent-orchestrator #1223 separately owns loading the
contract into role prompts.

## Context

- CEO directives from 2026-07-13 authorize binding repository steer, deterministic class-tiered
  principle identifiers, one durable SLI and tunable SLO per principle, machine-parseable citations,
  and a minor template release followed by an auditable fleet-adoption wave.
- `TEMPLATE_VERSION` is `2.5.0`, but `CHANGELOG.md` has no `[2.5.0]` heading; the 2.5.0
  user-surface-lint entry remains under `[Unreleased]`.
- The prior Plan 028 text accumulated mutually incompatible flat `P<n>` and `P<X>.<Y>` amendments
  after its critic review. This contract replaces all prior wording; the final text must receive a
  fresh critic verdict before execution.
- Plan 001's old workspace-path contract is being retired. Its useful intent will be folded into the
  AI-first bootstrap wave after the canonical `C:\code\repos\<repo>` layout is settled.
- Under this repository's TEMPLATE-SELF policy, docs/config-only template changes are auto-tier.
  This is reversible, limited to three declared files, and carries direct human approval provenance.
  The critic should still review it at the protected/critical capability level; that classification
  must not create a redundant operator-approval stop.

## Changes

1. `AGENTS.md` — immediately before `## Responsibilities & non-goals`, add a repo-neutral
   `## Binding steer` section stating that:
   - every interactive or autonomous agent, including discovery, triage, review, implementation,
     and supervision, must read and obey `## Responsibilities & non-goals` and
     `## Product principles`;
   - a technically correct change that violates a ratified principle is a defect;
   - work beyond a ratified non-goal is rejected with the charter citation; and
   - findings, issues, reviews, implementation reports, and PR descriptions cite every applicable
     principle by its exact `P<X>.<Y>` identifier.
2. `AGENTS.md` — directly beneath `## Product principles`, before `{{PRODUCT_PRINCIPLES}}`, define
   one and only one principle schema:
   - every principle has a unique `P<X>.<Y>` identifier;
   - X and Y are non-negative integers compared numerically, not lexically;
   - lower X wins; when X ties, lower Y wins;
   - `P0.1` is the strongest reserved position and adding or moving anything ahead of it requires
     CEO sign-off;
   - suggested classes are guidance: P0 existential invariants, P1 safety/destruction invariants,
     P2 governance/platform integrity, P3 product guarantees, and P4 convenience/speculation;
   - every principle has a durable `SLI:` definition and a tunable `SLO:` target;
     `report-only` is valid while baselining;
   - an SLO breach is a defect tagged with the exact principle identifier; and
   - the setup marker requests 2–5 ratified principles with identifiers, SLI, SLO, decider, and
     decision date.
   Remove obsolete flat `P<n>`, P1-first, and string-lexicographic language.
3. `CHANGELOG.md` and `TEMPLATE_VERSION` — repair the release ledger and make the next minor release:
   - resolve the feature branch's base template version;
   - if that version lacks a heading, move every real `[Unreleased]` entry into a dated heading for
     that base version without losing content;
   - leave a clean `[Unreleased]` section;
   - compute `<same-major>.<minor+1>.0` and set `TEMPLATE_VERSION` to it; and
   - add a dated release section documenting binding steer, numeric `P<X>.<Y>` precedence, required
     SLI/SLO fields, and the principle-blind discovery/review incident motivating the change.
   For the audited base, this repairs `2.5.0` and releases `2.6.0`. If origin has advanced, apply
   the same algorithm and fail rather than overwrite an existing target-version heading.

## Out of scope

- Changing discovery, triage, critic, reviewer, manager, or supervisor prompts; agent-orchestrator
  #1223 owns runtime enforcement.
- Assigning identifiers or precedence to an adopted repository's existing principles; each repo
  ratifies its own ordering through its normal governed lane.
- Rewriting or synchronizing downstream repositories.
- Implementing SLI storage, dashboards, alerts, or automatic SLO enforcement.
- Workspace-layout prose from retired Plan 001.
- Waiting for a future sweep, filing downstream drift issues, or recording post-merge evidence in
  `028.result.md`. A separately numbered convergence plan owns that later lifecycle.

## Acceptance criteria

- [ ] `AGENTS.md` contains exactly one `## Binding steer` section immediately before
      `## Responsibilities & non-goals`.
- [ ] The block addresses interactive and autonomous agents and names discovery, triage, review,
      implementation, and supervision.
- [ ] It defines principle violations as defects, non-goal expansion as charter-cited rejection,
      and exact `P<X>.<Y>` citations.
- [ ] `## Product principles` requires unique `P<X>.<Y>` identifiers and numeric X-then-Y
      precedence.
- [ ] `P0.1` is strongest and placing anything ahead of it requires CEO approval.
- [ ] Every principle requires a durable `SLI:` and tunable `SLO:`; `report-only` is permitted.
- [ ] An SLO breach is an exact-principle-tagged defect.
- [ ] The setup marker requests identifier, SLI, SLO, decider, and date.
- [ ] No obsolete flat `P<n>`, P1-first, or lexical-order contract remains in the section.
- [ ] `TEMPLATE_VERSION` is exactly one minor above the feature branch's base, with patch zero.
- [ ] `CHANGELOG.md` contains headings for both the base and new version and preserves all prior
      Unreleased entries.
- [ ] Excluding orchestrator-owned `plans/` and `.ops/` artifacts, only `AGENTS.md`,
      `TEMPLATE_VERSION`, and `CHANGELOG.md` change.
- [ ] The template's complete self-verify gate passes.
- [ ] `plans/028.critic.md` records a fresh verdict for this consolidated content hash.

## Verify

No e2e — template policy and release metadata only.

```bash
node --input-type=module <<'NODE'
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const section = (text, heading) => {
  const start = text.indexOf(heading);
  if (start < 0) fail(`missing section: ${heading}`);
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
};
const normalize = (text) => text.replace(/\s+/g, " ").trim();

const agents = readFileSync("AGENTS.md", "utf8");
if ((agents.match(/^## Binding steer$/gm) || []).length !== 1) {
  fail("expected exactly one Binding steer section");
}
const bindingAt = agents.indexOf("## Binding steer");
const responsibilitiesAt = agents.indexOf("## Responsibilities & non-goals");
if (bindingAt < 0 || responsibilitiesAt < 0 || bindingAt > responsibilitiesAt) {
  fail("Binding steer must precede Responsibilities & non-goals");
}
if ((agents.slice(bindingAt, responsibilitiesAt).match(/^## /gm) || []).length !== 1) {
  fail("Binding steer must immediately precede Responsibilities & non-goals");
}

const binding = normalize(section(agents, "## Binding steer")).toLowerCase();
for (const required of [
  "responsibilities & non-goals", "product principles", "interactive", "autonomous",
  "discovery", "triage", "review", "implementation", "supervision", "defect", "charter",
  "p<x>.<y>",
]) {
  if (!binding.includes(required)) fail(`Binding steer missing: ${required}`);
}

const principles = normalize(section(agents, "## Product principles")).toLowerCase();
for (const required of [
  "unique", "p<x>.<y>", "non-negative integers", "numerically", "lower x wins",
  "lower y wins", "p0.1", "strongest", "ceo", "sli:", "slo:", "durable", "tunable",
  "report-only", "defect", "decider", "date",
]) {
  if (!principles.includes(required)) fail(`Product principles missing: ${required}`);
}
for (const stale of [/p<n>/i, /p1 is (?:the )?strongest/i, /lower-numbered principle/i]) {
  if (stale.test(principles)) fail(`obsolete numbering contract remains: ${stale}`);
}

const base = run("git", ["merge-base", "origin/master", "HEAD"]);
const baseVersion = run("git", ["show", `${base}:TEMPLATE_VERSION`]);
const match = baseVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) fail(`invalid base version: ${baseVersion}`);
const expected = `${match[1]}.${Number(match[2]) + 1}.0`;
const actual = readFileSync("TEMPLATE_VERSION", "utf8").trim();
if (actual !== expected) fail(`expected ${expected}; got ${actual}`);

const before = run("git", ["show", `${base}:CHANGELOG.md`]);
const changelog = readFileSync("CHANGELOG.md", "utf8");
for (const version of [baseVersion, expected]) {
  if (!changelog.includes(`## [${version}]`)) fail(`missing changelog ${version}`);
}
for (const bullet of section(before, "## [Unreleased]")
  .split(/\r?\n/).filter((line) => line.startsWith("- "))) {
  if (!changelog.includes(bullet)) fail(`lost prior Unreleased entry: ${bullet}`);
}
const release = normalize(section(changelog, `## [${expected}]`)).toLowerCase();
for (const required of ["binding steer", "p<x>.<y>", "sli", "slo"]) {
  if (!release.includes(required)) fail(`release notes missing: ${required}`);
}

const changed = new Set();
for (const args of [
  ["diff", "--name-only", `${base}...HEAD`],
  ["diff", "--name-only"],
  ["diff", "--cached", "--name-only"],
]) {
  for (const file of run("git", args).split(/\r?\n/).filter(Boolean)) changed.add(file);
}
const allowed = new Set(["AGENTS.md", "TEMPLATE_VERSION", "CHANGELOG.md"]);
const unexpected = [...changed].filter((file) =>
  !file.startsWith("plans/") && !file.startsWith(".ops/") && !allowed.has(file));
if (unexpected.length) fail(`unexpected files: ${unexpected.join(", ")}`);

console.log(`binding steer verified: ${baseVersion} -> ${expected}`);
NODE
node scripts/lint-user-surface-leaks.mjs --self-test
node -e "const fs=require('fs'),path=require('path'),cp=require('child_process');const m=require('./template-manifest.json');const allowed=new Set(['copy','merge','self','generated']);const exts=new Set(['.md','.yml','.json','.jsonl']);const conflicts=[];function scan(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory()){if(ent.name!=='.git')scan(p);continue}if(!ent.isFile())continue;const rel=path.relative('.',p).split(path.sep).join('/');if(ent.name!=='TEMPLATE_VERSION'&&!exts.has(path.extname(ent.name)))continue;const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);lines.forEach((line,i)=>{if(line.startsWith('<<<<<<<'))conflicts.push(rel+':'+(i+1)+':'+line)})}}scan('.');const tracked=cp.execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const missing=tracked.filter(f=>!f.startsWith('.ops/archive/')&&!f.startsWith('plans/')&&!m[f]);const invalid=Object.entries(m).filter(([,v])=>!allowed.has(v)).map(([k,v])=>k+':'+v);if(conflicts.length||missing.length||invalid.length){if(conflicts.length)console.error('conflict markers:',conflicts);if(missing.length)console.error('unmanifested:',missing);if(invalid.length)console.error('invalid manifest modes:',invalid);process.exit(1)}"
```

## Risk

- **Tier:** auto
- **Rationale:** repo-template's own TEMPLATE-SELF policy assigns docs/config-only changes to the
  autonomous lane. This three-file change is reversible, contains no runtime or external side effect,
  and is explicitly commissioned by the CEO. The protected/critical critic classification still
  applies to review depth, but does not revoke the repository's auto-tier policy or create a second
  approval requirement.
- **Rollback:** revert the three implementation files before downstream synchronization. After
  adoption, each downstream repository uses its own governed template rollback or follow-up plan.

## Coordination

- The later bootstrap plan uses a different `AGENTS.md` anchor and depends on this plan.
- Do not claim prompt-level enforcement until agent-orchestrator #1223 lands.
- Do not claim fleet convergence from this merge alone. A separate post-merge plan snapshots every
  stale repo and proves exactly one disposition: already synchronized, covered by an existing sync
  plan, or represented by one drift issue.

## Retry history

- 2026-07-20T17:56:21.127Z manual (manual): consolidated contradictory amendments and requested a fresh critic verdict before execution
