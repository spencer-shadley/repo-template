#!/usr/bin/env node
// @generated from affected-tests.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
/**
 * `fleet-test-affected` executable for the published repo-quality package.
 * The installed package cannot load TypeScript from node_modules, so the
 * TypeScript-authored launcher is emitted as an ESM `.mjs` artifact.
 */
try {
    await import(__rewriteRelativeImportExtension(new URL("./affected-tests/cli.mjs", import.meta.url).href));
}
catch (error) {
    console.error(error);
    process.exit(1);
}
export {};
