#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanTodoIssueLinks } from "./scan.ts";

function usage(): never {
  console.error(
    "usage: todo-issue-link.mjs [--root DIR] [--changed path,path] [--repository owner/name] [--json-out PATH]",
  );
  process.exit(2);
}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) usage();

const rootDir = resolve(argValue(argv, "--root") || process.cwd());
const changed = argValue(argv, "--changed");
const repository = argValue(argv, "--repository") || null;
const jsonOut = argValue(argv, "--json-out");

const result = scanTodoIssueLinks({
  rootDir,
  mode: changed ? "changed-files" : "full-tree",
  paths: changed ? changed.split(",").map((p) => p.trim()).filter(Boolean) : undefined,
  repository,
});

const payload = `${JSON.stringify(result, null, 2)}\n`;
if (jsonOut) writeFileSync(jsonOut, payload, "utf8");
else process.stdout.write(payload);

if (!result.ok) {
  for (const finding of result.findings) {
    console.error(
      `${finding.path}:${finding.line}:${finding.column}: ${finding.violationReason}: ${finding.normalizedCommentText}`,
    );
  }
  for (const unsupported of result.unsupportedPaths) {
    console.error(`${unsupported.path}: unsupported authored source class (${unsupported.languageId ?? "unknown"})`);
  }
  process.exit(1);
}
