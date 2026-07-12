# Setup survey — complete these, then delete this file

This file is only for out-of-tree or one-shot adoption work. In-tree setup markers are audited
directly by the README command; do not mirror them here. If the project has its own `docs/todo.md`,
that is a product backlog, not this adoption checklist.

- [ ] Enroll in the queue system per docs/QUEUE-ENROLLMENT.md (NEAR-MANDATORY — opt-out requires
      an accepted ADR).
- [ ] From the workspace root, add this repo to agy `watchlist.tsv` with a focus prompt.
- [ ] Set template sync anchors in `.template-sync.json` after the first sync commit lands.
- [ ] Answer the model-boundary setup questions in `AGENTS.md` and `docs/ARCHITECTURE.md`; if this
      repo has model-backed flows, update `model-boundary.json` with capabilities, gateway/adapter
      ownership, declared provider-specific paths, and the owning role. Do not pick a sacred default
      model.
- [ ] Run the enrollment smoke plan from `plans/drafts/000-smoke.md` and verify the gate passes.
- [ ] Delete this file in the same change that completes adoption.
