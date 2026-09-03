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

export const SCHEMA = "ProvisionCanonicalLabelsReportV1";
export const ISSUE = "https://github.com/spencer-shadley/repo-template/issues/308";

export interface CanonicalLabel {
  name: string;
  color: string;
  description: string;
}

const PRIORITY_REPO_HOURS: Record<number, string> = {
  0: "1 hour",
  1: "24 hours",
  2: "48 hours",
  3: "72 hours",
  4: "96 hours",
  5: "120 hours",
};

const PRIORITY_COLORS: Record<number, string> = {
  0: "B60205",
  1: "D93F0B",
  2: "FBCA04",
  3: "0E8A16",
  4: "1D76DB",
  5: "6A737D",
};

export const BANNED_LABELS: readonly string[] = Object.freeze([
  "work:triaged",
  "tier:human",
  "priority:provisional",
  "needs-info",
  "human-approval",
]);

const STATIC_CANONICAL_LABELS: readonly CanonicalLabel[] = Object.freeze([
  // Priority Triplet & Rubric
  {
    name: "priority:triage-tbd",
    color: "FBCA04",
    description: "Awaiting durable priority confirmation; not an authoritative priority.",
  },
  {
    name: "priority:p0-candidate",
    color: "B60205",
    description: "P0 candidate; requires immediate-unblock validation before authoritative assignment.",
  },
  {
    name: "priority:rubric-v1",
    color: "1D76DB",
    description: "Priority Rubric v1 assessed; body block holds current RP/FP or provisional status.",
  },
  {
    name: "wait-slo-breached",
    color: "D93F0B",
    description: "Wait SLO breached",
  },
  {
    name: "priority:disposition:consolidated",
    color: "0E8A16",
    description: "Triaged and consolidated with aligned fleet priority",
  },

  // Work Spine Lifecycle
  {
    name: "work:untriaged",
    color: "BFDADC",
    description: "Work spine filing default; not yet triaged for effort/tier/priority.",
  },
  {
    name: "work:planned",
    color: "1D76DB",
    description: "Work spine completed stage: planned",
  },
  {
    name: "work:in-progress",
    color: "FBCA04",
    description: "Work spine completed stage: in-progress",
  },
  {
    name: "work:in-review",
    color: "D93F0B",
    description: "Work spine completed stage: in-review",
  },
  {
    name: "work:implemented",
    color: "5319E7",
    description: "Work spine completed stage: implemented",
  },

  // Dimensions
  {
    name: "effort:low",
    color: "C2E0C6",
    description: "Work effort: low",
  },
  {
    name: "effort:medium",
    color: "FEF2C0",
    description: "Work effort: medium",
  },
  {
    name: "effort:high",
    color: "E99695",
    description: "Work effort: high",
  },
  {
    name: "tier:auto",
    color: "BFD4F2",
    description: "Merge tier: auto",
  },
  {
    name: "human-required",
    color: "D93F0B",
    description: "Human input/merge floor (exact ask in comments); replaces banned tier:human",
  },

  // Intake
  {
    name: "agent-review",
    color: "5319E7",
    description: "Automated agent review and discovery intake",
  },
  {
    name: "human-feedback",
    color: "0E8A16",
    description: "Human-sourced feedback intake",
  },
  {
    name: "in-plan",
    color: "0E8A16",
    description: "Accepted into a governed implementation plan",
  },

  // Terminal Dispositions
  {
    name: "obsolete",
    color: "FFFFFF",
    description: "Terminal disposition: obsolete",
  },
  {
    name: "disposition:land",
    color: "0E8A16",
    description: "Terminal disposition: disposition:land",
  },
  {
    name: "disposition:explicit-discard",
    color: "E11D48",
    description: "Terminal disposition: disposition:explicit-discard",
  },
  {
    name: "disposition:preserve-as-history",
    color: "C5DEF5",
    description: "Terminal disposition: disposition:preserve-as-history",
  },
  {
    name: "disposition:bounded-successor",
    color: "FBCA04",
    description: "Terminal disposition: disposition:bounded-successor",
  },
]);

function buildNumberedPriorityLabels(scope: "repo" | "fleet"): CanonicalLabel[] {
  const result: CanonicalLabel[] = [];
  const scopeName = scope === "repo" ? "repository" : "fleet";
  for (let level = 0; level <= 5; level += 1) {
    const levelStr = String(level);
    const hours = PRIORITY_REPO_HOURS[level] ?? "120 hours";
    const desc = level === 0
      ? `Authoritative ${scopeName} priority P0 — eligible start within 1 hour; validated immediate unblock.`
      : `Authoritative ${scopeName} priority P${levelStr} — eligible start within ${hours}.`;
    result.push({
      name: `priority:${scope}:p${levelStr}`,
      color: PRIORITY_COLORS[level] ?? "6A737D",
      description: desc,
    });
  }
  return result;
}

export function buildCanonicalLabels(): readonly CanonicalLabel[] {
  const all: CanonicalLabel[] = [
    ...STATIC_CANONICAL_LABELS,
    ...buildNumberedPriorityLabels("repo"),
    ...buildNumberedPriorityLabels("fleet"),
  ];
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
  if (options.purgeBanned !== false) {
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
  const result = spawnSync(
    "gh",
    ["label", "list", "--repo", repo, "--json", "name,color,description", "--limit", "200"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Failed to list labels for ${repo}: ${result.stderr.trim()}`);
  }
  const parsed: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Unexpected response from gh label list: ${result.stdout}`);
  }
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

export function executeProvisionPlan(plan: ProvisionPlan, dryRun: boolean = false): {
  created: string[];
  updated: string[];
  purged: string[];
  errors: string[];
} {
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

export function runProvision(options: {
  repo?: string | undefined;
  dryRun?: boolean | undefined;
  purgeBanned?: boolean | undefined;
} = {}) {
  const repo = options.repo || resolveCurrentRepoSlug();
  const existing = fetchExistingLabels(repo);
  const plan = computeProvisionPlan(existing, CANONICAL_LABELS, BANNED_LABELS, {
    purgeBanned: options.purgeBanned !== false,
  });
  plan.repo = repo;
  const execution = executeProvisionPlan(plan, options.dryRun);

  return {
    schema: SCHEMA,
    issue: ISSUE,
    repo,
    dryRun: Boolean(options.dryRun),
    plan: {
      createCount: plan.create.length,
      updateCount: plan.update.length,
      purgeCount: plan.purge.length,
      unchangedCount: plan.unchanged.length,
    },
    execution,
  };
}

function printCliReport(report: ReturnType<typeof runProvision>, jsonOutput: boolean): void {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log(`Repository: ${report.repo} (dry-run: ${String(report.dryRun)})`);
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
  let purgeBanned = true;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--repo" && args[i + 1]) {
      repo = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--no-purge-banned") {
      purgeBanned = false;
    } else if (args[i] === "--json") {
      jsonOutput = true;
    }
  }

  try {
    const report = runProvision({ repo, dryRun, purgeBanned });
    printCliReport(report, jsonOutput);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
