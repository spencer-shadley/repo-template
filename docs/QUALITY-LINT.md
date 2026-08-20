# Quality lint (required bootstrap)

**Bootstrap is incomplete without the fleet quality lint gate.** Small files and bounded complexity
are not optional style preference — they are the parallel-land and agent-maintainability bar.

## Required artifacts (every new / adopted repo)

| Path | Role |
|------|------|
| `@spencer-shadley/repo-quality` | Git-consumed kit: `qualityRules()` — max-lines 500, complexity, sonarjs, unicorn, exhaustive core rules |
| `eslint.config.mjs` (or `.js`) | Flat config that **imports and spreads** `qualityRules()` from the kit |
| `package.json` scripts | `"lint": "eslint ."` (or equivalent) and **`verify` must run lint** |
| `eslint-suppressions.json` | Optional baseline from `eslint . --suppress-all` for grandfathered debt |

## Required dependency (dev)

```json
"@spencer-shadley/repo-quality": "github:spencer-shadley/repo-template#path:packages/repo-quality"
```

The kit owns ESLint, `@eslint/js`, `globals`, `typescript-eslint`, sonarjs, and unicorn. JS-only
repos may call `qualityRules({ typescript: false })`.

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
| Presets | `@eslint/js` recommended, `typescript-eslint` strictTypeChecked, sonarjs recommended, unicorn recommended |
| Extras | eqeqeq, no-eval, prefer-const, require-await, no-duplicate-imports, … |

Tests (`*.test.*`, `e2e/`, `fixtures/`) turn off size/complexity caps.

## Bootstrap checklist

1. Add the Git dependency above (pin to a reviewed template commit or release tag in production).
2. Copy only the thin `eslint.config.mjs` from this template and retain its kit import.
3. Add scripts:
   ```json
   "lint": "eslint .",
   "lint:baseline": "eslint . --suppress-all",
   "lint:baseline:prune": "eslint . --prune-suppressions",
   "lint:dir-breadth": "node scripts/check-dir-breadth.ts",
   "verify": "pnpm lint && pnpm lint:dir-breadth && …"
   ```
4. Copy `scripts/check-dir-breadth.ts` + `scripts/dir-breadth.json` (mega-dir cap; default **25** source peers per dir).
5. Ensure `verify` (or land-gate) runs `pnpm lint` **and** `lint:dir-breadth`.
6. If the repo already has large files / wide dirs: baseline once (below) — **new** violations fail.
7. Prefer split over suppress for anything you touch.

## Disable / grandfather flow (do not block adding the linter)

Stricter rules land **even when the tree is dirty**. Flow:

1. **Wire the gate** (eslint quality + dir-breadth) into `verify`.
2. **Baseline existing debt** without fixing everything first:
   - File-level / rule debt: `pnpm lint:baseline` → commit `eslint-suppressions.json`
   - Or per-file: `/* eslint-disable max-lines -- deferred: https://github.com/<owner>/<repo>/issues/N */`
   - Wide dirs: add allowlist row in `scripts/dir-breadth.json` with `"issue": "https://…/issues/N"`
3. **One GitHub issue per suppressed file** (and one per dir-breadth allowlist path).  
   - Title: `re-enable lint on path/to/file`  
   - **Do not** file a single mega-issue for the whole `eslint-suppressions.json` — that is too large to finish.  
   - Optional index: `eslint-suppressions.issues.json` mapping `path → issue URL`.  
   - Inline disables must cite **that file’s** issue URL.
4. **New code** must pass; only grandfathered paths may stay disabled until **their** issue closes.

This is the standard path for adding stricter repo rules via linter: **gate first, fix forward via per-file issues**, never wait for a perfect tree.

## Presence gate

`node scripts/verify-quality-lint-required.ts` fails closed when the kit dependency or its config
import is missing, and when a consumer vendors a local `eslint.quality.mjs` factory. Template
self-verify proves the kit package and the thin config import are present. Template consumers SHOULD
migrate from copied factories to the Git dependency before adopting this structural MAJOR change.

## Relationship to user-surface lint

| Gate | Purpose |
|------|---------|
| **user-surface-lint** | No developer/operator strings in user-facing copy |
| **quality-lint** | Small files, complexity, bug patterns |

Both are required for a complete bootstrap. Neither substitutes for the other.

## History

- Intended fleet-wide via AO `initiatives/workspace-lint-default.md` and the repo-quality kit.
- Proven in **task-dag**; the factory now has one Git-consumable source of truth instead of copies.
