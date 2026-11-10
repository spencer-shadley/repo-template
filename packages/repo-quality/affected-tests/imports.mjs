// @generated from affected-tests/imports.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
/**
 * Relative-import parsing for the affected-test selector (moved from Code `tools/checks/eslint-scope.ts`,
 * repo-template#549). Pure: no file system, no git.
 */
import path from "node:path";
const IMPORTABLE_EXTENSIONS = Object.freeze([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
function normalizePath(file) {
    return file.replaceAll("\\", "/").replace(/^\.\//, "");
}
/** Relative specifiers (`./x`, `../y`) a source imports, requires or dynamically imports. */
export function parseImportSpecifiers(source) {
    const specs = new Set();
    const patterns = [
        /\bfrom\s+["']([^"']+)["']/g,
        /\bimport\s+["']([^"']+)["']/g,
        /\brequire\(\s*["']([^"']+)["']\s*\)/g,
        /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    ];
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            const specifier = match[1];
            if (specifier?.startsWith("."))
                specs.add(specifier);
        }
    }
    return [...specs];
}
function extensionCandidates(file) {
    const normalized = normalizePath(file);
    const parsed = path.posix.parse(normalized);
    const candidates = new Set([normalized]);
    const extensionMap = {
        ".js": [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx"],
        ".jsx": [".jsx", ".tsx"],
        ".mjs": [".mjs", ".mts"],
        ".cjs": [".cjs", ".cts"],
    };
    const replacements = extensionMap[parsed.ext] ?? (parsed.ext ? [parsed.ext] : IMPORTABLE_EXTENSIONS);
    if (parsed.ext) {
        for (const extension of replacements) {
            candidates.add(`${parsed.dir}/${parsed.name}${extension}`.replace(/^\.\//, ""));
        }
    }
    else {
        for (const extension of IMPORTABLE_EXTENSIONS)
            candidates.add(`${normalized}${extension}`);
    }
    const initialCandidates = new Set(candidates);
    for (const candidate of initialCandidates) {
        for (const extension of IMPORTABLE_EXTENSIONS)
            candidates.add(`${candidate}/index${extension}`);
    }
    return [...candidates];
}
/** Repo paths a relative specifier in `fromFile` may load (extension swaps and `index.*`); empty for bare specifiers. */
export function resolveImportCandidates(fromFile, specifier) {
    if (!specifier.startsWith("."))
        return [];
    const fromDir = path.posix.dirname(normalizePath(fromFile));
    return extensionCandidates(path.posix.normalize(path.posix.join(fromDir, specifier)));
}
