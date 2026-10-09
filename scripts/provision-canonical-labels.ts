#!/usr/bin/env node
/**
 * Canonical GitHub labels provisioner for repository bootstrap and adoption (repo-template#308).
 *
 * Why this exists:
 * ----------------
 * When new repositories are bootstrapped or adopted from repo-template, they require the full
 * fleet canonical label set (priority triplet/rubric/repo/fleet, work-spine lifecycle stages,
 * dimensions, intake, and terminal dispositions). Banned labels must never be created and are
 * purged if present.
 *
 * SOT sources:
 * - work-spine-contract.v1.json / work-spine-label-vocabulary.ts
 * - priority-intake-contract.v1.json
 * - triage-lifecycle-labels.ts
 *
 * Usage:
 *   node scripts/provision-canonical-labels.ts [--repo owner/name] [--dry-run] [--no-purge-banned] [--json]
 */

import { spawnSync } from "node:child_process";
import {
  assertFleetLawValid,
  FLEET_LAW_EVIDENCE,
  FLEET_LAW_PROJECTION,
  type FleetLawLabelDefinition,
} from "./generated/fleet-law.ts";
import { resolveCurrentRelease, type ReleaseSource, type ResolvedRelease } from "./governed-intake-release.ts";

export const SCHEMA = "ProvisionCanonicalLabelsReportV1";
export const ISSUE = "https://github.com/spencer-shadley/repo-template/issues/308";

export type CanonicalLabel = FleetLawLabelDefinition;

export const BANNED_LABELS: readonly string[] = Object.freeze([
  ...FLEET_LAW_PROJECTION.bannedLabels,
]);

/**
 * Portable additions owned specifically by Repo Template (outside Code fleet-law slice).
 * Composed into the canonical label kit without collision.
 */
const TEMPLATE_PORTABLE_LABELS: readonly CanonicalLabel[] = Object.freeze([
  {
    name: "agent-review",
    color: "5319E7",
    description: "Automated agent review and discovery intake",
  },
  {
    name: "needs-rebase",
    color: "B60205",
    description:
      "Current conflict signal: branch needs rebase onto base; not merge approval or semantic suitability (repo-template#346).",
  },
  {
    name: "needs-verification",
    color: "FBCA04",
    description:
      "Outstanding verification request; not dequeue, merge approval, or completion (repo-template#347).",
  },
]);

export function buildCanonicalLabels(release?: ResolvedRelease): readonly CanonicalLabel[] {
  assertFleetLawValid();
  const map = new Map<string, CanonicalLabel>();

  // 1. Code-owned managed label slice from exact FleetLawProjectionV1 artifact:
  for (const def of FLEET_LAW_PROJECTION.labels) {
    map.set(def.name.toLowerCase(), {
      name: def.name,
      color: def.color,
      description: def.description,
    });
  }

  // The completion stamp follows the CURRENT published release resolved at use time (no pinned revision).
  if (release && !map.has(release.triageLabel.toLowerCase())) {
    map.set(release.triageLabel.toLowerCase(), {
      name: release.triageLabel,
      color: "0E8A16",
      description: `Triage checklist completion stamp for GovernedIntakeBodyV1 version ${String(release.revision)}; strip on re-triage.`,
    });
  }

  // 2. Repo Template portable additions:
  for (const def of TEMPLATE_PORTABLE_LABELS) {
    if (!map.has(def.name.toLowerCase())) {
      map.set(def.name.toLowerCase(), {
        name: def.name,
        color: def.color,
        description: def.description,
      });
    }
  }

  const all = Array.from(map.values());
  return Object.freeze(all.toSorted((a, b) => a.name.localeCompare(b.name)));
}

export const CANONICAL_LABELS = buildCanonicalLabels();

export function resolveCurrentRepoSlug(): string {
  const result = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("Unable to determine repository slug from git remote origin");
  }
  const remote = result.stdout.trim();
  const match = /(?:git@github\.com:|https:\/\/github\.com\/)([^/]+\/[^/.]+?)(?:\.git)?$/i.exec(remote);
  if (!match) {
    throw new Error(`Unrecognized git origin URL: ${remote}`);
  }
  const slug = match[1];
  if (!slug) {
    throw new Error(`Failed to extract slug from git origin URL: ${remote}`);
  }
  return slug.toLowerCase();
}

export interface ExistingLabel {
  name: string;
  color: string;
  description: string;
}

export interface ProvisionPlan {
  repo: string;
  create: CanonicalLabel[];
  update: CanonicalLabel[];
  purge: string[];
  unchanged: string[];
}

function classifyCanonicalLabels(
  canonicalLabels: readonly CanonicalLabel[],
  existingByName: ReadonlyMap<string, ExistingLabel>,
): { create: CanonicalLabel[]; update: CanonicalLabel[]; unchanged: string[] } {
  const create: CanonicalLabel[] = [];
  const update: CanonicalLabel[] = [];
  const unchanged: string[] = [];

  for (const canonical of canonicalLabels) {
    const existing = existingByName.get(canonical.name.toLowerCase());
    if (!existing) {
      create.push(canonical);
      continue;
    }
    const colorDiffers = existing.color.toUpperCase() !== canonical.color.toUpperCase();
    const descDiffers = (existing.description || "").trim() !== canonical.description.trim();
    if (colorDiffers || descDiffers) {
      update.push(canonical);
    } else {
      unchanged.push(canonical.name);
    }
  }

  return { create, update, unchanged };
}

export function computeProvisionPlan(
  existingLabels: readonly ExistingLabel[],
  canonicalLabels: readonly CanonicalLabel[] = CANONICAL_LABELS,
  bannedLabels: readonly string[] = BANNED_LABELS,
  options: { purgeBanned?: boolean } = {},
): ProvisionPlan {
  const existingByName = new Map<string, ExistingLabel>();
  for (const label of existingLabels) {
    existingByName.set(label.name.toLowerCase(), label);
  }

  const { create, update, unchanged } = classifyCanonicalLabels(canonicalLabels, existingByName);

  const purge: string[] = [];
  if (options.purgeBanned === true) {
    const bannedSet = new Set(bannedLabels.map((b) => b.toLowerCase()));
    for (const label of existingLabels) {
      if (bannedSet.has(label.name.toLowerCase())) {
        purge.push(label.name);
      }
    }
  }

  return {
    repo: "",
    create,
    update,
    purge,
    unchanged,
  };
}

function isExistingLabel(item: unknown): item is ExistingLabel {
  if (typeof item !== "object" || item === null) return false;
  return "name" in item && typeof item.name === "string" && "color" in item && typeof item.color === "string";
}

export function fetchExistingLabels(repo: string): ExistingLabel[] {
  // REST (not `gh label list`, which needs GraphQL); one JSON object per line across pages.
  const result = spawnSync(
    "gh",
    ["api", "--paginate", `repos/${repo}/labels?per_page=100`, "--jq", ".[] | {name, color, description}"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to list labels for ${repo}: ${result.stderr.trim()}`);
  }
  const parsed: unknown[] = result.stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line): unknown => JSON.parse(line));
  return parsed.filter(isExistingLabel);
}

function executeCreate(labels: readonly CanonicalLabel[], repo: string, dryRun: boolean): { created: string[]; errors: string[] } {
  const created: string[] = [];
  const errors: string[] = [];
  for (const label of labels) {
    if (dryRun) {
      created.push(label.name);
      continue;
    }
    const res = spawnSync(
      "gh",
      ["label", "create", label.name, "--repo", repo, "--color", label.color, "--description", label.description],
      { encoding: "utf8", windowsHide: true },
    );
    if (res.status === 0) {
      created.push(label.name);
    } else {
      errors.push(`Failed to create ${label.name}: ${res.stderr.trim()}`);
    }
  }
  return { created, errors };
}

function executeUpdate(labels: readonly CanonicalLabel[], repo: string, dryRun: boolean): { updated: string[]; errors: string[] } {
  const updated: string[] = [];
  const errors: string[] = [];
  for (const label of labels) {
    if (dryRun) {
      updated.push(label.name);
      continue;
    }
    const res = spawnSync(
      "gh",
      ["label", "edit", label.name, "--repo", repo, "--color", label.color, "--description", label.description],
      { encoding: "utf8", windowsHide: true },
    );
    if (res.status === 0) {
      updated.push(label.name);
    } else {
      errors.push(`Failed to edit ${label.name}: ${res.stderr.trim()}`);
    }
  }
  return { updated, errors };
}

function executePurge(names: readonly string[], repo: string, dryRun: boolean): { purged: string[]; errors: string[] } {
  const purged: string[] = [];
  const errors: string[] = [];
  for (const name of names) {
    if (dryRun) {
      purged.push(name);
      continue;
    }
    const res = spawnSync(
      "gh",
      ["label", "delete", name, "--repo", repo, "--yes"],
      { encoding: "utf8", windowsHide: true },
    );
    if (res.status === 0) {
      purged.push(name);
    } else {
      errors.push(`Failed to purge ${name}: ${res.stderr.trim()}`);
    }
  }
  return { purged, errors };
}

export function executeProvisionPlan(plan: ProvisionPlan, dryRun: boolean = false, release?: ResolvedRelease): {
  created: string[];
  updated: string[];
  purged: string[];
  errors: string[];
} {
  if (!dryRun && !release) throw new Error("release-not-resolved: live effects require a verified current producer release");
  const createRes = executeCreate(plan.create, plan.repo, dryRun);
  const updateRes = executeUpdate(plan.update, plan.repo, dryRun);
  const purgeRes = executePurge(plan.purge, plan.repo, dryRun);

  return {
    created: createRes.created,
    updated: updateRes.updated,
    purged: purgeRes.purged,
    errors: [...createRes.errors, ...updateRes.errors, ...purgeRes.errors],
  };
}

export async function runProvision(options: {
  repo?: string | undefined;
  dryRun?: boolean | undefined;
  purgeBanned?: boolean | undefined;
  releaseSource?: ReleaseSource | undefined;
  existingLabels?: readonly ExistingLabel[] | undefined;
} = {}) {
  assertFleetLawValid();
  // Resolve + verify the current published producer release before any effect (dry-run included).
  const release = await resolveCurrentRelease(options.releaseSource);
  const repo = options.repo || resolveCurrentRepoSlug();
  const existing = options.existingLabels ?? fetchExistingLabels(repo);
  const plan = computeProvisionPlan(existing, buildCanonicalLabels(release), BANNED_LABELS, {
    purgeBanned: options.purgeBanned === true,
  });
  plan.repo = repo;
  const execution = executeProvisionPlan(plan, options.dryRun, release);

  return {
    schema: SCHEMA,
    issue: ISSUE,
    repo,
    dryRun: Boolean(options.dryRun),
    fleetLawEvidence: {
      sourceCommit: FLEET_LAW_EVIDENCE.sourceCommit,
      schema: FLEET_LAW_EVIDENCE.schema,
      revision: FLEET_LAW_EVIDENCE.revision,
      contentDigest: FLEET_LAW_EVIDENCE.contentDigest,
      governedIntakeRevision: FLEET_LAW_EVIDENCE.governedIntakeRevision,
    },
    producerRelease: release,
    plan: {
      createCount: plan.create.length,
      updateCount: plan.update.length,
      purgeCount: plan.purge.length,
      unchangedCount: plan.unchanged.length,
    },
    execution,
  };
}

function printCliReport(report: Awaited<ReturnType<typeof runProvision>>, jsonOutput: boolean): void {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log(`Repository: ${report.repo} (dry-run: ${String(report.dryRun)})`);
  console.log(`Producer release: r${String(report.producerRelease.revision)} head ${report.producerRelease.headCommit} payload ${report.producerRelease.payloadDigest} stamp ${report.producerRelease.triageLabel}`);
  console.log(`- Created: ${String(report.execution.created.length)}`);
  console.log(`- Updated: ${String(report.execution.updated.length)}`);
  console.log(`- Purged:  ${String(report.execution.purged.length)}`);
  console.log(`- Unchanged: ${String(report.plan.unchangedCount)}`);
  if (report.execution.errors.length > 0) {
    console.error("Errors:");
    for (const err of report.execution.errors) {
      console.error(`  ${err}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("provision-canonical-labels.ts")) {
  const args = process.argv.slice(2);
  let repo: string | undefined;
  let dryRun = false;
  const purgeBanned = false;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--repo" && args[i + 1]) {
      repo = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--no-purge-banned") {
      // Historical label preservation is already the default.
    } else if (args[i] === "--json") {
      jsonOutput = true;
    }
  }

  try {
    const report = await runProvision({ repo, dryRun, purgeBanned });
    printCliReport(report, jsonOutput);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
