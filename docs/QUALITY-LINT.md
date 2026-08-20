# Quality lint (required bootstrap)

**Bootstrap is incomplete without the fleet quality lint gate.** Small files and bounded complexity
are not optional style preference — they are the parallel-land and agent-maintainability bar.

## Required artifacts (every new / adopted repo)

| Path | Role |
|------|------|
| `@spencer-shadley/repo-quality` | Git-consumed kit: `qualityRules()`, Knip, Betterleaks, and advisory jscpd wrappers/config — max-lines 500, complexity, sonarjs, Unicorn's unopinionated safety baseline, exhaustive core rules |
| `eslint.config.mjs` (or `.js`) | Flat config that **imports and spreads** `qualityRules()` from the kit |
| `package.json` scripts | `"lint": "eslint ."` (or equivalent) and **`verify` must run lint** |
| `eslint-suppressions.json` | Required central baseline for grandfathered lint debt; generated with `eslint . --suppress-all` |

## Knip (required for TypeScript/JavaScript repos)

The kit owns `knip.json`, whose policy sets `rules.cycles` to `"error"`. Consumers must invoke the
published kit wrapper, not copy that file:

```json
"knip": "node ./node_modules/@spencer-shadley/repo-quality/knip.mjs"
```

The wrapper always runs both `knip` and `knip --strict`, failing on either result. Strict mode's
production analysis is complementary to the default run; it does not replace it. Put `pnpm knip`
in both `verify` and `verify:self` where that script exists. A local `knip.json` may carry a
repo-specific exception only with its tracked GitHub issue URL; it must not duplicate or become the
source of truth for the kit's cycle policy. Put any wrapper-merged, repo-specific ignores in
`knip.overrides.json` and record their issue URL in its `issue` field; the wrapper always restores
`cycles: "error"` after merging it.

Do not add `dependency-cruiser` fleet-wide. Use it only in a specific repository when its
transitive architectural rules cannot be expressed by Knip and `eslint-plugin-boundaries`.

## Secret scan (required, fail-closed)

The kit owns the Betterleaks recipe. Betterleaks must be installed on the host `PATH` (Code#1853
owns that host installation); a missing binary fails the gate with an install pointer and is never
treated as a skip. Do not add Gitleaks as a fleet recipe, and do not add Semgrep fleet-wide.

```json
"secret:dir": "node ./node_modules/@spencer-shadley/repo-quality/secret-scan.mjs dir",
"secret:staged": "node ./node_modules/@spencer-shadley/repo-quality/secret-scan.mjs staged",
"secret:history": "node ./node_modules/@spencer-shadley/repo-quality/secret-scan.mjs history"
```

`pnpm verify` must run `pnpm secret:dir`, which executes `betterleaks dir . --redact` and fails
on findings except a documented Betterleaks baseline. The land path runs `pnpm secret:staged`,
which executes `betterleaks git . --pre-commit --staged --redact`. During onboarding, run
`pnpm secret:history` once to scan the full history (`betterleaks git . --redact`).

Betterleaks defaults plus this wrapper are the policy source of truth. Do not copy a
`.betterleaks.toml` into every consumer. A repo-local `.betterleaks.toml` is allowed only for
additional, issue-linked allowlist/baseline entries; it must contain the tracked GitHub issue URL
that owns each exception.

## Duplicate-code scan (required, advisory v1)

The kit owns the jscpd v5 policy and wrapper. Consumers must run it through the kit rather than
vendoring the policy:

```json
"dup": "node ./node_modules/@spencer-shadley/repo-quality/jscpd.mjs"
```

Run `pnpm dup` in both `verify` and `verify:self` where that script exists. The scanner prints its
AI report to stdout and writes `.ops/jscpd-ai.txt`. Clone findings are advisory in v1 and never
fail verification; only a scanner execution failure is non-zero. A local `.jscpd.json` is not the
policy source of truth: it may not lower `minLines` below 10 or `minTokens` below 100, and it may
not add a fail threshold without a tracked GitHub issue URL. Promotion to fail-closed requires a
separate issue with measured clone volume.

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
| Presets | `@eslint/js` recommended, `typescript-eslint` strictTypeChecked, sonarjs recommended, Unicorn unopinionated |
| Extras | eqeqeq, no-eval, prefer-const, require-await, no-duplicate-imports, … |

Tests (`*.test.*`, `e2e/`, `fixtures/`) turn off size/complexity caps.

### Unicorn policy

The kit uses Unicorn's `unopinionated` preset so Unicorn maintains the safety baseline while the
fleet avoids a hand-maintained allowlist. It keeps mutation and bug checks such as
`no-array-sort`, `no-array-reverse`, `no-array-fill-with-reference-type`,
`no-accidental-bitwise-operator`, `no-impossible-length-comparison`,
`no-invalid-argument-count`, `require-array-sort-compare`, `no-unsafe-buffer-conversion`,
`no-xor-as-exponentiation`, and the `no-useless-*` family.

Only these representation-only rules are disabled by the kit: `consistent-compound-words`,
`consistent-existence-index-check`, `consistent-export-decorator-position`, `dom-node-dataset`,
`escape-case`, `import-style`, `number-literal-case`, `numeric-separators-style`,
`text-encoding-identifier-case`, `relative-url-style`, `no-negated-comparison`,
`no-negated-condition`, `prefer-switch`, `prefer-ternary`, and `prefer-top-level-await`.
`switch-case-braces` is not enabled because it is outside Unicorn's unopinionated preset.

## Bootstrap checklist

1. Add the Git dependency above (pin to a reviewed template commit or release tag in production).
2. Copy only the thin `eslint.config.mjs` from this template and retain its kit import.
3. Add scripts:
   ```json
   "knip": "node ./node_modules/@spencer-shadley/repo-quality/knip.mjs",
   "lint": "eslint .",
   "secret:dir": "node ./node_modules/@spencer-shadley/repo-quality/secret-scan.mjs dir",
   "lint:baseline": "eslint . --suppress-all",
   "lint:baseline:prune": "eslint . --prune-suppressions",
   "lint:dir-breadth": "node scripts/check-dir-breadth.ts",
   "verify": "pnpm knip && pnpm secret:dir && pnpm lint && pnpm lint:dir-breadth && …"
   ```
4. Copy `scripts/check-dir-breadth.ts` + `scripts/dir-breadth.json` (mega-dir cap; default **25** source peers per dir).
5. Ensure `verify` runs `pnpm knip`, `pnpm dup`, `pnpm secret:dir`, `pnpm lint`, **and** `lint:dir-breadth`; run `pnpm secret:staged` in the land path and `pnpm secret:history` once during onboarding.
6. If the repo already has large files / wide dirs: baseline once (below) — **new** violations fail.
7. Prefer split over suppress for anything you touch.

## Repo source stock (fleet SLI 30)

The per-file `max-lines` default of **500** is not a repo-total cap. Fleet SLI 30
`repo_source_stock` (owned by `spencer-shadley/code`) warns at **40,000 authored source LOC**
or **200 files**, with a split-trigger at **80,000 LOC** or **400 files**.

Contract: `github.com/spencer-shadley/code` —
`contracts/repo-source-stock-sli.v1.json` and
`docs/delivery-efficiency.md#sli-30-repo_source_stock`.

Measure from the code workspace:

```bash
node --experimental-strip-types tools/usage/sli/repo-source-stock-measure.ts
```

Land policy: fail only when `origin/master` is under the split-trigger and `HEAD` would cross it.
Already-over repos print `SPLIT-SIGNAL` and do not freeze land. Do not add an ESLint rule for
total repo LOC, and do not copy the Code measure/check into this template.

## Waiver / grandfather flow (do not block adding the linter)

Stricter rules land **even when the tree is dirty**. Flow:

1. **Wire the gate** (eslint quality + dir-breadth) into `verify`.
2. **Baseline existing debt** without fixing everything first: `pnpm lint:baseline` → commit
   `eslint-suppressions.json`. The kit rejects inline ESLint configuration, including disable and
   enable comments. JavaScript bootstrap/config boundaries may use an explicit `@stack-waiver` with
   an id and reason; this explains the TypeScript boundary but does not suppress unrelated lint rules.
   - Wide dirs: add allowlist row in `scripts/dir-breadth.json` with `"issue": "https://…/issues/N"`
3. **One GitHub issue per suppressed file** (and one per dir-breadth allowlist path).  
   - Title: `re-enable lint on path/to/file`  
   - **Do not** file a single mega-issue for the whole `eslint-suppressions.json` — that is too large to finish.  
   - Optional index: `eslint-suppressions.issues.json` mapping `path → issue URL`.  
4. **New code** must pass; only grandfathered suppressions may remain until **their** issue closes.

This is the standard path for adding stricter repo rules via linter: **gate first, fix forward via
per-file issues**, never wait for a perfect tree. There is no inline ESLint waiver path.

## Presence gate

`node scripts/verify-quality-lint-required.ts` fails closed when the kit dependency, its config
import, Knip wrapper path, or Betterleaks `secret:dir` wrapper invocation is missing; when a consumer vendors a local `eslint.quality.mjs`
factory; when a copied `knip.json` becomes cycle-policy SSOT; or when a consumer sets
`linterOptions.noInlineConfig: false`. A local `.betterleaks.toml` without a tracked issue URL is
also rejected. Template
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
