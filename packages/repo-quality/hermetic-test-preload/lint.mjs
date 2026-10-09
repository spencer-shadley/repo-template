// @generated from hermetic-test-preload/lint.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
const GIT_SPAWN_CALLEES = new Set([
    "spawn",
    "spawnSync",
    "execFile",
    "execFileSync",
    "exec",
    "execSync",
]);
const SHELL_STRING_CALLEES = new Set(["exec", "execSync"]);
const HERMETIC_BOUNDARY_PATTERN = /@hermetic-boundary\s+reason="[^"]+"/;
const HERMETIC_ENV_PATTERN = /hermetic/i;
function calleeName(callee) {
    if (callee.type === "Identifier")
        return callee.name;
    if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
        return callee.property.name;
    }
    return undefined;
}
function spawnsGit(name, first) {
    if (!first)
        return false;
    if (first.type === "Literal" && typeof first.value === "string") {
        if (first.value === "git")
            return true;
        return SHELL_STRING_CALLEES.has(name) && /^git(\s|$)/.test(first.value);
    }
    if (first.type === "TemplateLiteral" && SHELL_STRING_CALLEES.has(name)) {
        const head = first.quasis[0]?.value.cooked ?? "";
        return /^git(\s|$)/.test(head);
    }
    return false;
}
/** Custom rule: hermetic/no-unscoped-git-spawn (repo-template#431, DOCTRINE §65). */
export const noUnscopedGitSpawnRule = {
    meta: {
        type: "problem",
        docs: {
            description: "Test code must spawn Git with an env from the hermetic-test helper, or declare an explicit @hermetic-boundary.",
            recommended: true,
        },
        schema: [],
        messages: {
            unscopedGitSpawn: 'Test spawns Git without the hermetic-test helper env. Pass `env` from buildHermeticTestEnvironment(), or mark a deliberate boundary test with // @hermetic-boundary reason="...".',
        },
    },
    create(context) {
        const source = context.sourceCode;
        const boundary = source
            .getAllComments()
            .some((comment) => HERMETIC_BOUNDARY_PATTERN.test(comment.value));
        if (boundary)
            return {};
        // Names bound to a hermetic helper result, e.g. `const h = buildHermeticTestEnvironment()`.
        const hermeticBindings = new Set();
        const isHermeticEnv = (value) => {
            if (HERMETIC_ENV_PATTERN.test(source.getText(value)))
                return true;
            return (value.type === "MemberExpression" &&
                value.object.type === "Identifier" &&
                hermeticBindings.has(value.object.name));
        };
        return {
            VariableDeclarator(node) {
                if (node.id.type === "Identifier" &&
                    node.init &&
                    HERMETIC_ENV_PATTERN.test(source.getText(node.init))) {
                    hermeticBindings.add(node.id.name);
                }
            },
            CallExpression(node) {
                const name = calleeName(node.callee);
                if (!name || !GIT_SPAWN_CALLEES.has(name))
                    return;
                const args = node.arguments;
                if (!spawnsGit(name, args[0]))
                    return;
                const scoped = args.some((arg) => arg.type === "ObjectExpression" &&
                    arg.properties.some((prop) => prop.type === "Property" &&
                        ((prop.key.type === "Identifier" && prop.key.name === "env") ||
                            (prop.key.type === "Literal" && prop.key.value === "env")) &&
                        isHermeticEnv(prop.value)));
                if (!scoped)
                    context.report({ node, messageId: "unscopedGitSpawn" });
            },
        };
    },
};
export const hermeticLintPlugin = {
    meta: { name: "eslint-plugin-fleet-hermetic", version: "1.0.0" },
    rules: { "no-unscoped-git-spawn": noUnscopedGitSpawnRule },
};
/** Test files that the hermetic-test rules apply to. */
export const HERMETIC_TEST_FILES = Object.freeze([
    "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
    "**/__tests__/**",
    "**/tests/**",
]);
/** Opt-in flat-config block enabling the hermetic-test lint for test files. */
export function hermeticTestRules() {
    return [
        {
            files: [...HERMETIC_TEST_FILES],
            plugins: { hermetic: hermeticLintPlugin },
            rules: { "hermetic/no-unscoped-git-spawn": "error" },
        },
    ];
}
