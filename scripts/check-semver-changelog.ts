#!/usr/bin/env node
/**
 * Validate canonical repository SemVer and weekly preserved changelog rotation (Issue #90).
 *
 * Rules:
 *   SVC1: VERSION file exists at repository root and contains exactly one line of valid SemVer 2.0.0
 *   SVC2: CHANGELOG.md exists and its first '## ' heading is '## [Unreleased]'
 *   SVC3: Highest bracketed release version in CHANGELOG.md (or latest archived release) matches VERSION
 *   SVC4: Archived changelog files under docs/changelogs/ match YYYY-Www.md format (ignoring .gitkeep)
 *   SVC5: Archived changelog files contain valid archive headings
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import semver from "semver";

export type SemverChangelogRule = "SVC1" | "SVC2" | "SVC3" | "SVC4" | "SVC5" | "SVC6";

export interface SemverChangelogViolation {
  readonly rule: SemverChangelogRule;
  readonly file: string;
  readonly line?: number;
  readonly message: string;
}

export const ISO_WEEK_ARCHIVE_REGEX = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])\.md$/;
const BRACKETED_RELEASE_PATTERN = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\]/;
const H2_PATTERN = /^##\s+(.*)$/;

function formatCanonical(parsed: semver.SemVer): string {
  const core = `${String(parsed.major)}.${String(parsed.minor)}.${String(parsed.patch)}`;
  const pre = parsed.prerelease.length > 0 ? `-${parsed.prerelease.join(".")}` : "";
  const build = parsed.build.length > 0 ? `+${parsed.build.join(".")}` : "";
  return `${core}${pre}${build}`;
}

export function isValidCanonicalSemVer(raw: string): boolean {
  const parsed = semver.parse(raw);
  if (!parsed) return false;
  return formatCanonical(parsed) === raw;
}


/** Return property names newly present in `after.required` vs `before.required`. */
export function requiredPropertiesAdded(before: unknown, after: unknown): string[] {
  const beforeRequired = new Set(readRequiredArray(before));
  const afterRequired = readRequiredArray(after);
  return afterRequired.filter((name) => !beforeRequired.has(name)).toSorted();
}

function readRequiredArray(schema: unknown): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const required = (schema as { required?: unknown }).required;
  if (!Array.isArray(required)) return [];
  return required.filter((entry): entry is string => typeof entry === "string");
}

/** Trailing Keep-a-Changelog class token at the end of an Unreleased bullet (MAJOR|MINOR|PATCH). */
export function parseTrailingSemverLabel(text: string): "MAJOR" | "MINOR" | "PATCH" | null {
  // Keep-a-Changelog class token near the end of an Unreleased bullet, optionally
  // followed by "Fixes #N" / "Refs #N" (see CHANGELOG.md Unreleased entries).
  const match = /\b(MAJOR|MINOR|PATCH)\.?(?=\s+(?:Fixes|Refs)\b|[\s.]*$)/iu.exec(text.trim());
  return match ? (match[1]!.toUpperCase() as "MAJOR" | "MINOR" | "PATCH") : null;
}

export interface SchemaDiffInput {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
  /** Unreleased CHANGELOG bullet(s) covering this schema change; used for label check. */
  readonly unreleasedLabelText?: string;
}

export function checkSemverChangelog(options: {
  versionContent?: string;
  changelogContent?: string;
  archiveFiles?: Record<string, string>; // filename -> content
  repoRoot?: string;
  /** Optional schema diffs — SVC6 flags required-property additions under a non-MAJOR label. */
  schemaDiffs?: readonly SchemaDiffInput[];
}): SemverChangelogViolation[] {
  const violations: SemverChangelogViolation[] = [];
  let version = options.versionContent;
  let changelog = options.changelogContent;
  let archiveFiles = options.archiveFiles;

  if (options.repoRoot) {
    const vPath = join(options.repoRoot, "VERSION");
    if (existsSync(vPath)) {
      version = readFileSync(vPath, "utf8");
    } else {
      violations.push({
        rule: "SVC1",
        file: "VERSION",
        message: "Missing VERSION file at repository root",
      });
    }

    const cPath = join(options.repoRoot, "CHANGELOG.md");
    if (existsSync(cPath)) {
      changelog = readFileSync(cPath, "utf8");
    } else {
      violations.push({
        rule: "SVC2",
        file: "CHANGELOG.md",
        message: "Missing CHANGELOG.md file at repository root",
      });
    }

    const archDir = join(options.repoRoot, "docs", "changelogs");
    if (existsSync(archDir)) {
      archiveFiles = {};
      const entries = readdirSync(archDir);
      for (const entry of entries) {
        if (entry === ".gitkeep") continue;
        archiveFiles[entry] = readFileSync(join(archDir, entry), "utf8");
      }
    }
  }

  // SVC1: Validate VERSION
  let trimmedVersion = "";
  if (version !== undefined) {
    const lines = version.split(/\r?\n/).filter((l, idx, arr) => {
      // allow single trailing newline
      if (idx === arr.length - 1 && l.trim() === "") return false;
      return true;
    });

    if (lines.length === 0 || lines[0]?.trim() === "") {
      violations.push({
        rule: "SVC1",
        file: "VERSION",
        line: 1,
        message: "VERSION file is empty",
      });
    } else if (lines.length > 1) {
      violations.push({
        rule: "SVC1",
        file: "VERSION",
        line: 2,
        message: "VERSION file must contain exactly one line",
      });
    } else {
      trimmedVersion = (lines[0] ?? "").trim();
      if (!isValidCanonicalSemVer(trimmedVersion)) {
        violations.push({
          rule: "SVC1",
          file: "VERSION",
          line: 1,
          message: `VERSION content '${trimmedVersion}' is not valid SemVer 2.0.0`,
        });
      }
    }
  }

  // SVC2 & SVC3: Validate CHANGELOG.md
  if (changelog !== undefined) {
    const lines = changelog.split(/\r?\n/);
    const h2Headings: Array<{ line: number; text: string }> = [];
    let insideFence = false;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (/^ {0,3}(`{3,}|~{3,})/.test(line)) {
        insideFence = !insideFence;
        continue;
      }
      if (insideFence) continue;

      const match = H2_PATTERN.exec(line);
      if (match?.[1]) {
        h2Headings.push({ line: i + 1, text: match[1].trim() });
      }
    }

    if (h2Headings.length === 0) {
      violations.push({
        rule: "SVC2",
        file: "CHANGELOG.md",
        line: 1,
        message: "CHANGELOG.md has no '## ' headings; expected '## [Unreleased]'",
      });
    } else if (h2Headings[0]?.text !== "[Unreleased]") {
      violations.push({
        rule: "SVC2",
        file: "CHANGELOG.md",
        line: h2Headings[0]?.line ?? 1,
        message: `First '## ' heading in CHANGELOG.md is '## ${h2Headings[0]?.text}'; expected '## [Unreleased]'`,
      });
    }

    // Check release versions in CHANGELOG.md
    const releaseVersions: string[] = [];
    for (const h2 of h2Headings) {
      const vMatch = BRACKETED_RELEASE_PATTERN.exec(`## ${h2.text}`);
      if (vMatch?.[1]) {
        releaseVersions.push(vMatch[1]);
      }
    }

    if (trimmedVersion) {
      if (releaseVersions.length > 0) {
        const highestRelease = releaseVersions.reduce((highest, current) => {
          const cmp = semver.compare(current, highest);
          if (cmp > 0) return current;
          if (cmp === 0 && current === trimmedVersion) return current;
          return highest;
        });
        if (highestRelease !== trimmedVersion) {
          violations.push({
            rule: "SVC3",
            file: "CHANGELOG.md",
            message: `Highest release version '${highestRelease}' in CHANGELOG.md does not match VERSION '${trimmedVersion}'`,
          });
        }
      } else if (archiveFiles && Object.keys(archiveFiles).length > 0) {
        // If active changelog only has [Unreleased], check highest version in archives
        let highestArchived: string | null = null;
        for (const [filename, content] of Object.entries(archiveFiles)) {
          const aLines = content.split(/\r?\n/);
          for (const aLine of aLines) {
            const aMatch = BRACKETED_RELEASE_PATTERN.exec(aLine.trim());
            if (aMatch?.[1]) {
              const current = aMatch[1];
              if (highestArchived === null) {
                highestArchived = current;
              } else {
                const cmp = semver.compare(current, highestArchived);
                if (cmp > 0 || (cmp === 0 && current === trimmedVersion)) {
                  highestArchived = current;
                }
              }
            }
          }
        }
        if (highestArchived !== null && highestArchived !== trimmedVersion) {
          violations.push({
            rule: "SVC3",
            file: "docs/changelogs/",
            message: `Highest archived release version '${highestArchived}' does not match VERSION '${trimmedVersion}'`,
          });
        }
      }
    }
  }

  // SVC4 & SVC5: Validate archived changelogs
  if (archiveFiles) {
    for (const [filename, content] of Object.entries(archiveFiles)) {
      if (filename === ".gitkeep") continue;
      if (!ISO_WEEK_ARCHIVE_REGEX.test(filename)) {
        violations.push({
          rule: "SVC4",
          file: `docs/changelogs/${filename}`,
          message: `Archived changelog file '${filename}' does not match ISO week format YYYY-Www.md`,
        });
      } else {
        const week = filename.replace(/\.md$/, "");
        const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const firstLine = lines[0] ?? "";
        const expected1 = `# Changelog Archive \u2014 ${week}`;
        const expected2 = `# Changelog Archive - ${week}`;
        if (!firstLine.startsWith(expected1) && !firstLine.startsWith(expected2)) {
          violations.push({
            rule: "SVC5",
            file: `docs/changelogs/${filename}`,
            line: 1,
            message: `Archive file '${filename}' missing header '# Changelog Archive \u2014 ${week}' at start of file`,
          });
        }
      }
    }
  }

  // SVC6: required-property additions in contracts/**/*.schema.json require a MAJOR label
  if (options.schemaDiffs) {
    for (const diff of options.schemaDiffs) {
      const added = requiredPropertiesAdded(diff.before, diff.after);
      if (added.length === 0) continue;
      const label = diff.unreleasedLabelText
        ? parseTrailingSemverLabel(diff.unreleasedLabelText)
        : null;
      if (label !== "MAJOR") {
        violations.push({
          rule: "SVC6",
          file: diff.path,
          message:
            `Required-property addition(s) [${added.join(", ")}] in a contracts schema require a MAJOR CHANGELOG label (AGENTS.md); got ${label ?? "none"}`,
        });
      }
    }
  }

  return violations;
}

export function selfTest(): void {
  // Test valid baseline
  const valid = checkSemverChangelog({
    versionContent: "3.1.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.1.0] - 2026-07-29\n",
    archiveFiles: {
      "2026-W30.md": "# Changelog Archive \u2014 2026-W30\n\n## [3.0.0] - 2026-07-20\n",
    },
  });
  assert.deepEqual(valid, []);

  // Test invalid VERSION format
  const badVersion = checkSemverChangelog({
    versionContent: "3.1\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(badVersion.some((v) => v.rule === "SVC1"));

  // Test empty VERSION
  const emptyVersion = checkSemverChangelog({
    versionContent: " \n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(emptyVersion.some((v) => v.rule === "SVC1"));

  // Test multiline VERSION
  const multiVersion = checkSemverChangelog({
    versionContent: "1.0.0\n2.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(multiVersion.some((v) => v.rule === "SVC1"));

  // Test missing [Unreleased]
  const badChangelog = checkSemverChangelog({
    versionContent: "1.0.0\n",
    changelogContent: "# Changelog\n\n## [1.0.0] - 2026-01-01\n",
  });
  assert.ok(badChangelog.some((v) => v.rule === "SVC2"));

  // Test version mismatch
  const mismatch = checkSemverChangelog({
    versionContent: "2.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n",
  });
  assert.ok(mismatch.some((v) => v.rule === "SVC3"));

  // Test invalid archive filename
  const badArchive = checkSemverChangelog({
    versionContent: "1.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n",
    archiveFiles: {
      "legacy-archive.md": "# Changelog Archive \u2014 2026-W01\n",
    },
  });
  assert.ok(badArchive.some((v) => v.rule === "SVC4"));

  // Test invalid archive header
  const badHeader = checkSemverChangelog({
    versionContent: "1.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n",
    archiveFiles: {
      "2026-W01.md": "# Old Archive\n",
    },
  });
  assert.ok(badHeader.some((v) => v.rule === "SVC5"));

  // Test valid canonical SemVer with prerelease and build metadata
  const validPreBuild = checkSemverChangelog({
    versionContent: "1.0.0-beta.2+exp.sha.5114f85\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [1.0.0-beta.2+exp.sha.5114f85] - 2026-09-13\n",
  });
  assert.deepEqual(validPreBuild, []);

  // Test non-canonical VERSION formats rejected (leading v, leading zeroes)
  const nonCanonicalV = checkSemverChangelog({
    versionContent: "v1.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(nonCanonicalV.some((v) => v.rule === "SVC1"));

  const leadingZero = checkSemverChangelog({
    versionContent: "01.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(leadingZero.some((v) => v.rule === "SVC1"));

  const leadingZeroPre = checkSemverChangelog({
    versionContent: "1.0.0-01\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(leadingZeroPre.some((v) => v.rule === "SVC1"));

  // Test SVC3 precedence using semver (e.g. 1.0.0-rc.1 > 1.0.0-beta.11)
  const precedenceMismatch = checkSemverChangelog({
    versionContent: "1.0.0-beta.11\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [1.0.0-rc.1] - 2026-09-13\n\n## [1.0.0-beta.11] - 2026-09-12\n",
  });
  assert.ok(precedenceMismatch.some((v) => v.rule === "SVC3"));


  // SVC6: required-property addition under MINOR is refused; under MAJOR is accepted
  const schemaBefore = { type: "object", required: ["a"], properties: { a: { type: "string" } } };
  const schemaAfter = {
    type: "object",
    required: ["a", "evidenceDigest"],
    properties: { a: { type: "string" }, evidenceDigest: { type: "string" } },
  };
  assert.deepEqual(requiredPropertiesAdded(schemaBefore, schemaAfter), ["evidenceDigest"]);
  const svc6Minor = checkSemverChangelog({
    versionContent: "3.1.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.1.0] - 2026-07-29\n",
    schemaDiffs: [
      {
        path: "contracts/local-ci/v3/canary-candidate-receipt.schema.json",
        before: schemaBefore,
        after: schemaAfter,
        unreleasedLabelText: "Added required evidenceDigest. MINOR.",
      },
    ],
  });
  assert.ok(svc6Minor.some((v) => v.rule === "SVC6"));
  const svc6Major = checkSemverChangelog({
    versionContent: "3.1.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.1.0] - 2026-07-29\n",
    schemaDiffs: [
      {
        path: "contracts/local-ci/v3/canary-candidate-receipt.schema.json",
        before: schemaBefore,
        after: schemaAfter,
        unreleasedLabelText: "Added required evidenceDigest. MAJOR.",
      },
    ],
  });
  assert.ok(!svc6Major.some((v) => v.rule === "SVC6"));

  // Architectural check: verify no hand-written SemVer parser/comparator is reintroduced
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptContent = readFileSync(scriptPath, "utf8");
  const codeWithoutSelfTest = scriptContent.split("export function selfTest")[0] ?? "";
  assert.ok(
    !/\bfunction\s+compareSemVer\b/u.test(codeWithoutSelfTest),
    "scripts/check-semver-changelog.ts must not define compareSemVer",
  );
  assert.ok(
    !/\bfunction\s+parseSemVerNumbers\b/u.test(codeWithoutSelfTest),
    "scripts/check-semver-changelog.ts must not define parseSemVerNumbers",
  );
  assert.ok(
    !/\bSEMVER_REGEX\b/u.test(codeWithoutSelfTest),
    "scripts/check-semver-changelog.ts must not define SEMVER_REGEX",
  );

  const rotateScriptPath = join(dirname(scriptPath), "rotate-changelog-weekly.ts");
  if (existsSync(rotateScriptPath)) {
    const rotateContent = readFileSync(rotateScriptPath, "utf8");
    const rotateCode = rotateContent.split("export function selfTest")[0] ?? "";
    assert.ok(
      !/\bfunction\s+compareSemVer\b/u.test(rotateCode),
      "scripts/rotate-changelog-weekly.ts must not define compareSemVer",
    );
    assert.ok(
      !/\bfunction\s+parseSemVerNumbers\b/u.test(rotateCode),
      "scripts/rotate-changelog-weekly.ts must not define parseSemVerNumbers",
    );
  }

  console.log("check-semver-changelog: self-test passed");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    try {
      selfTest();
    } catch (error) {
      console.error(`check-semver-changelog self-test failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    return;
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const violations = checkSemverChangelog({ repoRoot });

  if (violations.length > 0) {
    console.error("check-semver-changelog: FAIL");
    for (const v of violations) {
      const loc = v.line !== undefined ? `${v.file}:${String(v.line)}` : v.file;
      console.error(`${loc}: ${v.rule} ${v.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log("check-semver-changelog: ok -- VERSION, CHANGELOG.md, and docs/changelogs/ conform to standard");
  }
}

const invokedPath = process.argv[1];
const invokedAsMain =
  invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url;

if (invokedAsMain) {
  main();
}
