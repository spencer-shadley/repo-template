#!/usr/bin/env node
/**
 * Idempotent weekly preserved changelog rotation generator (Issue #90).
 *
 * Rotates completed release sections from CHANGELOG.md into weekly archive files:
 * docs/changelogs/YYYY-Www.md
 *
 * Guarantees:
 * - Deterministic, idempotent execution (f(f(x)) = f(x)).
 * - Preserves active '## [Unreleased]' section in CHANGELOG.md.
 * - Merges without duplicating release entries or clobbering existing archives.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const H2_RELEASE_PATTERN = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\] - (\d{4}-\d{2}-\d{2})$/;
const H2_PATTERN = /^##\s+(.*)$/;

export interface ReleaseBlock {
  readonly version: string;
  readonly date: string;
  readonly heading: string;
  readonly content: string;
}

export interface ParsedChangelog {
  readonly header: string;
  readonly unreleasedSection: string;
  readonly releases: readonly ReleaseBlock[];
}

export function parseSemVerNumbers(version: string): [number, number, number] {
  const base = version.split("-", 1)[0]?.split("+", 1)[0] ?? version;
  const parts = base.split(".").map((n) => Math.trunc(Number(n)));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareSemVer(a: string, b: string): number {
  const cleanA = a.replace(/^\s*v/i, "").trim();
  const cleanB = b.replace(/^\s*v/i, "").trim();

  // Strip build metadata (everything after +)
  const noBuildA = cleanA.split("+")[0] ?? "";
  const noBuildB = cleanB.split("+")[0] ?? "";

  const [coreA = "", preA] = noBuildA.split("-");
  const [coreB = "", preB] = noBuildB.split("-");

  const [majA = 0, minA = 0, patA = 0] = coreA.split(".").map(Number);
  const [majB = 0, minB = 0, patB = 0] = coreB.split(".").map(Number);

  if (majA !== majB) return majA - majB;
  if (minA !== minB) return minA - minB;
  if (patA !== patB) return patA - patB;

  // A normal version has greater precedence than a pre-release version
  if (!preA && preB) return 1;
  if (preA && !preB) return -1;
  if (!preA && !preB) return 0;

  // Compare pre-release identifiers dot-separated
  const idA = preA.split(".");
  const idB = preB.split(".");
  const len = Math.max(idA.length, idB.length);

  for (let i = 0; i < len; i++) {
    const partA = idA[i];
    const partB = idB[i];
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;

    const isNumA = /^\d+$/.test(partA);
    const isNumB = /^\d+$/.test(partB);

    if (isNumA && isNumB) {
      const numA = Number(partA);
      const numB = Number(partB);
      if (numA !== numB) return numA - numB;
    } else if (isNumA && !isNumB) {
      return -1;
    } else if (!isNumA && isNumB) {
      return 1;
    } else {
      const cmp = partA.localeCompare(partB);
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}

/**
 * Calculates the ISO 8601 week number (YYYY-Www) for a given date YYYY-MM-DD.
 */
export function getIsoWeek(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;

  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay() || 7; // Monday = 1, Sunday = 7
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek); // Move to Thursday

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${String(date.getUTCFullYear())}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Calculates the start (Monday) and end (Sunday) dates for a given ISO week YYYY-Www.
 */
export function getIsoWeekRange(isoWeek: string): { start: string; end: string } {
  const [yearStr, weekStr] = isoWeek.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);

  // Jan 4th is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // 1 (Mon) - 7 (Sun)
  // Monday of week 1
  const week1Mon = new Date(Date.UTC(year, 0, 4 - dayOfWeek + 1));
  // Monday of target week
  const targetMon = new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000);
  const targetSun = new Date(targetMon.getTime() + 6 * 86400000);

  const format = (d: Date) => d.toISOString().slice(0, 10);
  return { start: format(targetMon), end: format(targetSun) };
}

/**
 * Parses a Keep a Changelog formatted markdown string into structured components.
 */
export function parseChangelog(content: string): ParsedChangelog {
  const lines = content.split(/\r?\n/);
  let unreleasedStart = -1;
  let unreleasedEnd = -1;
  const releaseStarts: Array<{ index: number; version: string; date: string; heading: string }> = [];

  let insideFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const h2Match = H2_PATTERN.exec(line);
    if (h2Match?.[1]) {
      const headingText = h2Match[1].trim();
      if (headingText === "[Unreleased]") {
        unreleasedStart = i;
      } else {
        const relMatch = H2_RELEASE_PATTERN.exec(line);
        if (relMatch?.[1] && relMatch[2]) {
          if (unreleasedStart >= 0 && unreleasedEnd === -1) {
            unreleasedEnd = i;
          }
          releaseStarts.push({
            index: i,
            version: relMatch[1],
            date: relMatch[2],
            heading: line,
          });
        }
      }
    }
  }

  if (unreleasedStart >= 0 && unreleasedEnd === -1) {
    unreleasedEnd = lines.length;
  }

  const header = unreleasedStart > 0 ? lines.slice(0, unreleasedStart).join("\n") : "";
  const unreleasedSection =
    unreleasedStart >= 0
      ? lines.slice(unreleasedStart, unreleasedEnd).join("\n").trimEnd()
      : "## [Unreleased]";

  const releases: ReleaseBlock[] = [];
  for (let r = 0; r < releaseStarts.length; r += 1) {
    const current = releaseStarts[r];
    if (!current) continue;
    const nextStart = releaseStarts[r + 1]?.index ?? lines.length;
    const blockContent = lines.slice(current.index, nextStart).join("\n").trim();
    releases.push({
      version: current.version,
      date: current.date,
      heading: current.heading,
      content: blockContent,
    });
  }

  return { header, unreleasedSection, releases };
}

/**
 * Parses existing release sections from an archive markdown file.
 */
export function parseArchiveReleases(content: string): ReleaseBlock[] {
  const lines = content.split(/\r?\n/);
  const releaseStarts: Array<{ index: number; version: string; date: string; heading: string }> = [];

  let insideFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const relMatch = H2_RELEASE_PATTERN.exec(line);
    if (relMatch?.[1] && relMatch[2]) {
      releaseStarts.push({
        index: i,
        version: relMatch[1],
        date: relMatch[2],
        heading: line,
      });
    }
  }

  const releases: ReleaseBlock[] = [];
  for (let r = 0; r < releaseStarts.length; r += 1) {
    const current = releaseStarts[r];
    if (!current) continue;
    const nextStart = releaseStarts[r + 1]?.index ?? lines.length;
    const blockContent = lines.slice(current.index, nextStart).join("\n").trim();
    releases.push({
      version: current.version,
      date: current.date,
      heading: current.heading,
      content: blockContent,
    });
  }
  return releases;
}

export interface RotateOptions {
  readonly changelogContent: string;
  readonly existingArchives?: Record<string, string>; // isoWeek -> file content
  readonly targetWeek?: string; // e.g. "2026-W30", or undefined to rotate all matching policy
  readonly keepLatestCount?: number; // default 0 (rotate all specified), or e.g. 1 to keep newest release in root
}

export interface RotateResult {
  readonly updatedChangelog: string;
  readonly archives: Record<string, string>; // isoWeek -> complete file content
  readonly rotatedCount: number;
}

/**
 * Idempotently rotates releases from active changelog to weekly archive files.
 */
export function rotateChangelogWeekly(options: RotateOptions): RotateResult {
  const { header, unreleasedSection, releases } = parseChangelog(options.changelogContent);
  const keepCount = options.keepLatestCount ?? 0;
  const archives: Record<string, string> = { ...(options.existingArchives ?? {}) };

  const toKeep: ReleaseBlock[] = [];
  const toArchive: ReleaseBlock[] = [];

  for (let i = 0; i < releases.length; i += 1) {
    const rel = releases[i];
    if (!rel) continue;
    if (i < keepCount) {
      toKeep.push(rel);
      continue;
    }
    const isoWeek = getIsoWeek(rel.date);
    if (options.targetWeek && options.targetWeek !== isoWeek) {
      toKeep.push(rel);
    } else {
      toArchive.push(rel);
    }
  }

  let rotatedCount = 0;

  // Group toArchive by isoWeek
  const byWeek = new Map<string, ReleaseBlock[]>();
  for (const rel of toArchive) {
    const week = getIsoWeek(rel.date);
    const list = byWeek.get(week) ?? [];
    list.push(rel);
    byWeek.set(week, list);
  }

  for (const [week, newReleases] of byWeek.entries()) {
    const existingContent = archives[week];
    const existingReleases = existingContent ? parseArchiveReleases(existingContent) : [];
    const existingVersions = new Set(existingReleases.map((r) => r.version));

    const combined: ReleaseBlock[] = [...existingReleases];
    for (const rel of newReleases) {
      if (!existingVersions.has(rel.version)) {
        combined.push(rel);
        rotatedCount += 1;
      }
    }

    // Sort descending by SemVer
    combined.sort((a, b) => compareSemVer(b.version, a.version));

    const { start, end } = getIsoWeekRange(week);
    const weekNum = week.split("-W")[1] ?? "01";
    const archiveHeader = `# Changelog Archive \u2014 ${week}\n\nISO Week ${weekNum} (${start} to ${end})\n`;
    const body = combined.map((r) => r.content).join("\n\n");
    archives[week] = `${archiveHeader}\n${body}\n`;
  }

  // Reconstruct updated CHANGELOG.md
  const cleanHeader = header.trim();
  const cleanUnreleased = unreleasedSection.trim();
  const remainingReleases = toKeep.map((r) => r.content).join("\n\n");

  const parts = [
    cleanHeader ? `${cleanHeader}\n` : "",
    cleanUnreleased,
    remainingReleases ? `\n\n${remainingReleases}` : "",
  ].filter(Boolean);

  const updatedChangelog = `${parts.join("\n")}\n`;

  return { updatedChangelog, archives, rotatedCount };
}

export function selfTest(): void {
  // Test ISO week computation
  assert.equal(getIsoWeek("2026-07-27"), "2026-W31"); // Monday July 27, 2026 is week 31
  assert.equal(getIsoWeek("2026-07-26"), "2026-W30"); // Sunday July 26, 2026 is week 30
  assert.equal(getIsoWeek("2026-01-01"), "2026-W01"); // Thursday Jan 1, 2026 is week 1

  // Test ISO week range
  const range30 = getIsoWeekRange("2026-W30");
  assert.equal(range30.start, "2026-07-20");
  assert.equal(range30.end, "2026-07-26");

  const testChangelog = `# Changelog\n\nFormat: [Keep a Changelog](https://keepachangelog.com).\n\n## [Unreleased]\n\n- Some active feature\n\n## [1.1.0] - 2026-07-27\n\n### Added\n- Feature 1.1\n\n## [1.0.0] - 2026-07-20\n\n### Added\n- Feature 1.0\n`;

  // First rotation: archive all completed releases
  const result1 = rotateChangelogWeekly({
    changelogContent: testChangelog,
  });

  assert.equal(result1.rotatedCount, 2);
  assert.ok(result1.archives["2026-W31"]?.includes("## [1.1.0] - 2026-07-27"));
  assert.ok(result1.archives["2026-W30"]?.includes("## [1.0.0] - 2026-07-20"));
  assert.ok(!result1.updatedChangelog.includes("## [1.1.0]"));
  assert.ok(result1.updatedChangelog.includes("## [Unreleased]"));

  // Second rotation (IDEMPOTENCY): running again against the updated changelog produces 0 rotated entries
  const result2 = rotateChangelogWeekly({
    changelogContent: result1.updatedChangelog,
    existingArchives: result1.archives,
  });
  assert.equal(result2.rotatedCount, 0);
  assert.equal(result2.updatedChangelog, result1.updatedChangelog);
  assert.deepEqual(result2.archives, result1.archives);

  // Third rotation: re-running against the original changelog with existing archives merges idempotently without duplicates
  const result3 = rotateChangelogWeekly({
    changelogContent: testChangelog,
    existingArchives: result1.archives,
  });
  assert.equal(result3.rotatedCount, 0); // No new versions added
  assert.equal(result3.archives["2026-W31"], result1.archives["2026-W31"]);
  assert.equal(result3.archives["2026-W30"], result1.archives["2026-W30"]);

  // Test keepLatestCount = 1
  const keepLatestResult = rotateChangelogWeekly({
    changelogContent: testChangelog,
    keepLatestCount: 1,
  });
  assert.equal(keepLatestResult.rotatedCount, 1);
  assert.ok(keepLatestResult.updatedChangelog.includes("## [1.1.0] - 2026-07-27"));
  assert.ok(!keepLatestResult.updatedChangelog.includes("## [1.0.0] - 2026-07-20"));
  assert.ok(keepLatestResult.archives["2026-W30"]?.includes("## [1.0.0] - 2026-07-20"));

  console.log("rotate-changelog-weekly: self-test passed");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    try {
      selfTest();
    } catch (error) {
      console.error(`rotate-changelog-weekly self-test failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    return;
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const changelogPath = join(repoRoot, "CHANGELOG.md");
  const archiveDir = join(repoRoot, "docs", "changelogs");

  if (!existsSync(changelogPath)) {
    console.error(`rotate-changelog-weekly: missing ${changelogPath}`);
    process.exitCode = 2;
    return;
  }

  const changelogContent = readFileSync(changelogPath, "utf8");
  const existingArchives: Record<string, string> = {};
  if (existsSync(archiveDir)) {
    for (const file of readdirSync(archiveDir)) {
      if (file.endsWith(".md")) {
        const week = file.replace(/\.md$/, "");
        existingArchives[week] = readFileSync(join(archiveDir, file), "utf8");
      }
    }
  }

  const isCheck = process.argv.includes("--check");
  const keepLatest = process.argv.includes("--keep-latest");

  const result = rotateChangelogWeekly({
    changelogContent,
    existingArchives,
    keepLatestCount: keepLatest ? 1 : 0,
  });

  if (isCheck) {
    if (result.rotatedCount > 0) {
      console.log(`rotate-changelog-weekly: ${String(result.rotatedCount)} release(s) pending rotation into docs/changelogs/`);
      process.exitCode = 1;
    } else {
      console.log("rotate-changelog-weekly: ok -- active changelog and archives are synchronized");
    }
    return;
  }

  if (process.argv.includes("--write")) {
    mkdirSync(archiveDir, { recursive: true });
    for (const [week, content] of Object.entries(result.archives)) {
      writeFileSync(join(archiveDir, `${week}.md`), content, "utf8");
    }
    writeFileSync(changelogPath, result.updatedChangelog, "utf8");
    console.log(`rotate-changelog-weekly: rotated ${String(result.rotatedCount)} release(s) into docs/changelogs/`);
  } else {
    console.log(`rotate-changelog-weekly: ${String(result.rotatedCount)} release(s) would be rotated (run with --write to apply)`);
  }
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  main();
}
