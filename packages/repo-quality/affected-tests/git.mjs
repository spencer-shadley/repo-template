// @generated from affected-tests/git.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
/**
 * Git facts `fleet-test-affected` selects from (repo-template#549): the default-branch base, the changed paths since
 * its merge base plus the working tree, and the working-tree file list. Read-only git calls.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { changedScriptText, normalizeRepoPath } from "./select.mjs";
const compareStrings = (left, right) => left.localeCompare(right);
function git(cwd, args) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return result.status === 0 ? result.stdout : null;
}
function mustGit(cwd, args) {
    const output = git(cwd, args);
    if (output === null)
        throw new Error(`git ${args.join(" ")} failed in ${cwd}`);
    return output;
}
/** The repository top level, with symlinks resolved. */
export function repoRootOf(cwd) {
    return mustGit(cwd, ["rev-parse", "--show-toplevel"]).trim();
}
/** `origin/HEAD`'s target, else the first of origin/master, origin/main, master, main that exists; null when none does. */
export function defaultBaseRef(cwd) {
    const head = git(cwd, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])?.trim();
    if (head)
        return head.replace(/^refs\/remotes\//, "");
    for (const candidate of ["origin/master", "origin/main", "master", "main"]) {
        if (git(cwd, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]) !== null)
            return candidate;
    }
    return null;
}
/** Paths in `git status --porcelain=v1 -z` output; a rename or copy yields both its new and its old path. */
export function parsePorcelainZ(output) {
    const entries = output.split("\0");
    const paths = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index] ?? "";
        if (entry.length < 4)
            continue;
        paths.push(entry.slice(3));
        const status = entry.slice(0, 2);
        if (status.includes("R") || status.includes("C")) {
            index += 1;
            const original = entries[index];
            if (original)
                paths.push(original);
        }
    }
    return paths;
}
/** Repo-relative paths changed since the merge base of `baseRef` and HEAD, plus staged, unstaged and untracked ones. */
export function collectChangedPaths(repoRoot, baseRef) {
    const committed = git(repoRoot, ["diff", "--name-only", "--no-renames", "-z", `${baseRef}...HEAD`]);
    if (committed === null)
        throw new Error(`git diff ${baseRef}...HEAD failed; fetch the base or pass --base <ref>`);
    const status = mustGit(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
    const paths = [...committed.split("\0").filter(Boolean), ...parsePorcelainZ(status)].map(normalizeRepoPath);
    return [...new Set(paths)].toSorted(compareStrings);
}
/** Tracked plus untracked (not ignored) files, repo-relative. */
export function workingTreeFiles(repoRoot) {
    return mustGit(repoRoot, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean).map(normalizeRepoPath);
}
/**
 * Root package.json script text that differs from the merge base. Empty when package.json did not change or either
 * side is unreadable: treating every script as changed would select every test any script names.
 */
export function collectChangedScripts(repoRoot, baseRef, changedPaths) {
    if (!changedPaths.includes("package.json"))
        return [];
    const mergeBase = git(repoRoot, ["merge-base", baseRef, "HEAD"])?.trim() ?? baseRef;
    const base = git(repoRoot, ["show", `${mergeBase}:package.json`]);
    if (base === null)
        return [];
    try {
        const current = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
        return changedScriptText(JSON.parse(base), current);
    }
    catch {
        return [];
    }
}
