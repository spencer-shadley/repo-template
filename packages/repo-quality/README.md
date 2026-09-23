# @spencer-shadley/repo-quality

Living fleet quality kit published from [repo-template](https://github.com/spencer-shadley/repo-template).

Enforces bounded complexity, strict types, secret scanning, cycle-free dependency graphs, and test hermeticity across all fleet repositories.

## Exports

| Subpath | Purpose |
|---|---|
| `.` | Flat ESLint config factory `qualityRules()`, fleet rules (`prefer-typescript`, `no-eslint-inline-config`, `hermetic-git-spawn`), `knipConfig()`, constants |
| `./preload` | Shared hermetic test preload for `node --import` (code#6081) |
| `./hermetic-preload` | Canonical entrypoint for the shared hermetic test preload |
| `./hermetic-git-check.mjs` | Standalone CLI to check test files for unscoped git spawns |
| `./docs-only-gate.mjs` | Portable `DocsOnlySimpleDiffGateV1` simpleDiff validator (RT#422) |
| `./todo-issue-link.mjs` | Full GitHub issue URL validator for actionable TODO comments (RT#345) |
| `./knip.mjs` | Knip wrapper enforcing `rules.cycles = "error"` |
| `./jscpd.mjs` | jscpd v5 clone scanner wrapper |
| `./secret-scan.mjs` | Betterleaks wrapper (`dir`, `staged`, `history`) |

## Hermetic test preload (fleet law, code#6081)

Tests must be hermetic: a test may read and mutate only state it created under its own temp root.
It must not read or mutate real repositories, user or global git config, the home directory,
fleet state directories, or inherited seat environment (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, etc.).

### Adoption: one line in a repository's test script

Add `--import @spencer-shadley/repo-quality/preload` to the repository's test script in `package.json`:

```json
"test": "node --import @spencer-shadley/repo-quality/preload --test ..."
```

If the test suite runs under `tsx`:

```json
"test": "node --import @spencer-shadley/repo-quality/preload --import tsx --test ..."
```

### Guarantees

At process initialization:
1. **Removes git routing variables**: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_NAMESPACE`, `GIT_PREFIX`, and `GIT_GRAFT_FILE`.
2. **Removes git config injection variables**: `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`, and any `GIT_CONFIG_KEY_*` / `GIT_CONFIG_VALUE_*` pairs.
3. **Isolates user and global config**: sets `HOME`, `XDG_CONFIG_HOME`, and `GIT_CONFIG_GLOBAL` to an isolated per-process temporary directory, cleaned up on process exit.
4. **Disables system config**: sets `GIT_CONFIG_NOSYSTEM=1`.
5. **Prevents upward discovery**: sets `GIT_CEILING_DIRECTORIES` so git commands cannot climb out of the temp root.

### Explicit spawn helper

For test helpers or scripts that spawn `git` explicitly outside the preload:

```typescript
import { hermeticGitEnv } from "@spencer-shadley/repo-quality/preload";
import { execFileSync } from "node:child_process";

execFileSync("git", ["status"], { env: hermeticGitEnv() });
```

### Lint rule (`fleet/hermetic-git-spawn`)

The kit includes an ESLint rule `fleet/hermetic-git-spawn` (warn-level by default in test files) that flags `spawn`, `execFile`, and `spawnSync` invocations of `git` in test files unless the test runs under the preload or passes `hermeticGitEnv()`.
