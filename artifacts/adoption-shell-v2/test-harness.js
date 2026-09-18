import { ENVELOPE_DIGEST_ALGORITHM, } from "./contract.js";
import { sha256Bytes, sha256CanonicalJson } from "./digest.js";
import { Diagnostics, compareStrings, isRecord, } from "./validation-helpers.js";
export const TEST_HARNESS_CONTRACT_ID = "repo-template/test-harness/v1";
export const TEST_HARNESS_SCHEMA_VERSION = "1.0.0";
export const TEST_HARNESS_SCHEMA_ID = "https://schemas.repo-template.dev/test-harness/v1/test-harness.schema.json";
export const TEST_HARNESS_BUNDLE_ID = "repo-template/test-harness";
export const TEST_HARNESS_BUNDLE_VERSION = "1.0.0";
export const VITEST_HARNESS_BUNDLE_ID = TEST_HARNESS_BUNDLE_ID;
export const DEFAULT_VITEST_VERSION = "3.0.7";
export const DEFAULT_VITEST_CONFIG_PATH = "vitest.config.ts";
export const DEFAULT_SMOKE_TEST_PATH = "test/smoke.test.ts";
const JS_TS_LANGUAGES = new Set(["typescript", "javascript"]);
function pickSetting(opt, prof, fallback) {
    return opt ?? prof ?? fallback;
}
export function resolveEffectiveTestHarnessSettings(profile, options) {
    const p = profile;
    return {
        configPath: pickSetting(options?.configPath, p?.configPath, DEFAULT_VITEST_CONFIG_PATH),
        smokeTestPath: pickSetting(options?.smokeTestPath, p?.smokeTestPath, DEFAULT_SMOKE_TEST_PATH),
        vitestVersion: pickSetting(options?.vitestVersion, p?.vitestVersion, DEFAULT_VITEST_VERSION),
        language: options?.language ?? p?.language,
        testRunner: options?.testRunner ?? p?.testRunner,
        passWithNoTests: options?.passWithNoTests ?? true,
    };
}
export function isTestHarnessApplicable(profile, options) {
    const lang = (options?.language ?? profile.language)?.toLowerCase();
    if (lang !== undefined && !JS_TS_LANGUAGES.has(lang)) {
        return false;
    }
    const runner = options?.testRunner ?? profile.testRunner;
    if (runner === "none") {
        return false;
    }
    const scripts = profile.declaredScripts;
    const scriptList = Array.isArray(scripts)
        ? scripts
        : isRecord(scripts)
            ? Object.keys(scripts)
            : [];
    const hasTestScript = scriptList.includes("test");
    if (profile.profileId === "standalone" && !hasTestScript && runner !== "vitest") {
        return false;
    }
    if (runner === "vitest") {
        return true;
    }
    return hasTestScript;
}
function importFrom(clause, specifier) {
    return ["import", clause, "from", `${JSON.stringify(specifier)};`].join(" ");
}
export function createVitestConfigContent(options) {
    const passWithNoTests = options?.passWithNoTests ?? true;
    return [
        importFrom("{ defineConfig }", "vitest/config"),
        "",
        "export default defineConfig({",
        "  test: {",
        '    environment: "node",',
        '    include: ["**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],',
        `    passWithNoTests: ${passWithNoTests ? "true" : "false"},`,
        "  },",
        "});",
        "",
    ].join("\n");
}
export function createSmokeTestContent(_options) {
    return [
        importFrom("{ describe, expect, it }", "vitest"),
        "",
        'describe("smoke test", () => {',
        '  it("verifies basic assertions work deterministically", () => {',
        "    expect(1 + 1).toBe(2);",
        "  });",
        "});",
        "",
    ].join("\n");
}
export function mergePackageJsonWithTestHarness(packageJson, options, profile) {
    const parsed = typeof packageJson === "string" ? JSON.parse(packageJson) : packageJson;
    if (!isRecord(parsed)) {
        throw new TypeError("package.json content must be an object");
    }
    const result = { ...parsed };
    const currentScripts = isRecord(result["scripts"])
        ? { ...result["scripts"] }
        : {};
    if (currentScripts["test"] === undefined) {
        currentScripts["test"] = "vitest run";
    }
    const sortedScripts = {};
    for (const key of Object.keys(currentScripts).sort(compareStrings)) {
        sortedScripts[key] = currentScripts[key];
    }
    result["scripts"] = sortedScripts;
    const currentDevDeps = isRecord(result["devDependencies"])
        ? { ...result["devDependencies"] }
        : {};
    const vitestVer = resolveEffectiveTestHarnessSettings(profile, options).vitestVersion;
    if (currentDevDeps["vitest"] === undefined) {
        currentDevDeps["vitest"] = vitestVer;
    }
    const sortedDevDeps = {};
    for (const key of Object.keys(currentDevDeps).sort(compareStrings)) {
        sortedDevDeps[key] = currentDevDeps[key];
    }
    result["devDependencies"] = sortedDevDeps;
    return `${JSON.stringify(result, null, 2)}\n`;
}
export function createVitestConfigPayloadEntry(bundleId = null, options, profile) {
    const configPath = resolveEffectiveTestHarnessSettings(profile, options).configPath;
    const content = createVitestConfigContent(options);
    const bytes = Buffer.from(content, "utf8");
    return Object.freeze({
        path: configPath,
        kind: "file",
        mode: "100644",
        contentSha256: sha256Bytes(bytes),
        role: "capability-config",
        encoding: "utf-8",
        bundleId,
        contentBase64: Buffer.from(bytes).toString("base64"),
    });
}
export function createSmokeTestPayloadEntry(bundleId = null, options, profile) {
    const testPath = resolveEffectiveTestHarnessSettings(profile, options).smokeTestPath;
    const content = createSmokeTestContent(options);
    const bytes = Buffer.from(content, "utf8");
    return Object.freeze({
        path: testPath,
        kind: "file",
        mode: "100644",
        contentSha256: sha256Bytes(bytes),
        role: "capability-executable",
        encoding: "utf-8",
        bundleId,
        contentBase64: Buffer.from(bytes).toString("base64"),
    });
}
export function materializeTestHarnessEntries(profile, options, bundleId = null) {
    if (!isTestHarnessApplicable(profile, options)) {
        return Object.freeze([]);
    }
    const entries = [
        createSmokeTestPayloadEntry(bundleId, options, profile),
        createVitestConfigPayloadEntry(bundleId, options, profile),
    ];
    return Object.freeze(entries.toSorted((left, right) => compareStrings(left.path, right.path)));
}
export function createTestHarnessBundle(profile, options) {
    const bundleId = options?.id ?? TEST_HARNESS_BUNDLE_ID;
    const version = options?.version ?? TEST_HARNESS_BUNDLE_VERSION;
    const isApplicable = isTestHarnessApplicable(profile, options);
    const settings = resolveEffectiveTestHarnessSettings(profile, options);
    const artifacts = isApplicable
        ? [
            "package.json",
            settings.smokeTestPath,
            settings.configPath,
        ].sort(compareStrings)
        : [];
    const modes = isApplicable
        ? [
            {
                id: "test",
                entrypoint: settings.configPath,
                requiredPaths: artifacts,
            },
        ]
        : [];
    const bundleBody = {
        id: bundleId,
        version,
        digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
        dependencies: [],
        artifacts,
        fixtures: [],
        goldens: [],
        modes,
    };
    return Object.freeze({
        ...bundleBody,
        digest: sha256CanonicalJson(bundleBody),
    });
}
export function composeTestHarnessReleaseEntries(profile, baseEntries, options, bundleId = TEST_HARNESS_BUNDLE_ID) {
    if (!isTestHarnessApplicable(profile, options)) {
        return baseEntries;
    }
    const harnessEntries = materializeTestHarnessEntries(profile, options, bundleId);
    const existingPaths = new Set(baseEntries.map((e) => e.path));
    const updatedEntries = [];
    let foundPackageJson = false;
    for (const entry of baseEntries) {
        if (entry.path === "package.json") {
            foundPackageJson = true;
            const rawContent = Buffer.from(entry.contentBase64, "base64").toString("utf8");
            const merged = mergePackageJsonWithTestHarness(rawContent, options, profile);
            const mergedBytes = Buffer.from(merged, "utf8");
            updatedEntries.push(Object.freeze({
                ...entry,
                bundleId: entry.bundleId ?? bundleId,
                contentSha256: sha256Bytes(mergedBytes),
                contentBase64: Buffer.from(mergedBytes).toString("base64"),
            }));
        }
        else {
            updatedEntries.push(entry);
        }
    }
    if (!foundPackageJson) {
        const minimalPackageJson = {
            name: profile.profileId,
            version: "0.0.0",
            private: true,
            type: "module",
        };
        const merged = mergePackageJsonWithTestHarness(minimalPackageJson, options, profile);
        const mergedBytes = Buffer.from(merged, "utf8");
        updatedEntries.push(Object.freeze({
            path: "package.json",
            kind: "file",
            mode: "100644",
            contentSha256: sha256Bytes(mergedBytes),
            role: "capability-config",
            encoding: "utf-8",
            bundleId,
            contentBase64: Buffer.from(mergedBytes).toString("base64"),
        }));
    }
    for (const harnessEntry of harnessEntries) {
        if (!existingPaths.has(harnessEntry.path)) {
            updatedEntries.push(harnessEntry);
        }
    }
    return Object.freeze(updatedEntries.toSorted((left, right) => compareStrings(left.path, right.path)));
}
function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 && value !== undefined
        ? { ok: true, value }
        : { ok: false, diagnostics: rows };
}
function hasValidatedHarness(_value, diagnostics) {
    return diagnostics.rows.length === 0;
}
const SCRIPT_PATTERN = /^[a-zA-Z0-9_:-]+$/;
function validateDeclaredScripts(scripts, diagnostics) {
    const seen = new Set();
    for (let i = 0; i < scripts.length; i++) {
        const item = scripts[i];
        const pointer = `/declaredScripts/${String(i)}`;
        if (typeof item !== "string") {
            diagnostics.add("E_TYPE", pointer, "script item must be a string");
        }
        else if (!SCRIPT_PATTERN.test(item)) {
            diagnostics.add("E_PATTERN", pointer, "script item does not match pattern");
        }
        else if (seen.has(item)) {
            diagnostics.add("E_UNIQUE", pointer, `duplicate script item "${item}"`);
        }
        else {
            seen.add(item);
        }
    }
}
export function validateTestHarnessConfig(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "$schema",
        "schemaId",
        "schemaVersion",
        "contractId",
        "profileId",
        "framework",
        "configPath",
        "smokeTestPath",
        "language",
        "vitestVersion",
        "declaredScripts",
    ];
    const required = [
        "schemaId",
        "schemaVersion",
        "contractId",
        "profileId",
        "framework",
        "configPath",
        "smokeTestPath",
    ];
    if (!diagnostics.object(value, "", fields, required) || !isRecord(value)) {
        return finish(undefined, diagnostics);
    }
    if (value["$schema"] !== undefined) {
        diagnostics.string(value["$schema"], "/$schema", { min: 1 });
    }
    diagnostics.string(value["schemaId"], "/schemaId", { constant: TEST_HARNESS_SCHEMA_ID });
    diagnostics.string(value["schemaVersion"], "/schemaVersion", { constant: TEST_HARNESS_SCHEMA_VERSION });
    diagnostics.string(value["contractId"], "/contractId", { constant: TEST_HARNESS_CONTRACT_ID });
    diagnostics.string(value["profileId"], "/profileId", { min: 1, max: 80, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ });
    diagnostics.string(value["framework"], "/framework", { constant: "vitest" });
    diagnostics.string(value["configPath"], "/configPath", { min: 1, max: 240 });
    diagnostics.string(value["smokeTestPath"], "/smokeTestPath", { min: 1, max: 240 });
    if (value["language"] !== undefined &&
        value["language"] !== "typescript" &&
        value["language"] !== "javascript") {
        diagnostics.add("E_ENUM", "/language", "language must be typescript or javascript");
    }
    if (value["vitestVersion"] !== undefined) {
        diagnostics.string(value["vitestVersion"], "/vitestVersion", {
            pattern: /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
        });
    }
    if (value["declaredScripts"] !== undefined && diagnostics.array(value["declaredScripts"], "/declaredScripts", 0, 64)) {
        validateDeclaredScripts(value["declaredScripts"], diagnostics);
    }
    return finish(hasValidatedHarness(value, diagnostics) ? value : undefined, diagnostics);
}
