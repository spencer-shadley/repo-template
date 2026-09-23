// @generated from hermetic-git-spawn-rule.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
import fs from "node:fs";
import path from "node:path";
const TEST_FILE_PATTERN = /(?:\.test|\.spec)\.[cm]?[jt]sx?$|(?:^|[/\\])(?:test|tests|__tests__|e2e|fixtures)[/\\]/i;
const GIT_SPAWN_CALLEES = new Set([
    "spawn",
    "execFile",
    "spawnSync",
    "execFileSync",
    "exec",
    "execSync",
]);
const HERMETIC_HELPER_NAMES = new Set([
    "hermeticGitEnv",
    "sanitizedGitEnv",
    "cleanGitEnvironment",
]);
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isIdentifier(node) {
    return isRecord(node) && node["type"] === "Identifier" && typeof node["name"] === "string";
}
function isMemberExpression(node) {
    return isRecord(node) && node["type"] === "MemberExpression";
}
function isLiteralString(node) {
    return isRecord(node) && node["type"] === "Literal" && typeof node["value"] === "string";
}
function isTemplateLiteral(node) {
    return isRecord(node) && node["type"] === "TemplateLiteral" && Array.isArray(node["quasis"]);
}
function isCallExpression(node) {
    return isRecord(node) && node["type"] === "CallExpression";
}
function isObjectExpression(node) {
    return isRecord(node) && node["type"] === "ObjectExpression" && Array.isArray(node["properties"]);
}
function isProperty(node) {
    return isRecord(node) && node["type"] === "Property";
}
function isSpreadElement(node) {
    return isRecord(node) && node["type"] === "SpreadElement";
}
function isTestFilename(filename) {
    if (!filename || filename === "<input>" || filename === "<text>")
        return true;
    return TEST_FILE_PATTERN.test(filename.replaceAll("\\", "/"));
}
function hasPreloadDirective(comments) {
    return comments.some((comment) => {
        const text = comment.value.trim();
        return (/@hermetic(?:-git)?-preload\b/i.test(text) ||
            /\bhermetic:\s*preload\b/i.test(text));
    });
}
function scriptUsesPreload(script) {
    if (typeof script !== "string")
        return false;
    return script.includes("--import") && /repo-quality\/(?:hermetic-)?preload/.test(script);
}
function packageJsonHasPreload(pkgPath) {
    try {
        const raw = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (!isRecord(raw) || !isRecord(raw["scripts"]))
            return false;
        return Object.values(raw["scripts"]).some(scriptUsesPreload);
    }
    catch {
        return false;
    }
}
function hasPreloadInPackageScripts(filename) {
    if (!filename || filename === "<input>" || filename === "<text>")
        return false;
    let currentDir = path.dirname(path.resolve(filename));
    while (currentDir.length > 0 && currentDir !== path.dirname(currentDir)) {
        const pkgPath = path.join(currentDir, "package.json");
        if (fs.existsSync(pkgPath)) {
            return packageJsonHasPreload(pkgPath);
        }
        currentDir = path.dirname(currentDir);
    }
    return false;
}
function getCalleeName(callee) {
    if (isIdentifier(callee))
        return callee.name;
    if (isMemberExpression(callee) && isIdentifier(callee.property)) {
        return callee.property.name;
    }
    return null;
}
function isGitCommand(arg) {
    if (isLiteralString(arg)) {
        return arg.value === "git" || /(?:^|[/\\])git(?:$|\.exe$)/i.test(arg.value);
    }
    if (isTemplateLiteral(arg) && arg.quasis.length === 1) {
        const raw = arg.quasis[0]?.value?.raw;
        return raw === "git" || (typeof raw === "string" && /(?:^|[/\\])git(?:$|\.exe$)/i.test(raw));
    }
    return false;
}
function isHermeticEnvExpression(expr) {
    if (isCallExpression(expr)) {
        const name = getCalleeName(expr.callee);
        if (name && HERMETIC_HELPER_NAMES.has(name))
            return true;
    }
    if (isIdentifier(expr) && /(?:hermetic|sanitized)/i.test(expr.name)) {
        return true;
    }
    if (isObjectExpression(expr)) {
        return expr.properties.some((prop) => isSpreadElement(prop) && isHermeticEnvExpression(prop.argument));
    }
    return false;
}
function propertyIsHermeticEnv(prop) {
    if (!isProperty(prop))
        return false;
    const key = prop.key;
    const keyName = isIdentifier(key) ? key.name : isLiteralString(key) ? key.value : null;
    if (keyName !== "env")
        return false;
    return isHermeticEnvExpression(prop.value);
}
function hasHermeticEnvOption(args) {
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (isObjectExpression(arg) && arg.properties.some(propertyIsHermeticEnv)) {
            return true;
        }
    }
    return false;
}
export const hermeticGitSpawnRule = {
    meta: {
        type: "problem",
        docs: {
            description: "Flag spawn/execFile/spawnSync of git in test files that neither pass the helper's env nor run under the preload.",
            recommended: true,
            url: "https://github.com/spencer-shadley/code/issues/6081",
        },
        schema: [
            {
                type: "object",
                properties: {
                    underPreload: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            unscopedGitSpawn: "Spawning 'git' via {{callee}} in test file without hermetic environment. Run tests under '@spencer-shadley/repo-quality/preload' or pass 'env: hermeticGitEnv()' to explicit spawns.",
        },
    },
    create(context) {
        const filename = context.filename;
        if (!isTestFilename(filename)) {
            return {};
        }
        const options = isRecord(context.options[0]) ? context.options[0] : {};
        if (options["underPreload"] === true) {
            return {};
        }
        let hasPreloadImport = false;
        const isPreloadedViaDirective = hasPreloadDirective(context.sourceCode.getAllComments());
        const isPreloadedViaPkg = hasPreloadInPackageScripts(filename);
        return {
            ImportDeclaration(node) {
                if (typeof node.source.value === "string" &&
                    /repo-quality\/(?:hermetic-)?preload/.test(node.source.value)) {
                    hasPreloadImport = true;
                }
            },
            CallExpression(node) {
                if (hasPreloadImport || isPreloadedViaDirective || isPreloadedViaPkg) {
                    return;
                }
                const calleeName = getCalleeName(node.callee);
                if (!calleeName || !GIT_SPAWN_CALLEES.has(calleeName)) {
                    return;
                }
                const args = node.arguments;
                if (args.length === 0 || !isGitCommand(args[0])) {
                    return;
                }
                if (hasHermeticEnvOption(args)) {
                    return;
                }
                context.report({
                    node,
                    messageId: "unscopedGitSpawn",
                    data: {
                        callee: calleeName,
                    },
                });
            },
        };
    },
};
