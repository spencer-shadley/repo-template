#!/usr/bin/env node
// @generated from affected-tests/cli.ts. DO NOT EDIT.
// @stack-waiver id=repo-quality-generated-js reason="Published npm entrypoint is generated JavaScript consumed directly by Node."
import { main } from "./run.mjs";
// exitCode, not exit(): a piped stdout still drains the per-file output.
process.exitCode = await main(process.argv.slice(2));
