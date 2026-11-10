// @generated from affected-tests/select.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
/**
 * Deterministic affected-test selection (SSOT: drive:code/docs/guides/affected-tests.md).
 *
 * Moved from Code `tools/affected-tests/select.ts` (repo-template#549, code#14238) so every managed repo's
 * `fleet-test-affected` and Code's `pnpm test:affected` share one selector. Pure: inputs are the changed
 * paths, the file list, a file reader and optional extras.
 *
 * A test file (`*.test.*`) or selfcheck (`*.selfcheck.*`) is affected when any of these edges
 * reaches it from a changed path:
 * - changed: the test or selfcheck itself changed;
 * - import: it imports the changed file, directly or through any chain of relative imports;
 * - reference: it names a changed or importing file in source text (spawned scripts, fixture or
 *   contract reads). A basename shared by more than one tracked file only matches with its
 *   parent directory (`skill-x/SKILL.md`), so `SKILL.md` alone selects nothing;
 * - fixture: the changed file sits under a `fixtures/` directory beside the test;
 * - script: a changed package.json script names the test or selfcheck (the only edge
 *   package.json has; tests name `package.json` as a generic fixture far too often to reference it);
 * - directory: its source names a tracked directory (two or more segments) that holds the changed file;
 * - literal: a code file names the changed code file as a quoted path (a dynamic `import(modulePath)` or a
 *   spawned-script constant); selects that file and its direct importers, not their whole closure;
 * - package: an upstream internal package changed (a `node_modules/<package>/...` path or `--package`),
 *   and the file imports a subpath whose entry reaches the changed file; changes flow through internal
 *   packages that import each other, and `import type` never counts;
 * - runner: the changed file is loaded by the test runner preload, so every test and selfcheck is affected;
 * - trace: a traced run saw it load, read or spawn the changed path, or list the directory an added or removed path
 *   sits in (trace-map.ts). Scanners, computed loaders and computed data paths are visible only at runtime; this edge
 *   is counted only where no static edge fired.
 */
import path from "node:path";
import { parseImportSpecifiers, resolveImportCandidates } from "./imports.mjs";
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SELFCHECK_FILE = /\.selfcheck\.[cm]?[jt]sx?$/;
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
/** Path-like tokens in source text: a file name with an extension, optionally with directories. */
const PATH_TOKEN = /[\w@.\-/]*[\w-]\.(?:[cm]?[jt]sx?|jsonc?|md|ps1|psm1|sh|ya?ml|toml|txt|cjs)\b/g;
/** A quoted path to a code file, in code (comments stripped first). */
const CODE_PATH_LITERAL = /["']((?:\.{1,2}\/)?[\w@.\-]+(?:\/[\w@.\-]+)*\.[cm]?[jt]sx?)["']/g;
/** A quoted directory path with at least two segments. */
const DIRECTORY_LITERAL = /["']((?:\.{1,2}\/)*[\w@-]+(?:\/[\w@.-]+)+)\/?["']/g;
/** `path.join("a", "b")` / `resolve(...)` argument lists, whose quoted segments may spell a directory. */
const JOIN_CALL = /(?:join|resolve)\(([^()]*)\)/g;
/** Bare value imports: `import`/`export ... from`, side-effect imports, `require()` and `import()`; never `import type`. */
const VALUE_IMPORT = /(?:\b(?:import|export)\s+(?!type\s)(?:[^;'"]*?\bfrom\s+)?|\brequire\(\s*|\bimport\(\s*)["']([^"'.][^"']*)["']/g;
const compareStrings = (left, right) => left.localeCompare(right);
export function normalizeRepoPath(file) {
    return file.replaceAll("\\", "/").replace(/^\.\//, "");
}
export function isTestFile(file) {
    return TEST_FILE.test(file);
}
export function isSelfcheckFile(file) {
    return SELFCHECK_FILE.test(file);
}
function isRunnable(file) {
    return isTestFile(file) || isSelfcheckFile(file);
}
function addTo(map, key, value) {
    const set = map.get(key) ?? new Set();
    set.add(value);
    map.set(key, set);
}
/** `a/b/c.ts` → `b/c.ts`; a top-level file keys on its basename. */
function parentKey(file) {
    const parts = file.split("/");
    return parts.slice(-2).join("/");
}
/** Source without comments or import specifiers, so only runtime path values remain. */
function pathValueText(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")
        .replace(/\b(?:from|import|require\()\s*\(?\s*["'][^"']*["']/g, "");
}
/** Candidate repo paths for a quoted literal: relative to the file, or repo-root-relative. */
function literalCandidates(file, literal) {
    const local = path.posix.normalize(path.posix.join(path.posix.dirname(file), literal));
    return literal.startsWith(".") ? [local] : [literal, local];
}
function directoryLiterals(code) {
    const found = new Set();
    for (const match of code.matchAll(DIRECTORY_LITERAL))
        found.add(match[1]);
    for (const match of code.matchAll(JOIN_CALL)) {
        const segments = [...match[1].matchAll(/["']([\w@.\-/]+)["']/g)].map((part) => part[1]);
        for (let start = 0; start < segments.length; start += 1) {
            for (let end = start + 2; end <= segments.length; end += 1)
                found.add(segments.slice(start, end).join("/"));
        }
    }
    return found;
}
function buildGraph(files, readFile) {
    const importers = new Map();
    const literalNamers = new Map();
    const directoryNamers = new Map();
    const bareImporters = new Map();
    const tracked = new Set(files);
    const directories = new Set();
    for (const file of files) {
        const parts = file.split("/");
        for (let end = 2; end < parts.length; end += 1)
            directories.add(parts.slice(0, end).join("/"));
    }
    const references = new Map();
    const bareReferences = new Map();
    const basenameCounts = new Map();
    for (const file of files) {
        const base = path.posix.basename(file);
        basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1);
    }
    for (const file of files) {
        if (!CODE_FILE.test(file) || DECLARATION_FILE.test(file))
            continue;
        let source;
        try {
            source = readFile(file);
        }
        catch {
            continue;
        }
        for (const specifier of parseImportSpecifiers(source)) {
            for (const candidate of resolveImportCandidates(file, specifier))
                addTo(importers, candidate, file);
        }
        for (const match of source.matchAll(VALUE_IMPORT))
            addTo(bareImporters, match[1], file);
        const code = pathValueText(source);
        for (const match of code.matchAll(CODE_PATH_LITERAL)) {
            for (const candidate of literalCandidates(file, match[1])) {
                if (candidate !== file && tracked.has(candidate))
                    addTo(literalNamers, candidate, file);
            }
        }
        if (!isRunnable(file))
            continue;
        for (const literal of directoryLiterals(code)) {
            for (const candidate of literalCandidates(file, literal.replace(/\/+$/, ""))) {
                if (directories.has(candidate))
                    addTo(directoryNamers, candidate, file);
            }
        }
        for (const match of source.matchAll(PATH_TOKEN)) {
            // `../lib/x.ts` names `lib/x.ts`; `../x.ts` is as bare as `x.ts`.
            const token = normalizeRepoPath(match[0]).replace(/^(?:\.\.\/)+/, "");
            addTo(references, path.posix.basename(token), file);
            if (token.includes("/"))
                addTo(references, parentKey(token), file);
            else
                addTo(bareReferences, token, file);
        }
    }
    return { importers, literalNamers, directoryNamers, bareImporters, references, bareReferences, basenameCounts };
}
/** Runnable files whose text names `file`; a shared basename needs its parent directory too. */
function referencesTo(graph, file) {
    const base = path.posix.basename(file);
    if ((graph.basenameCounts.get(base) ?? 0) <= 1)
        return graph.references.get(base) ?? new Set();
    if (!file.includes("/"))
        return graph.bareReferences.get(base) ?? new Set();
    return graph.references.get(parentKey(file)) ?? new Set();
}
/** Runnable files directly beside the `fixtures/` directory that holds `file`. */
function fixtureOwners(file, runnable) {
    const parts = file.split("/");
    const index = parts.lastIndexOf("fixtures");
    if (index < 0)
        return [];
    const owner = parts.slice(0, index).join("/");
    return runnable.filter((candidate) => path.posix.dirname(candidate) === (owner || "."));
}
/** Test and selfcheck paths named in changed package.json script text. */
function scriptTargets(changedScripts, runnable) {
    const found = new Set();
    for (const text of changedScripts) {
        for (const match of text.matchAll(PATH_TOKEN)) {
            const token = normalizeRepoPath(match[0]);
            if (runnable.has(token))
                found.add(token);
        }
    }
    return [...found];
}
const isPackageSpecifier = (specifier, name) => specifier === name || specifier.startsWith(`${name}/`);
/** The file a package `exports` entry names for `import`, else `default`. */
function exportTarget(entry) {
    if (typeof entry === "string")
        return entry;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
        return undefined;
    const record = entry;
    for (const condition of ["import", "node", "default"]) {
        const target = exportTarget(record[condition]);
        if (target !== undefined)
            return target;
    }
    return undefined;
}
/** `node_modules/<name>/...` file a bare specifier loads, from the package's `exports` (or `main`), or undefined. */
function resolvePackageSpecifier(specifier, name, readFile) {
    let manifest;
    try {
        manifest = JSON.parse(readFile(`node_modules/${name}/package.json`));
    }
    catch {
        return undefined;
    }
    const subpath = `.${specifier.slice(name.length)}`;
    const exportsField = manifest["exports"];
    let target;
    if (exportsField !== undefined && exportsField !== null && typeof exportsField === "object" && !Array.isArray(exportsField)
        && Object.keys(exportsField).some((key) => key.startsWith("."))) {
        const map = exportsField;
        target = exportTarget(map[subpath]);
        for (const [key, value] of Object.entries(map)) {
            if (target !== undefined)
                break;
            const star = key.indexOf("*");
            if (star < 0 || !subpath.startsWith(key.slice(0, star)) || !subpath.endsWith(key.slice(star + 1)))
                continue;
            target = exportTarget(value)?.replace("*", subpath.slice(star, subpath.length - (key.length - star - 1)));
        }
    }
    else if (subpath === ".") {
        target = exportTarget(exportsField) ?? (typeof manifest["main"] === "string" ? manifest["main"] : "index.js");
    }
    else {
        target = subpath;
    }
    return target === undefined ? undefined : path.posix.normalize(`node_modules/${name}/${target}`);
}
/** Changed package files reach only importers whose subpath entry loads them (static relative closure). */
class UpstreamGraph {
    closures = new Map();
    internalImports = new Map();
    upstream;
    readFile;
    constructor(upstream, readFile) {
        this.upstream = upstream;
        this.readFile = readFile;
    }
    ownerOf(file) {
        return this.upstream.packages.find((name) => file.startsWith(`node_modules/${name}/`));
    }
    /** Files a specifier's entry loads through relative imports; null when it cannot be resolved (treat as reached). */
    closure(specifier, name) {
        const cached = this.closures.get(specifier);
        if (cached !== undefined)
            return cached;
        const entry = resolvePackageSpecifier(specifier, name, this.readFile);
        const result = entry === undefined ? null : this.closureFrom(entry, name);
        this.closures.set(specifier, result);
        return result;
    }
    /** Package files `entry` loads through relative imports, itself included; null when it is not a package file. */
    closureFrom(entry, name) {
        const files = new Set(this.upstream.listFiles(name));
        if (!files.has(entry))
            return null;
        const reached = new Set();
        const pending = [entry];
        while (pending.length > 0) {
            const file = pending.pop();
            if (reached.has(file))
                continue;
            reached.add(file);
            if (!CODE_FILE.test(file))
                continue;
            let source;
            try {
                source = this.readFile(file);
            }
            catch {
                continue;
            }
            for (const specifier of parseImportSpecifiers(source)) {
                for (const candidate of resolveImportCandidates(file, specifier))
                    if (files.has(candidate))
                        pending.push(candidate);
            }
        }
        return reached;
    }
    /** True when importing `specifier` loads any changed file of `name` (`all` = the whole package changed). */
    reaches(specifier, name, changed) {
        if (changed === "all" || changed.has(`node_modules/${name}/package.json`))
            return true;
        const closure = this.closure(specifier, name);
        return closure === null || [...changed].some((file) => closure.has(file));
    }
    /** Bare value imports of other internal packages, per package. */
    importsOf(name) {
        let found = this.internalImports.get(name);
        if (found)
            return found;
        found = new Map();
        for (const file of this.upstream.listFiles(name)) {
            if (!CODE_FILE.test(file) || DECLARATION_FILE.test(file))
                continue;
            let source;
            try {
                source = this.readFile(file);
            }
            catch {
                continue;
            }
            for (const match of source.matchAll(VALUE_IMPORT)) {
                const specifier = match[1];
                if (this.upstream.packages.some((other) => other !== name && isPackageSpecifier(specifier, other)))
                    addTo(found, specifier, file);
            }
        }
        this.internalImports.set(name, found);
        return found;
    }
    /** Changed packages, widened through internal packages that import a changed subpath. */
    expand(changed) {
        const result = new Map(changed);
        const pending = [...changed.keys()];
        while (pending.length > 0) {
            const name = pending.pop();
            const files = result.get(name);
            for (const other of this.upstream.packages) {
                if (other === name || result.get(other) === "all")
                    continue;
                const into = (result.get(other) ?? new Set());
                const before = into.size;
                for (const [specifier, importers] of this.importsOf(other)) {
                    if (!isPackageSpecifier(specifier, name) || !this.reaches(specifier, name, files))
                        continue;
                    for (const importer of importers)
                        into.add(importer);
                }
                if (into.size > before) {
                    result.set(other, into);
                    pending.push(other);
                }
            }
        }
        return result;
    }
}
export function selectAffectedTests(input) {
    const files = [...new Set(input.files.map(normalizeRepoPath))];
    const changedPaths = [...new Set(input.changedPaths.map(normalizeRepoPath))].toSorted(compareStrings);
    const runnable = files.filter(isRunnable);
    const runnableSet = new Set(runnable);
    const graph = buildGraph(files, input.readFile);
    const reasons = new Map();
    const select = (file, edge, from) => {
        if (runnableSet.has(file) && !reasons.has(file))
            reasons.set(file, { edge, from });
    };
    // Every changed file and its transitive importers: each one is a source the tests may exercise.
    const reached = new Map();
    const pending = [];
    for (const file of changedPaths) {
        reached.set(file, file);
        pending.push(file);
        select(file, "changed", file);
        for (const owner of fixtureOwners(file, runnable))
            select(owner, "fixture", file);
    }
    const reach = (file, edge, origin) => {
        if (reached.has(file))
            return;
        reached.set(file, origin);
        pending.push(file);
        select(file, edge, origin);
    };
    if (input.upstream)
        selectUpstream(input.upstream, input.readFile, graph, changedPaths, runnable, reach, select);
    while (pending.length > 0) {
        const file = pending.pop();
        const origin = reached.get(file);
        for (const importer of graph.importers.get(file) ?? [])
            reach(importer, "import", origin);
    }
    for (const file of changedPaths) {
        const parts = file.split("/");
        for (let end = 2; end < parts.length; end += 1) {
            for (const namer of graph.directoryNamers.get(parts.slice(0, end).join("/")) ?? [])
                select(namer, "directory", file);
        }
    }
    for (const [file, origin] of [...reached].toSorted(([left], [right]) => compareStrings(left, right))) {
        // package.json is read by many tests as a generic fixture name; its changes select by script edge.
        if (file === "package.json")
            continue;
        for (const referrer of referencesTo(graph, file)) {
            if (referrer === file)
                continue;
            select(referrer, "reference", origin === file ? file : `${file} (via ${origin})`);
        }
    }
    // A file that names a reached code file as a path runs it; select it and its direct importers only.
    for (const [file, origin] of [...reached].toSorted(([left], [right]) => compareStrings(left, right))) {
        for (const namer of graph.literalNamers.get(file) ?? []) {
            select(namer, "literal", origin);
            for (const importer of graph.importers.get(namer) ?? [])
                select(importer, "literal", `${namer} (via ${origin})`);
        }
    }
    for (const target of scriptTargets(input.changedScripts ?? [], runnableSet))
        select(target, "script", "package.json");
    if (input.traceMap) {
        for (const file of changedPaths)
            for (const runnable of input.traceMap.get(file) ?? [])
                select(runnable, "trace", file);
        // A listing changes only when an entry is added or removed; a new or removed directory changes its parent's too.
        const present = new Set(files);
        const presentDirs = new Set(files.flatMap((file) => file.split("/").slice(0, -1).map((_, end, parts) => parts.slice(0, end + 1).join("/"))));
        for (const file of changedPaths) {
            if (present.has(file) && input.inBase?.(file) === true)
                continue;
            for (let entry = file, dir = path.posix.dirname(file); dir !== "."; entry = dir, dir = path.posix.dirname(dir)) {
                if (entry !== file && (!input.inBase || input.inBase(entry) === presentDirs.has(entry)))
                    break;
                for (const runnable of input.traceMap.get(`${dir}/`) ?? [])
                    select(runnable, "trace", `${file} (listed in ${dir}/)`);
            }
            for (let dir = path.posix.dirname(file); dir !== "."; dir = path.posix.dirname(dir)) {
                for (const runnable of input.traceMap.get(`${dir}/**`) ?? [])
                    select(runnable, "trace", `${file} (listed recursively in ${dir}/)`);
            }
        }
        const wholePackages = (input.upstream?.changedPackages ?? []).map((name) => `node_modules/${name}/`);
        if (wholePackages.length > 0) {
            for (const [file, runnables] of input.traceMap) {
                if (!wholePackages.some((prefix) => file.startsWith(prefix)))
                    continue;
                for (const runnable of runnables)
                    select(runnable, "trace", file);
            }
        }
    }
    const selected = [...reasons.keys()].toSorted(compareStrings);
    return {
        tests: selected.filter(isTestFile),
        selfchecks: selected.filter((file) => !isTestFile(file)),
        reasons: Object.fromEntries([...reasons].toSorted(([left], [right]) => compareStrings(left, right))),
        changedPaths,
    };
}
function selectUpstream(upstream, readFile, graph, changedPaths, runnable, reach, select) {
    const upstreamGraph = new UpstreamGraph(upstream, readFile);
    const changed = new Map();
    for (const name of upstream.changedPackages ?? [])
        changed.set(name, "all");
    for (const file of changedPaths) {
        const owner = upstreamGraph.ownerOf(file);
        if (owner === undefined || changed.get(owner) === "all")
            continue;
        const files = (changed.get(owner) ?? new Set());
        files.add(file);
        changed.set(owner, files);
    }
    if (changed.size === 0)
        return;
    const expanded = upstreamGraph.expand(changed);
    for (const preload of upstream.runnerPreloads ?? []) {
        const owner = upstreamGraph.ownerOf(preload);
        const files = owner === undefined ? undefined : expanded.get(owner);
        if (owner === undefined || files === undefined)
            continue;
        const loaded = upstreamGraph.closureFrom(preload, owner);
        const loads = files === "all" || loaded === null || [...files].some((file) => loaded.has(file));
        if (loads)
            for (const test of runnable)
                select(test, "runner", preload);
    }
    for (const [specifier, importers] of graph.bareImporters) {
        for (const [name, files] of expanded) {
            if (!isPackageSpecifier(specifier, name) || !upstreamGraph.reaches(specifier, name, files))
                continue;
            for (const importer of importers)
                reach(importer, "package", specifier);
        }
    }
}
/** Script command text that is new or different in `current` relative to `base`. */
export function changedScriptText(base, current) {
    const scripts = (value) => {
        if (value === null || typeof value !== "object")
            return {};
        const field = value["scripts"];
        return field !== null && typeof field === "object" ? field : {};
    };
    const before = scripts(base);
    return Object.entries(scripts(current))
        .filter(([name, text]) => typeof text === "string" && before[name] !== text)
        .map(([, text]) => text);
}
