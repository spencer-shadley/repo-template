# Security — secrets & leak playbook

1. **No secret is ever committed** — tokens, capability URLs (an ntfy topic IS a password), API
   keys, `.env`. The template `.gitignore` seeds the common patterns; extend it for this repo's
   shapes BEFORE the first secret exists (TODO(setup) in TODO.md).
2. **Secrets live in**: gitignored local files (`.***-token`, `.notify.json`-style) or the
   platform's secret store — never in code, config-committed, or logs. Verify-gate/log output must
   not echo env (tails get pushed to branches and job logs).
3. **Leak playbook** (evidence: a runner token was once committed plaintext — rotated same day):
   ROTATE immediately (the old value is dead the moment it touched a commit, even if scrubbed) →
   scrub the file (empty the value, keep the shape) → gitignore it → log the incident
   (`.ops/incidents.jsonl`, kind:"other", plus severity) → check whether anything consumed the
   leaked value.
4. **Tools**: secret-scanning hooks/apps (gitleaks, GitGuardian) are advisory layers — the rule is
   the design (secrets structurally outside the repo), not the scanner.
