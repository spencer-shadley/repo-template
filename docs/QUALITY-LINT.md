# Quality lint (required bootstrap)

**Bootstrap is incomplete without the fleet quality lint gate.** Small files and bounded complexity
are not optional style preference — they are the parallel-land and agent-maintainability bar.

## Required artifacts (every new / adopted repo)

| Path | Role |
|------|------|
| `eslint.quality.mjs` | Factory: `qualityRules()` — max-lines 500, complexity, sonarjs, unicorn, exhaustive core rules |
| `eslint.config.mjs` (or `.js`) | Flat config that **imports and spreads** `qualityRules()` |
| `package.json` scripts | `"lint": "eslint ."` (or equivalent) and **`verify` must run lint** |
| `eslint-suppressions.json` | Optional baseline from `eslint . --suppress-all` for grandfathered debt |

## Required dependencies (dev)

```text
eslint @eslint/js globals typescript-eslint eslint-plugin-sonarjs eslint-plugin-unicorn
```

(JS-only repos may call `qualityRules({ typescript: false })` and drop `typescript-eslint`.)

## Defaults (exhaustive)

From `workspace-lint-default` + task-dag proven gate, plus exhaustive core rules:

| Rule | Default |
|------|---------|
| `max-lines` | **500** (skip blank/comment) |
| `max-lines-per-function` | **80** |
| `complexity` | **15** |
| `max-depth` | **4** |
| `max-params` | **5** |
| `max-nested-callbacks` | **4** |
| `sonarjs/cognitive-complexity` | **15** |
| `max-classes-per-file` | **1** |
| Presets | `@eslint/js` recommended, `typescript-eslint` strict+stylistic, sonarjs recommended, unicorn recommended |
| Extras | eqeqeq, no-eval, prefer-const, require-await, no-duplicate-imports, … |

Tests (`*.test.*`, `e2e/`, `fixtures/`) turn off size/complexity caps.

## Bootstrap checklist

1. Copy `eslint.quality.mjs` + `eslint.config.mjs` from this template (repo-template root).
2. Install devDependencies listed above.
3. Add scripts:
   ```json
   "lint": "eslint .",
   "lint:baseline": "eslint . --suppress-all",
   "lint:baseline:prune": "eslint . --prune-suppressions"
   ```
4. Ensure `verify` (or land-gate) runs `pnpm lint`.
5. If the repo already has large files: `pnpm lint:baseline` once, commit suppressions — **new** violations fail.
6. Prefer split over suppress for anything you touch.

## Presence gate

`node scripts/verify-quality-lint-required.mjs` fails closed when quality lint is missing or not wired.
Template self-verify and consumer bootstrap should run this.

## Relationship to user-surface lint

| Gate | Purpose |
|------|---------|
| **user-surface-lint** | No developer/operator strings in user-facing copy |
| **quality-lint** | Small files, complexity, bug patterns |

Both are required for a complete bootstrap. Neither substitutes for the other.

## History

- Intended fleet-wide via AO `initiatives/workspace-lint-default.md` and adopt-project `eslint.quality.mjs`.
- Proven in **task-dag**; missing from template materialization until quality-lint capability landed.
