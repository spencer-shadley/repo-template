# Fleet package-manager selection

[Workspace Lifecycle #47](https://github.com/spencer-shadley/workspace-lifecycle/issues/47)
owns the migration to one latest-tracking package-manager selection and native store
maintenance that cannot overlap active consumers. This template serves its charter row:
**Own generic template files, portable repository semantics, manifests, and setup placeholders.**

## Published selection

Read the selection from the existing package export:

```ts
import selection from "@spencer-shadley/repo-quality/package-manager-selection.json" with { type: "json" };
```

`FleetPackageManagerSelectionV1` has four fields: `schema`, `dispatcher`, `manager`, and
`channel`. The owner currently selects Corepack, pnpm, and the `latest` channel. The
publication contains no resolved version. Consumers reference this owner; adoption does
not copy the JSON into individual repositories or introduce local exception lists.

## Existing enrollment owner

The existing ordinary-user enrollment/update owner derives this command from the selection:

```text
corepack install --global pnpm@latest
```

Corepack resolves the channel, installs the selected release, and activates its native
Known Good Release. The existing update cadence repeats that operation to track future
major releases. A normal versionless invocation uses the current Known Good value; it
does not itself provide continuous latest-channel convergence.

The enrollment receipt must retain the selected version, actual dispatcher identity,
`COREPACK_HOME`, actual OS user identity, native command settlement, and the installed
package-manager observation. The command runs through the existing command owner and
its admission. It does not create a new updater, schedule, store lock, or controller.
Machine Corepack installation remains with its existing Windows Maintenance owner.

## Repository consumer contract

After the existing preparation/readiness owner supports this contract, an enrolled
repository declares the manager name without an individual version:

```json
{
  "devEngines": {
    "packageManager": { "name": "pnpm", "onFail": "error" }
  }
}
```

Remove the top-level `packageManager` pin only in that repository's reviewed migration.
Existing pins remain enforced until then. Do not set `packageManager` to `pnpm@latest`:
Corepack requires an exact semantic version in that field. Do not disable project-spec
enforcement to evade an unmigrated declaration. Keep `COREPACK_ENABLE_AUTO_PIN=0` so an
ordinary command cannot recreate a project pin.

The existing `check-supply-chain-controls.ts` SC4 check accepts this name-only contract
when there is no top-level pin and no `engines.pnpm` version. It continues to accept an
unmigrated exact pin with its matching engine, while rejecting `pnpm@latest`, a consumer
version range, a different manager, or warning-only enforcement. Other supply-chain
checks retain their existing behavior.

The consumer uses `corepack pnpm ...` or the verified Corepack shim, under the same
`COREPACK_HOME` that enrollment maintains. `corepack pnpm --version` observes the selected
manager; dependency installation, source binding, native settlement, and repository
readiness stay with the existing install owner. **Bare `corepack install` is incompatible
with a name-only declaration**, so migrate that readiness step in the paired owner before
removing its pin. The LocalCi environment and other repository controls must describe
the actual migrated behavior; this publication does not change their current versions.

This behavior is confirmed in released
[Corepack 0.36.0](https://github.com/nodejs/corepack/tree/7a4c30b1aecece619a3e01db757f0eb947414b1f),
particularly its `sources/specUtils.ts`, `sources/Engine.ts`, and
`sources/commands/InstallGlobal.ts`. That is compatibility evidence, not a fleet pin.
An older dispatcher must be qualified or converged by its existing owner.

## Native store boundary and acceptance

Released pnpm 12.18.0 has shared store-use and exclusive prune admission in
[`store_lock.rs`](https://github.com/pnpm/pnpm/blob/0470052291b2ba369be93a9b696e0a0097722ba5/pnpm/crates/store-dir/src/store_lock.rs).
Installs, fetch, configuration dependencies, engine setup, and store additions join that
native admission; pruning holds the exclusive side before its census and deletions.
The version is evidence of the upstream capability, not the selection in this contract.

Native pnpm 11.17.0 and 12.18.0 both use the `v11` store namespace. Remaining pnpm 11
consumers do not acquire the newer operation lock, so a manager update alone does not
establish safe mixed-consumer pruning. The Windows lock directory comes from the actual
user token's Local App Data; changing environment variables or sharing `COREPACK_HOME`
does not merge different users' lock namespaces. Unix consumers must also agree on the
native per-user namespace, including `XDG_RUNTIME_DIR` when used.

The paired rollout acceptance therefore records:

1. Enrollment and each migrated consumer resolve the same published selection and Corepack home.
2. Existing repository preparation succeeds with the name-only declaration and preserves its source and native-command evidence.
3. FHR maintenance and every actual store consumer use compatible native admission under the same actual user/store namespace.
4. Two simultaneous installs from different checkouts can consume the store; prune cannot enter its destructive phase until both release it, and normal completion or owned cleanup settles the native scope.
5. Older or differently scoped consumers remain explicit adoption residuals until their owner migrates them.

The focused contract test uses the actual installed Corepack dispatcher with private fake
manager binaries, private Known Good files, and networking disabled. It tests dispatch,
pin preservation, home separation, and incompatible readiness commands. It does not run
pnpm, prune a store, qualify Windows native exclusion, or establish fleet adoption.

## Current publication scope

This source increment publishes the shared selection and consumer contract. Existing
repository pins, host installations, recurring schedules, LocalCi readiness profiles, and
FHR pruning behavior remain at their actual adoption state. Paired CLI readiness and
Code enrollment changes, followed by real per-host consumer acceptance, complete the
operative rollout under Workspace Lifecycle #47 and FHR #530.
