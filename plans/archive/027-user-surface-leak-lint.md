# Plan: User-surface leak lint — deterministic gate for the no-developer-leakage doctrine

- **Project:** repo-template
- **Branch:** feat/027-user-surface-leak-lint
- **Status:** ready for user approval
- **Priority:** P2
- **Effort:** medium

## Objective

Mechanize the CEO-ratified doctrine (2026-07-13, agent-orchestrator `docs/DOCTRINE.md` §12): app
end-user surfaces must never render developer/operator internals. Ship a deterministic lint in the
template's verify overlay so every adopting app repo gets the gate by construction (DOCTRINE §0:
linter ≫ agent judgment).

## Context

**Origin incident (task-dag, 2026-07-13):** an unconfigured runtime rendered
"Set `TODOIST_CLIENT_ID`, `TODOIST_CLIENT_SECRET`, and `APP_PUBLIC_URL`, then restart the Docker
stack" to the end-user page, plus a 503 whose message named env vars, next to a disabled CTA with
no stated reason. The CEO ruled two principles for ALL apps: (1) developer internals never leak to
users; (2) users never see things they can't act on. Principle 1 is largely lintable — this plan.
Principle 2 is judgment (⚖) — review checklist, out of scope here beyond a checklist line.

**Reference implementation:** task-dag plan 184 (queued) adds a unit test asserting the
unconfigured state renders none of `TODOIST_CLIENT_ID|TODOIST_CLIENT_SECRET|APP_PUBLIC_URL|Docker`.
This plan generalizes that idea template-wide as a source lint, not a per-state render test.

**Template facts:** `TEMPLATE_VERSION` currently 2.4.x (task-dag's adoption of 2.4.0 is queued as
its plan 183); overlay contents tracked in `template-manifest.json`; downstream repos adopt via
per-app "adopt repo-template X.Y.Z" plans (the existing flywheel files those — see Notes).

## Changes

1. New lint script in the template's verify overlay (place per template convention, e.g.
   `scripts/lint-user-surface-leaks.mjs`): scans an app-configurable glob of **user-facing string
   sources** (client/web source dirs; server files that build user-visible response messages) for a
   deny-list:
   - env-var-shaped tokens in string literals: `\b[A-Z][A-Z0-9]*(_[A-Z0-9]+)+\b` (allowlist
     mechanism for legit acronyms),
   - infra/ops nouns in user-visible literals: `docker`, `compose`, `restart the .* stack`,
     `pg_dump`, `.env`,
   - absolute host paths (`[A-Z]:\\`, `/home/`, `/var/`, `/srv/`) in literals,
   - stack-trace/internal-error passthrough patterns where statically detectable.
   Config file (e.g. `.user-surface-lint.json`): include globs, per-line/per-file allowlist with
   required justification strings — same shape as the existing audit-allowlist convention.
2. Fixtures + self-test for the lint (good/bad samples), wired into the template's own verify.
3. Hook the lint into the template's standard verify-gate overlay so adopting repos run it in their
   gates by default; document the config knob for repos with no user surface (lint no-ops when the
   include globs are empty — explicit, committed choice).
4. Review-checklist line (wherever the template keeps its review checklist): "Every user-visible
   message/control is actionable by the user or clearly informational; disabled controls
   self-explain" — the ⚖ half of DOCTRINE §12.
5. `TEMPLATE_VERSION` bump + `CHANGELOG.md` + `template-manifest.json` entry.

## Out of scope

- Rolling the lint out to app repos (downstream adoption plans do that — see Notes).
- Runtime/render-time enforcement (per-state unit tests like task-dag 184's stay app-side).
- Mechanizing principle 2 (actionability) beyond the checklist line — it is judgment-tier.
- Any orchestrator changes.

## Acceptance criteria

- [ ] Lint script + config schema + fixtures exist; template's own verify runs the lint self-test
      green.
- [ ] Bad fixtures (env-var name, "restart the Docker stack", absolute path in a user-facing
      literal) FAIL the lint; allowlisted entries with justification pass.
- [ ] A repo with empty include globs no-ops with an explicit "no user surface configured" notice
      (not silent skip).
- [ ] `TEMPLATE_VERSION` bumped; CHANGELOG documents the new gate and cites DOCTRINE §12.
- [ ] Docs tell an adopting repo how to configure globs + allowlist in one short section.

## Verify

e2e n/a — template repo has no app runtime; the gate is the template's own checks + lint self-test.

```bash
node scripts/lint-user-surface-leaks.mjs --self-test
node scripts/lint-user-surface-leaks.mjs --config .user-surface-lint.json || true
corepack pnpm test 2>/dev/null || npm test 2>/dev/null || node --test 2>/dev/null || true
node -e "JSON.parse(require('fs').readFileSync('template-manifest.json','utf8')); JSON.parse(require('fs').readFileSync('.user-surface-lint.json','utf8'))"
```

(Implementer: replace the tolerant `|| true` lines with the template's real test entrypoint once
placed — the self-test line is the hard assertion and must stay first.)

## Notes / risks

- Downstream rollout relies on the existing template-adoption flywheel (per-app "adopt
  repo-template X.Y.Z" plans, e.g. task-dag 183 today). After merge, verify the next adoption wave
  includes this version; if no adoption plans appear for task-dag/gmail-markdown, file them.
- False positives are the main risk — hence allowlist-with-justification and the include-glob scope
  rather than repo-wide scanning. Bias the deny-list toward high-precision patterns; expand later.
- Doctrine reference: agent-orchestrator `docs/DOCTRINE.md` §12 (CEO 2026-07-13); origin incident
  and reference fixes: task-dag plans 181/184, agent-orchestrator issue #1213.
