// @generated from todo-issue-link/registry.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
/** Machine-readable authored-source coverage registry (repo-template#345). */
export const LANGUAGE_REGISTRY = Object.freeze([
    {
        id: "typescript",
        extensions: [".ts", ".tsx", ".mts", ".cts"],
        specialFilenames: [],
        commentSyntaxes: ["line-slash", "block-c"],
        extractorId: "c-family-comments-v1",
        coverage: "supported",
    },
    {
        id: "javascript",
        extensions: [".js", ".jsx", ".mjs", ".cjs"],
        specialFilenames: [],
        commentSyntaxes: ["line-slash", "block-c"],
        extractorId: "c-family-comments-v1",
        coverage: "supported",
    },
    {
        id: "python",
        extensions: [".py", ".pyi"],
        specialFilenames: [],
        commentSyntaxes: ["line-hash"],
        extractorId: "hash-line-comments-v1",
        coverage: "supported",
    },
    {
        id: "shell",
        extensions: [".sh", ".bash", ".zsh"],
        specialFilenames: [],
        commentSyntaxes: ["line-hash"],
        extractorId: "hash-line-comments-v1",
        coverage: "supported",
    },
    {
        id: "yaml",
        extensions: [".yml", ".yaml"],
        specialFilenames: [],
        commentSyntaxes: ["line-hash"],
        extractorId: "hash-line-comments-v1",
        coverage: "supported",
    },
    {
        id: "powershell",
        extensions: [".ps1", ".psm1", ".psd1"],
        specialFilenames: [],
        commentSyntaxes: ["line-hash", "block-powershell"],
        extractorId: "powershell-comments-v1",
        coverage: "supported",
    },
    {
        id: "go",
        extensions: [".go"],
        specialFilenames: [],
        commentSyntaxes: ["line-slash", "block-c"],
        extractorId: "c-family-comments-v1",
        coverage: "supported",
    },
    {
        id: "rust",
        extensions: [".rs"],
        specialFilenames: [],
        commentSyntaxes: ["line-slash", "block-c"],
        extractorId: "c-family-comments-v1",
        coverage: "supported",
    },
    {
        id: "java",
        extensions: [".java", ".kt", ".kts"],
        specialFilenames: [],
        commentSyntaxes: ["line-slash", "block-c"],
        extractorId: "c-family-comments-v1",
        coverage: "supported",
    },
    {
        id: "csharp",
        extensions: [".cs"],
        specialFilenames: [],
        commentSyntaxes: ["line-slash", "block-c"],
        extractorId: "c-family-comments-v1",
        coverage: "supported",
    },
    {
        id: "c-family",
        extensions: [".c", ".h", ".cc", ".cpp", ".hpp", ".cxx"],
        specialFilenames: [],
        commentSyntaxes: ["line-slash", "block-c"],
        extractorId: "c-family-comments-v1",
        coverage: "supported",
    },
    {
        id: "sql",
        extensions: [".sql"],
        specialFilenames: [],
        commentSyntaxes: ["line-dash", "block-c"],
        extractorId: "sql-comments-v1",
        coverage: "supported",
    },
    {
        id: "css",
        extensions: [".css", ".scss"],
        specialFilenames: [],
        commentSyntaxes: ["block-c"],
        extractorId: "css-block-comments-v1",
        coverage: "supported",
    },
    {
        id: "html-xml",
        extensions: [".html", ".htm", ".xml", ".svg"],
        specialFilenames: [],
        commentSyntaxes: ["block-html"],
        extractorId: "html-comments-v1",
        coverage: "supported",
    },
    {
        id: "dockerfile",
        extensions: [],
        specialFilenames: ["Dockerfile", "dockerfile"],
        commentSyntaxes: ["line-hash"],
        extractorId: "hash-line-comments-v1",
        coverage: "supported",
    },
    {
        id: "ini-properties",
        extensions: [".ini", ".properties"],
        specialFilenames: [],
        commentSyntaxes: ["line-hash"],
        extractorId: "hash-line-comments-v1",
        coverage: "supported",
    },
    {
        id: "markdown",
        extensions: [".md", ".markdown"],
        specialFilenames: [],
        commentSyntaxes: [],
        extractorId: "none",
        coverage: "skipped",
    },
]);
export function resolveLanguageClass(filePath) {
    const normalized = filePath.replaceAll("\\", "/");
    const base = normalized.split("/").pop() || normalized;
    for (const entry of LANGUAGE_REGISTRY) {
        if (entry.specialFilenames.some((name) => name.toLowerCase() === base.toLowerCase())) {
            return entry;
        }
    }
    const lower = base.toLowerCase();
    for (const entry of LANGUAGE_REGISTRY) {
        if (entry.extensions.some((ext) => lower.endsWith(ext))) {
            return entry;
        }
    }
    return null;
}
