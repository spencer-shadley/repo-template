# Runbook — {{PROJECT_NAME}}

Repo-specific recovery recipes. Workspace-wide recipes (queue wedges, breaker handling, push-race
recovery), from the project root in the standard sibling layout:
`../agent-orchestrator/docs/RUNBOOK.md`.

Read-only mirrors may not have `../agent-orchestrator`; use the workspace root checkout for
cross-repo recovery commands.

## Model-boundary scanner remediation

If the fleet scanner flags provider-specific code, first inspect `model-boundary.json`. Legitimate
adapter, catalog, configuration, fixture, and history paths must be declared there with the owning
role; undeclared provider calls in business logic should be routed through the declared gateway or
adapter registry instead. Keep serving provenance intact when remediating a finding so audits can
still identify which provider/model served each request.

If the repo does not serve model tasks, leave `servesModelTasks` false, keep
`directProviderInvocation` forbidden, and remove or relocate the provider-specific code instead of
adding a blanket exception.

<!-- TODO(setup): add the 3 most likely operational emergencies for THIS repo and their exact
     recovery commands (e.g. redeploy, restore, reset dev DB, re-auth a token). -->
