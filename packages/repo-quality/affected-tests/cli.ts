#!/usr/bin/env node
import { main } from "./run.ts";

// exitCode, not exit(): a piped stdout still drains the per-file output.
process.exitCode = await main(process.argv.slice(2));
