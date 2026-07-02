## Checklist
- [ ] Verify gate covers every artifact type this PR touches (ADR-0002)
- [ ] New external side-effect? → rate-limit/backoff/breaker + reversibility note (ADR-0001 §2)
- [ ] Decision with lasting consequences? → ADR added/updated
- [ ] Operational incident hit while building this? → logged to `.ops/incidents.jsonl`
- [ ] User-facing behavior changed? → docs/tutorial/post-merge obligations handled (ADR-0001 §8)
