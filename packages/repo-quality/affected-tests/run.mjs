// @generated from affected-tests/run.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
/**
 * `fleet-test-affected`: run only the test files a change affects (repo-template#549, code#14238).
 *
 * Spencer, 6:38:34 PM PT, Nov 9 2026: "seems like wrong fix. fix is that the wrong test invocation was used. blank
 * node test is so super ultra insanely bad". A repository points `scripts.test` here with its full-suite globs as the
 * universe and keeps the whole suite one flag away (`--all`, or its own `test:all`). Selection is the shared pure
 * selector (select.ts); each selected file runs as its own `node --test <file>` child.
 */
import { spawn } from "node:child_process";
import { existsSync, globSync, readFileSync, realpathSync, statSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { FLEET_TEST_AFFECTED_USAGE, parseAffectedArgs, toRunPath, UsageError } from "./args.mjs";
import { collectChangedPaths, collectChangedScripts, defaultBaseRef, repoRootOf, workingTreeFiles } from "./git.mjs";
import { normalizeRepoPath, selectAffectedTests } from "./select.mjs";
const PREFIX = "fleet-test-affected:";
const compareStrings = (left, right) => left.localeCompare(right);
/** Files the full-suite globs match, relative to `cwd`; `node_modules` is never searched. */
export function expandUniverse(patterns, cwd) {
    const files = new Set();
    const unmatched = [];
    for (const pattern of patterns) {
        let matched = 0;
        for (const match of globSync(pattern, { cwd, exclude: (name) => path.basename(name) === "node_modules" })) {
            const relative = normalizeRepoPath(path.isAbsolute(match) ? path.relative(cwd, match) : match);
            if (statSync(path.join(cwd, relative), { throwIfNoEntry: false })?.isFile() !== true)
                continue;
            files.add(relative);
            matched += 1;
        }
        if (matched === 0)
            unmatched.push(pattern);
    }
    return { files: [...files].toSorted(compareStrings), unmatched };
}
/**
 * Selected tests and selfchecks that sit in the universe, as cwd-relative run paths. Selection paths are
 * repo-relative; `prefix` is the working directory relative to the repository root ("" at the root).
 */
export function planAffectedRun(selection, universe, prefix, runMap) {
    const inUniverse = new Set(universe);
    const planned = new Map();
    for (const selected of [...selection.tests, ...selection.selfchecks]) {
        if (prefix !== "" && !selected.startsWith(`${prefix}/`))
            continue;
        const file = toRunPath(prefix === "" ? selected : selected.slice(prefix.length + 1), runMap);
        const reason = selection.reasons[selected];
        if (inUniverse.has(file) && !planned.has(file))
            planned.set(file, reason ? `${reason.edge} from ${reason.from}` : "selected");
    }
    return [...planned].map(([file, reason]) => ({ file, reason })).toSorted((left, right) => compareStrings(left.file, right.file));
}
/**
 * The environment each child runs in. NODE_TEST_CONTEXT marks a process as a child of a running `node --test`; a
 * child that inherits it skips its files and exits 0, so a run started from inside a test would pass vacuously.
 */
function childEnv() {
    const env = { ...process.env };
    delete env["NODE_TEST_CONTEXT"];
    return env;
}
function runOne(file, options, cwd) {
    return new Promise((resolve) => {
        const started = Date.now();
        const child = spawn(process.execPath, [...options.nodeArgs, "--test", file], { cwd, env: childEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        const output = [];
        child.stdout.on("data", (chunk) => output.push(chunk));
        child.stderr.on("data", (chunk) => output.push(chunk));
        let note = "";
        const timer = setTimeout(() => {
            note = ` timed out after ${String(options.timeoutSeconds)}s`;
            child.kill("SIGKILL");
        }, options.timeoutSeconds * 1000);
        const finish = (code, error) => {
            clearTimeout(timer);
            const passed = code === 0 && note === "" && error === undefined;
            const seconds = ((Date.now() - started) / 1000).toFixed(1);
            process.stdout.write(`\n${PREFIX} ${passed ? "PASS" : "FAIL"} ${file} (${seconds}s)${note}${error ? ` ${error.message}` : ""}\n`);
            process.stdout.write(Buffer.concat(output));
            resolve({ file, passed });
        };
        child.once("error", (error) => {
            finish(null, error);
        });
        child.once("close", (code) => {
            finish(code);
        });
    });
}
/** Runs each file as its own `node --test` child, at most min(4, availableParallelism) at once. */
export async function runTestFiles(files, options, cwd) {
    const results = [];
    let next = 0;
    const worker = async () => {
        const file = files[next];
        next += 1;
        if (file === undefined)
            return;
        results.push(await runOne(file, options, cwd));
        await worker();
    };
    const width = Math.max(1, Math.min(4, availableParallelism(), files.length));
    await Promise.all(Array.from({ length: width }, worker));
    return results.toSorted((left, right) => compareStrings(left.file, right.file));
}
function summarize(results) {
    const failed = results.filter((result) => !result.passed).map((result) => result.file);
    process.stdout.write(`\n${PREFIX} ${String(results.length - failed.length)} passed, ${String(failed.length)} failed (${String(results.length)} file(s))\n`);
    for (const file of failed)
        process.stdout.write(`${PREFIX} failed: ${file}\n`);
    return failed.length === 0 ? 0 : 1;
}
function relativeTo(root, cwd) {
    const relative = normalizeRepoPath(path.relative(realpathSync(root), realpathSync(cwd)));
    return relative === "" || relative === "." ? "" : relative;
}
function affectedPlan(options, universe, cwd) {
    const root = repoRootOf(cwd);
    const base = options.baseRef ?? defaultBaseRef(root);
    if (base === null)
        throw new UsageError("no origin/HEAD, origin/master, origin/main, master or main to diff against; pass --base <ref> or --all");
    const changedPaths = collectChangedPaths(root, base);
    const selection = selectAffectedTests({
        changedPaths,
        files: workingTreeFiles(root),
        readFile: (file) => readFileSync(path.join(root, file), "utf8"),
        changedScripts: collectChangedScripts(root, base, changedPaths),
    });
    return { plan: planAffectedRun(selection, universe, relativeTo(root, cwd), options.runMap), changed: changedPaths.length, base };
}
function filesPlan(files, cwd) {
    const missing = files.filter((file) => !existsSync(path.resolve(cwd, file)));
    if (missing.length > 0)
        throw new UsageError(`--files names missing file(s): ${missing.join(", ")}`);
    if (files.length === 0)
        throw new UsageError("--files needs at least one test file");
    return files.map((file) => ({ file, reason: "--files" }));
}
function universeOf(options, cwd) {
    if (options.patterns.length === 0)
        throw new UsageError("pass the full-suite test globs (the universe), or --files <file>...");
    const universe = expandUniverse(options.patterns, cwd);
    for (const pattern of universe.unmatched)
        process.stderr.write(`${PREFIX} WARNING: pattern matched no files: ${pattern}\n`);
    return universe.files;
}
async function execute(options, cwd) {
    let plan;
    if (options.files === null) {
        const universe = universeOf(options, cwd);
        if (options.all) {
            plan = universe.map((file) => ({ file, reason: "--all" }));
            process.stdout.write(`${PREFIX} --all: running all ${String(plan.length)} file(s) the globs match\n`);
        }
        else {
            const affected = affectedPlan(options, universe, cwd);
            plan = affected.plan;
            if (plan.length === 0) {
                process.stdout.write(`${PREFIX} no affected tests for ${String(affected.changed)} changed path(s)\n`);
                return 0;
            }
            process.stdout.write(`${PREFIX} ${String(plan.length)} of ${String(universe.length)} test file(s) affected by ${String(affected.changed)} changed path(s) vs ${affected.base}\n`);
        }
    }
    else {
        plan = filesPlan(options.files, cwd);
    }
    for (const entry of plan)
        process.stdout.write(`  ${entry.file}  (${entry.reason})\n`);
    if (options.list)
        return 0;
    return summarize(await runTestFiles(plan.map((entry) => entry.file), options, cwd));
}
/** CLI entry: 0 when every selected file passed (or none was affected), 1 when any failed, 2 on a usage or git error. */
export async function main(argv, cwd = process.cwd()) {
    try {
        const options = parseAffectedArgs(argv);
        if (options.help) {
            process.stdout.write(`${FLEET_TEST_AFFECTED_USAGE}\n`);
            return 0;
        }
        return await execute(options, cwd);
    }
    catch (error) {
        process.stderr.write(`${PREFIX} ${error instanceof Error ? error.message : String(error)}\n`);
        if (error instanceof UsageError)
            process.stderr.write(`${FLEET_TEST_AFFECTED_USAGE}\n`);
        return 2;
    }
}
