// @generated from affected-tests/args.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
/**
 * `fleet-test-affected` command line (repo-template#549, code#14238). Pure: no file system, no git.
 */
export const FLEET_TEST_AFFECTED_USAGE = `usage: fleet-test-affected <full-suite test glob>... [options]
       fleet-test-affected --files <test file>... [--node-arg <flag>]...

Runs only the test files the diff against origin/<default branch>, plus the working tree, affects.
The globs are the repository's full-suite test patterns (fs.globSync; ** works); only files they
match can be selected.

  --base <ref>              diff against <ref> instead of origin/HEAD (fallback origin/master, origin/main)
  --list                    print the selection and why; run nothing
  --all                     run every file the globs match (the full suite)
  --files <file>...         run exactly these test files; every later positional is a file
  --node-arg <flag>         forward <flag> to every \`node --test\` child (repeatable; --node-arg=<flag> also works)
  --run-map <src>=<out>     run compiled output: <src>x.test.ts selects <out>x.test.js
  --timeout-seconds <n>     kill and fail one test file after <n> seconds (default 600)
  --help                    print this text`;
export const DEFAULT_FILE_TIMEOUT_SECONDS = 600;
export class UsageError extends Error {
}
/** `tests/=dist/tests/` → { from: "tests/", to: "dist/tests/" }. */
export function parseRunMap(value) {
    const separator = value.indexOf("=");
    const from = value.slice(0, separator).replaceAll("\\", "/");
    const to = value.slice(separator + 1).replaceAll("\\", "/");
    if (separator <= 0 || to === "")
        throw new UsageError(`--run-map needs <srcPrefix>=<outPrefix>, got '${value}'`);
    return { from, to };
}
/** The file a selected source test runs as: under `--run-map`, compiled output with a .js extension. */
export function toRunPath(file, runMap) {
    if (!runMap?.from || !file.startsWith(runMap.from))
        return file;
    return `${runMap.to}${file.slice(runMap.from.length)}`.replace(/\.([cm]?)tsx?$/, ".$1js");
}
const VALUE_FLAGS = new Set(["--base", "--node-arg", "--run-map", "--timeout-seconds"]);
const SWITCHES = new Set(["--list", "--all", "--files", "--help", "-h"]);
function applyValue(options, flag, value) {
    if (flag === "--base")
        options.baseRef = value;
    else if (flag === "--node-arg")
        options.nodeArgs.push(value);
    else if (flag === "--run-map")
        options.runMap = parseRunMap(value);
    else {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0)
            throw new UsageError(`--timeout-seconds needs a positive number, got '${value}'`);
        options.timeoutSeconds = seconds;
    }
}
function applySwitch(options, flag) {
    if (flag === "--list")
        options.list = true;
    else if (flag === "--all")
        options.all = true;
    else if (flag === "--files")
        options.files ??= [];
    else
        options.help = true;
}
/** Applies `argv[index]` and returns the index of the last word it consumed. */
function consume(options, argv, index) {
    const arg = argv[index] ?? "";
    const equals = arg.indexOf("=");
    const flag = arg.startsWith("--") && equals > 0 ? arg.slice(0, equals) : arg;
    if (VALUE_FLAGS.has(flag)) {
        // A value may itself start with `--` (`--node-arg --experimental-strip-types`), so take the next word as is.
        const inline = flag !== arg;
        const value = inline ? arg.slice(equals + 1) : (argv[index + 1] ?? "");
        if (value === "")
            throw new UsageError(`${flag} needs a value`);
        applyValue(options, flag, value);
        return inline ? index : index + 1;
    }
    if (SWITCHES.has(arg))
        applySwitch(options, arg);
    else if (arg.startsWith("-") && arg !== "-")
        throw new UsageError(`unknown option ${arg}`);
    else if (options.files === null)
        options.patterns.push(arg);
    else
        options.files.push(arg);
    return index;
}
export function parseAffectedArgs(argv) {
    const options = {
        patterns: [], files: null, baseRef: null, nodeArgs: [], runMap: null,
        list: false, all: false, help: false, timeoutSeconds: DEFAULT_FILE_TIMEOUT_SECONDS,
    };
    for (let index = 0; index < argv.length; index += 1)
        index = consume(options, argv, index);
    if (options.all && options.files !== null)
        throw new UsageError("--all and --files cannot be combined");
    return options;
}
