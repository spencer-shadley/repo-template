# Setup survey — complete these, then delete this file

This file is only for out-of-tree or one-shot adoption work. In-tree setup markers are audited
directly by the README command; do not mirror them here. If the project has its own `docs/todo.md`,
that is a product backlog, not this adoption checklist.

- [ ] From the workspace root, register this repo in `agent-orchestrator/projects.json`.
- [ ] From the workspace root, create the Windmill drain schedule for this repo.
- [ ] From the workspace root, add this repo to agy `watchlist.tsv` with a focus prompt.
- [ ] Set template sync anchors in `.template-sync.json` after the first sync commit lands.
- [ ] Run the enrollment smoke plan from `plans/drafts/000-smoke.md` and verify the gate passes.
- [ ] Delete this file in the same change that completes adoption.
