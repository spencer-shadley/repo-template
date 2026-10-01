# Security — secrets & leak playbook

1. **No secret is ever committed** — tokens, capability URLs (an ntfy topic IS a password), API
   keys, `.env`. The template `.gitignore` seeds the common patterns; extend it for this repo's
   shapes BEFORE the first secret exists. <!-- TODO(setup!): add repo-specific secret filename
   patterns before any real secret is created. -->
2. **Secrets live in**: gitignored local files (`.***-token`, `.notify.json`-style) or the
   platform's secret store — never in code, config-committed, or logs. Verify-gate/log output must
   not echo env (tails get pushed to branches and job logs).
3. **Leak playbook.** The fleet rule lives in [code SECURITY.md rule 3](https://github.com/spencer-shadley/code/blob/master/SECURITY.md). Rotate a
   credential **only** when it was truly exposed to the open internet (a public repo or fork, a
   public gist, paste, page, issue or package). A commit to a private repo, an agent chat, a host
   file or tool log and similar are **not** exposure and never trigger rotation; they get cleanup:
   scrub the value from every ref of history (empty the value, keep the shape) and refresh clones,
   gitignore the shape, write an RCA, add prevention so the same leak is refused next time, and log
   the incident (`.ops/incidents.jsonl`, kind:"other", plus severity).
4. **Tools**: secret-scanning hooks/apps (gitleaks, GitGuardian) are advisory layers — the rule is
   the design (secrets structurally outside the repo), not the scanner.
