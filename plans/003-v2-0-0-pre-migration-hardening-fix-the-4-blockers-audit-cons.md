# Plan 003: v2.0.0 pre-migration hardening — fix the 4 blockers + audit/consistency batch (MAJOR)

- **Project:** repo-template
- **Status:** ready for codex
- **Priority:** P1
- **Effort:** high

## Objective

Three independent audits (fresh-eyes, consistency, migration dry-run; 2026-07-02) reviewed this
template before fleet-wide migration. This plan fixes everything that changes conventions
(= MAJOR → v2.0.0). A follow-up plan adds the migration guide (MINOR). Verdict context: the ADR
doctrine core is ship-ready; the instantiation experience has 4 blocking defects.

## Changes (each item is independently verifiable)

### Blockers
1. **De-app-ify AGENTS.md content section.** Replace the declarative web-app sentences (the
   "verify gate rebuilds + redeploys, smokes `/health`, runs e2e" sentence; "at minimum lint,
   `typecheck`, test") with `{{VERIFY_GATE_SHAPE}}` + a `TODO(setup!):` comment carrying the
   web-app wording as an EXAMPLE; reword minimums to "every command listed above that exists for
   this stack must pass"; add "(or n/a — omit for this stack)" escape comments to the Telemetry,
   Infra-namespace, Tutorial, and design-sync sections.
2. **Add a `## Verify gate` section** to the AGENTS.md CONTENT section (below the /TEMPLATE-SELF
   marker): a fenced bash block containing `{{VERIFY_GATE_CMD}}` + `TODO(setup!):` + pointer to
   ADR-0002. (Today the only gate block lives in TEMPLATE-SELF and is stripped at instantiation.)
3. **Fix the setup audit.** Canonical marker = `TODO(setup):` / `TODO(setup!):` (colon required;
   `!` = must-answer-before-first-plan). Audit command (README):
   `grep -rnE 'TODO\(setup!?\):|\{\{[A-Z0-9_]+\}\}' --exclude-dir=.git .` — zero hits = configured.
   Reword the 4 prose self-matches (README table row + audit line, SECURITY.md:5, CHANGELOG
   convention note) to say "setup markers" without the literal pattern; add the missing colon in
   ci.yml's TODO echo.
4. **Tier the markers.** Promote to `TODO(setup!):` (~12): verify-gate cmd, autonomy/risk tiers,
   infra namespace, secret .gitignore shapes, ADR-0001 §2 (side effects), authoritative
   verification tool. Everything else stays `TODO(setup):`. State the two-tier rule in README.

### Consistency batch
5. Placeholders: unify on `{{UPPER_SNAKE_0-9}}` everywhere substituted at instantiation
   (`<project-name>` → `{{PROJECT_NAME}}` in README/ARCHITECTURE/OBSERVABILITY/RUNBOOK/QUEUE.md;
   drop `<FILL>`); angle-brackets remain ONLY inside docs/adr/0000-template.md (per-ADR fills) —
   say so there.
6. `.template-sync.json`: null sentinels for syncedVersion/syncedCommit/syncedAt + a
   `"_setup": "TODO(setup!): adopt-project fills these at instantiation"` key.
7. TEMPLATE-SELF verify gate: replace the stale hardcoded file list with a required-files check
   derived from a committed `template-manifest.json` (see item 12); extend the conflict-marker
   grep to `--include='*.json'` and TEMPLATE_VERSION.
8. **TODO.md restructure** (reconciles the two audits): TODO.md = ONLY out-of-tree/one-shot
   actions (register projects.json, create drain schedule, add watchlist entry, set sync anchors,
   verify enrollment via smoke plan, then delete this file) + one line disambiguating it from any
   `docs/todo.md` project backlog. In-tree markers are audited by the item-3 grep alone (no mirror
   duty — it drifted within 2 versions).
9. Workspace paths: prefix cross-repo commands with "from the workspace root:" and use
   `../agent-orchestrator/...` consistently; add the sibling-layout assumption note + the mirror
   caveat (read-only mirrors can't see `../`). Mark the incident-log CLI mentions honestly:
   "(ships with orchestrator plan 058 — until it lands, append the JSON line by hand)".
10. INCIDENTS.md stub: add the ADR-0003 carve-out sentence ("post-mortem prose LESSONS are context
    distilled from the jsonl record — the record itself is never maintained here"); state the
    incident schema ONCE (in .ops/README.md) and point AGENTS.md at it.
11. Small batch: README table gains rows for ci.yml, PR template, issue template, .ops/README.md,
    plans/archive/, .gitignore (+ "(deleted once setup completes)" annotation on TODO.md's row) and
    a 5-line **Start here** reading order (AGENTS → ARCHITECTURE → QUEUE → adr/0001 → .ops
    incidents); CHANGELOG scaffold comments move under [Unreleased]; gitignore `!.ops/` block moves
    to END with "keep LAST" + parent-dir caveat; issue template gains `labels: agent-review`;
    ci.yml gains `permissions: contents: read` + a concurrency cancel group; ADR-0000 Context adds
    "Cite evidence: incident entries, PR numbers, measured costs — assertion without evidence is a
    smell"; add missing Deciders lines to ADRs 0002-0005; PR template: replace the 5 checkboxes
    with 2 prose-answer prompts (external side effects? post-merge obligations?).
12. **`template-manifest.json`** (new, committed): every tracked path → one of
    `copy | merge | self | generated`, consumed by TEMPLATE-SELF's gate (item 7), adopt-project,
    and future migration plans. `self` = TEMPLATE_VERSION, TEMPLATE-SELF block, plans/ state,
    .ops data, CHANGELOG's release history. `merge` = AGENTS.md, .gitignore, CHANGELOG.md,
    README.md.
13. Ship `plans/drafts/000-smoke.md`: the standard enrollment-proof plan (touch a marker file,
    verify gate green) every adoption runs first.
14. Versioning: CHANGELOG `## [2.0.0]` entry (breaking: marker classes, TODO.md semantics,
    placeholder convention, AGENTS restructure) + TEMPLATE_VERSION=2.0.0.

## Out of scope

docs/MIGRATION.md + per-repo migration guidance (follow-up plan, v2.1.0); the incident-log CLI
itself (orchestrator plan 058); git tag (post-merge, driver).

## Acceptance criteria

- [ ] Fresh-clone simulation: after replacing every `{{...}}` and answering every `TODO(setup!)`,
      the item-3 audit grep returns ZERO (prove the audit can reach zero).
- [ ] AGENTS.md content section contains no unconditional app-only claims (grep for `/health`,
      `redeploys`, `typecheck` outside placeholder/example comments).
- [ ] `## Verify gate` section exists below the strip marker with `{{VERIFY_GATE_CMD}}`.
- [ ] template-manifest.json lists every tracked file; TEMPLATE-SELF gate validates against it.
- [ ] TODO.md contains only out-of-tree actions; `TODO(setup!)` count is 10-14.
- [ ] Verify gate green.

## Verify

```bash
! grep -rn '<<<<<<<' --include='*.md' --include='*.yml' --include='*.json' .
node -e "const m=require('./template-manifest.json');const {execSync}=require('child_process');const tracked=execSync('git ls-files',{encoding:'utf8'}).trim().split(/\r?\n/);const missing=tracked.filter(f=>!m[f]);if(missing.length){console.error('unmanifested:',missing);process.exit(1)}"
grep -q "2.0.0" TEMPLATE_VERSION
! grep -rn "TODO(setup)" --include='*.md' . | grep -v "TODO(setup)!*:" | grep -vE "setup markers|grep"
```

## Risk

Tier: `auto` (docs/config only per TEMPLATE-SELF). Large but mechanical; the acceptance greps are
the guardrails.

## AMENDMENT (2026-07-02): tree-lock gitignore

15. Template `.gitignore` gains `.orchestrator-tree.lock` (the per-repo working-tree lock file —
    live evidence: repos without the ignore show the active lock as untracked dirt, causing
    dirty-abort noise and risking WIP commits capturing an active lock).

## AMENDMENT 2 (2026-07-02, user survey decisions):

16. **ADR-0001 q6 (dependency posture) gets a workspace-default answer baked in** (repos may
    override with reasons): "Dependency upgrades are AUTOMATIC, majors included, via the
    discovery → triage → plan → loop pipeline: a deterministic finder files outdated-dep issues
    (self-deduplicating via fingerprints), triage authors upgrade plans, the verify gate + reviewer
    are the safety, revert is the fallback. No direct-merge bots. Upgrade plans for majors must
    cite the changelog/breaking-notes in the plan body." Remove the survey TODO for q6; keep an
    override slot.
17. **{{DEFAULT_EFFORT}} stays a per-repo `TODO(setup!):` question — never defaulted** — and the
    adjacent comment gains selection GUIDANCE: "Pick by cost-vs-first-attempt-quality: `low` =
    docs/config repos and repos with cheap, fast verify gates (retries are cheap); `medium` =
    product repos (default starting point); `high` = only where a failed first attempt is
    expensive (long verify gates like e2e suites — e.g. a repo whose gate takes 30+ min earns
    `high` to avoid iteration churn). The ladder auto-escalates per plan regardless; this sets the
    FLOOR. Repo priority offsets may modulate this in future (orchestrator #171)."
