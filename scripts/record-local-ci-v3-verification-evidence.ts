/**
 * Actually execute the LocalCiContractV3 candidate's declared verification
 * commands and record authenticated evidence (real exit code, real
 * timestamps, a digest of the captured output) to
 * `contracts/local-ci/v3/verification-evidence.json`.
 *
 * This is a producer-side, out-of-band tool: it is NOT part of `pnpm verify`
 * (running it would recurse, since one of the declared commands IS
 * `corepack pnpm verify`). It is run once, manually, immediately before
 * freezing a candidate with `scripts/freeze-local-ci-v3-candidate.ts`, which
 * only ever *reads* the ledger this script produces -- it never re-executes
 * anything, so there is no recursion at `pnpm verify` time.
 *
 * Fails closed: if any declared command exits non-zero, this script itself
 * exits non-zero and does NOT write a ledger claiming a pass (repo-template
 * #340 acceptance criteria, defect 2).
 *
 * Binds evidence to `git rev-parse HEAD` of wherever it is run. To produce
 * evidence for an already-committed, immutable candidate commit (the normal
 * case -- `scripts/freeze-local-ci-v3-candidate.ts`'s `FROZEN_CANDIDATE_COMMIT`
 * is a historical commit, not the repair branch tip), run this from a
 * detached worktree checked out at that exact commit, e.g.:
 *   git worktree add ../candidate-snapshot <candidate-commit>
 *   cd ../candidate-snapshot && corepack pnpm install --frozen-lockfile --ignore-scripts
 *   node scripts/record-local-ci-v3-verification-evidence.ts --write
 * then copy the resulting ledger back into the repair worktree. This proves
 * the checks actually passed against the candidate's own frozen bytes, not
 * against unrelated repair-branch edits.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(root, "contracts", "local-ci", "v3", "verification-evidence.json");

interface CheckSpec {
  readonly id: string;
  readonly command: string;
}

// "corepack pnpm verify" is intentionally excluded: this recorder is itself
// invoked as part of freezing a candidate whose own consumption (via
// scripts/freeze-local-ci-v3-candidate.ts --self-test/--check) runs INSIDE
// `pnpm verify`. Recording "pnpm verify passed" as one of the commands
// executed to build the evidence that `pnpm verify` needs to pass is
// circular. The complete gate is instead run out-of-band as a separate
// operational step and its result is reported with the PR/issue, not
// embedded as a self-referential ledger entry.
const CHECKS: readonly CheckSpec[] = [
  {
    id: "proof-of-detection-self-test",
    command: "node scripts/proof-of-detection/run-meta-gate.ts --self-test",
  },
  {
    id: "local-ci-v3-contract-unit",
    command: "node --test packages/adoption-shell/test/local-ci-contract-v3.test.ts",
  },
  {
    id: "local-ci-outcome-v1-unit",
    command: "node --test packages/adoption-shell/test/local-ci-outcome-v1.test.ts",
  },
  { id: "release-payload-check", command: "node tools/release-payload.ts check" },
  { id: "artifact-build-verify", command: "node tools/artifact-build.ts verify" },
];

function resolveBoundCommit(): string {
  return execSync("git rev-parse HEAD", { cwd: root }).toString("utf8").trim();
}

interface RecordedEntry {
  readonly command: string;
  readonly exitCode: number;
  readonly result: "passed" | "failed";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly outputSha256: string;
}

function isExecSyncError(
  value: unknown,
): value is { status?: number; stdout?: Buffer; stderr?: Buffer } {
  return typeof value === "object" && value !== null;
}

function readExecSyncErrorField(value: unknown, field: "status" | "stdout" | "stderr"): unknown {
  return isExecSyncError(value) ? value[field] : undefined;
}

function runCheck(spec: CheckSpec): RecordedEntry {
  const startedAt = new Date().toISOString();
  let exitCode: number;
  let output: string;
  try {
    output = execSync(spec.command, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    }).toString("utf8");
    exitCode = 0;
  } catch (error) {
    const status = readExecSyncErrorField(error, "status");
    const stdout = readExecSyncErrorField(error, "stdout");
    const stderr = readExecSyncErrorField(error, "stderr");
    exitCode = typeof status === "number" ? status : 1;
    output = `${Buffer.isBuffer(stdout) ? stdout.toString("utf8") : ""}${Buffer.isBuffer(stderr) ? stderr.toString("utf8") : ""}`;
  }
  const finishedAt = new Date().toISOString();
  return {
    command: spec.command,
    exitCode,
    result: exitCode === 0 ? "passed" : "failed",
    startedAt,
    finishedAt,
    outputSha256: createHash("sha256").update(output, "utf8").digest("hex"),
  };
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== "--write") {
    throw new Error("usage: node scripts/record-local-ci-v3-verification-evidence.ts --write");
  }

  const boundCommit = resolveBoundCommit();
  const checks: Record<string, RecordedEntry> = {};
  let anyFailed = false;
  for (const spec of CHECKS) {
    console.log(`Executing "${spec.id}": ${spec.command}`);
    const entry = runCheck(spec);
    checks[spec.id] = entry;
    if (entry.result !== "passed") {
      anyFailed = true;
      console.error(`  -> FAILED (exit ${String(entry.exitCode)})`);
    } else {
      console.log("  -> passed");
    }
  }

  const ledger = {
    schemaId: "https://schemas.repo-template.dev/local-ci-v3/verification-evidence.schema.json",
    schemaVersion: "1.0.0",
    boundCommit,
    generatedAt: new Date().toISOString(),
    checks,
  };

  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  if (anyFailed) {
    console.error(
      "One or more checks failed. Evidence ledger was written reflecting the failure(s); " +
        "the freeze script will refuse to build a candidate receipt from it.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Wrote authenticated verification evidence to ${evidencePath}`);
}

main();
