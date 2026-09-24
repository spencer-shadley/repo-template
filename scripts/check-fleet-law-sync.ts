/**
 * Deterministic fleet-law sync/check tool for repo-template (repo-template#381).
 *
 * Usage:
 *   node scripts/check-fleet-law-sync.ts --check
 *   node scripts/check-fleet-law-sync.ts --sync
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeFleetLawDigest,
  loadFleetLawProjection,
  verifyFleetLawProjection,
} from "./generated/fleet-law.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localProjectionPath = path.join(root, "scripts", "generated", "fleet-law-projection.v1.json");

const candidateCodeSourcePaths = [
  path.resolve(root, "../../../tools/work-spine/fleet-law-projection.v1.json"),
  path.resolve(root, "../../tools/work-spine/fleet-law-projection.v1.json"),
  "C:/code/tools/work-spine/fleet-law-projection.v1.json",
  // Cursor Cloud / AO session worktrees often sit outside the monorepo overlay.
  path.resolve("/workspace/tools/work-spine/fleet-law-projection.v1.json"),
  ...(process.env["CODE_REPO_ROOT"]
    ? [path.resolve(process.env["CODE_REPO_ROOT"], "tools/work-spine/fleet-law-projection.v1.json")]
    : []),
];

export function findCodeSourcePath(): string | undefined {
  for (const candidate of candidateCodeSourcePaths) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function runCheckFleetLawSync(options: { check?: boolean; sync?: boolean } = {}): {
  code: number;
  output: string[];
} {
  const isSync = options.sync === true;

  if (isSync) {
    const codeSource = findCodeSourcePath();
    if (!codeSource) {
      return {
        code: 1,
        output: [
          "Cannot sync fleet-law projection: Code source projection not found at any candidate location:",
          ...candidateCodeSourcePaths.map((p) => `  - ${p}`),
        ],
      };
    }
    const rawCodeText = readFileSync(codeSource, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawCodeText);
    } catch (error) {
      return {
        code: 1,
        output: [`Code source projection at ${codeSource} is corrupt JSON: ${String(error)}`],
      };
    }
    const errors = verifyFleetLawProjection(parsed);
    if (errors.length > 0) {
      return {
        code: 1,
        output: [
          `Code source projection at ${codeSource} is invalid:`,
          ...errors.map((e) => `  - ${e}`),
        ],
      };
    }
    writeFileSync(localProjectionPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    const digest = computeFleetLawDigest(parsed as Record<string, unknown>);
    return {
      code: 0,
      output: [
        `synced: scripts/generated/fleet-law-projection.v1.json from ${codeSource}`,
        `digest: ${digest}`,
      ],
    };
  }

  // Check mode
  let localProjection: ReturnType<typeof loadFleetLawProjection>;
  try {
    localProjection = loadFleetLawProjection(localProjectionPath);
  } catch (error) {
    return {
      code: 1,
      output: [`Local fleet-law projection verification failed: ${String(error)}`],
    };
  }

  const codeSource = findCodeSourcePath();
  if (codeSource) {
    try {
      const rawCodeText = readFileSync(codeSource, "utf8");
      const parsedCode = JSON.parse(rawCodeText) as Record<string, unknown>;
      if (parsedCode["contentDigest"] !== localProjection.contentDigest) {
        return {
          code: 1,
          output: [
            `Fleet-law projection out of sync with Code source (${codeSource}):`,
            `  Local digest:  ${localProjection.contentDigest}`,
            `  Code digest:   ${String(parsedCode["contentDigest"])}`,
            "Run with --sync to update local projection.",
          ],
        };
      }
    } catch {
      // Offline fallback
    }
  }

  return {
    code: 0,
    output: [
      `ok: fleet-law projection in sync (${localProjection.schema} rev ${String(localProjection.revision)})`,
      `digest: ${localProjection.contentDigest}`,
    ],
  };
}

const isMain =
  import.meta.url === new URL(`file://${process.argv[1]}`).href ||
  process.argv[1]?.endsWith("check-fleet-law-sync.ts");

if (isMain) {
  const selfTest = process.argv.includes("--self-test");
  if (selfTest) {
    const { code, output } = runCheckFleetLawSync({ check: true });
    if (code !== 0) {
      console.error(output.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("check-fleet-law-sync: PASS");
      process.exitCode = 0;
    }
  } else {
    const sync = process.argv.includes("--sync");
    const check = process.argv.includes("--check") || !sync;
    const { code, output } = runCheckFleetLawSync({ check, sync });
    for (const line of output) {
      if (code === 0) console.log(line);
      else console.error(line);
    }
    process.exitCode = code;
  }
}

