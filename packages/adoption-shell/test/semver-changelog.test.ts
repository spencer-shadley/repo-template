import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import semver from "semver";

import {
  checkSemverChangelog,
  discoverPublicContracts,
  isValidCanonicalSemVer,
  ISO_WEEK_ARCHIVE_REGEX,
  parseTrailingSemverLabel,
  requiredPropertiesAdded,
} from "../../../scripts/check-semver-changelog.ts";

import {
  getIsoWeek,
  getIsoWeekRange,
  parseChangelog,
  parseArchiveReleases,
  rotateChangelogWeekly,
} from "../../../scripts/rotate-changelog-weekly.ts";

test("isValidCanonicalSemVer validates strict SemVer 2.0.0 and rejects non-canonical spellings", () => {
  assert.ok(isValidCanonicalSemVer("0.1.0"));
  assert.ok(isValidCanonicalSemVer("1.0.0"));
  assert.ok(isValidCanonicalSemVer("3.1.0"));
  assert.ok(isValidCanonicalSemVer("10.20.30"));
  assert.ok(isValidCanonicalSemVer("1.0.0-alpha.1"));
  assert.ok(isValidCanonicalSemVer("1.0.0+20260911"));
  assert.ok(isValidCanonicalSemVer("1.0.0-beta.2+exp.sha.5114f85"));
  assert.ok(isValidCanonicalSemVer("0.0.0"));
  assert.ok(isValidCanonicalSemVer("1.0.0-0"));
  assert.ok(isValidCanonicalSemVer("1.0.0-alpha.0"));
  assert.ok(isValidCanonicalSemVer("1.0.0-01a"));

  // Rejects invalid, non-canonical, or loose formats
  assert.ok(!isValidCanonicalSemVer(""));
  assert.ok(!isValidCanonicalSemVer("v1.0.0"));
  assert.ok(!isValidCanonicalSemVer("V1.0.0"));
  assert.ok(!isValidCanonicalSemVer("=1.0.0"));
  assert.ok(!isValidCanonicalSemVer("1.0"));
  assert.ok(!isValidCanonicalSemVer("1"));
  assert.ok(!isValidCanonicalSemVer("1.0.0.0"));
  assert.ok(!isValidCanonicalSemVer("01.0.0"));
  assert.ok(!isValidCanonicalSemVer("1.01.0"));
  assert.ok(!isValidCanonicalSemVer("1.0.01"));
  assert.ok(!isValidCanonicalSemVer("1.0.0-01"));
  assert.ok(!isValidCanonicalSemVer("1.0.0-alpha.01"));
  assert.ok(!isValidCanonicalSemVer("1.0.0+build 1"));
  assert.ok(!isValidCanonicalSemVer("1.0.0+build_1"));
  assert.ok(!isValidCanonicalSemVer("invalid"));
  assert.ok(!isValidCanonicalSemVer(" 1.0.0"));
  assert.ok(!isValidCanonicalSemVer("1.0.0 "));
});

test("ISO_WEEK_ARCHIVE_REGEX validates YYYY-Www.md", () => {
  assert.ok(ISO_WEEK_ARCHIVE_REGEX.test("2026-W01.md"));
  assert.ok(ISO_WEEK_ARCHIVE_REGEX.test("2026-W30.md"));
  assert.ok(ISO_WEEK_ARCHIVE_REGEX.test("2026-W52.md"));
  assert.ok(ISO_WEEK_ARCHIVE_REGEX.test("2026-W53.md"));

  assert.ok(!ISO_WEEK_ARCHIVE_REGEX.test("2026-W00.md"));
  assert.ok(!ISO_WEEK_ARCHIVE_REGEX.test("2026-W54.md"));
  assert.ok(!ISO_WEEK_ARCHIVE_REGEX.test("2026-30.md"));
  assert.ok(!ISO_WEEK_ARCHIVE_REGEX.test("archive.md"));
  assert.ok(!ISO_WEEK_ARCHIVE_REGEX.test(".gitkeep"));
});

test("semver.compare implements SemVer 2.0.0 official precedence", () => {
  assert.ok(semver.compare("2.0.0", "1.9.9") > 0);
  assert.ok(semver.compare("1.2.0", "1.1.9") > 0);
  assert.ok(semver.compare("1.0.1", "1.0.0") > 0);
  assert.equal(semver.compare("3.1.0", "3.1.0"), 0);
  assert.ok(semver.compare("0.9.0", "1.0.0") < 0);
  assert.ok(semver.compare("1.0.0-alpha", "1.0.0") < 0);
  assert.ok(semver.compare("1.0.0-rc.1", "1.0.0") < 0);

  // Official SemVer 2.0.0 Spec Section 11 precedence example chain
  const chain = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];
  for (let i = 0; i < chain.length - 1; i++) {
    const v1 = chain[i]!;
    const v2 = chain[i + 1]!;
    assert.ok(semver.compare(v1, v2) < 0, `Expected ${v1} < ${v2}`);
    assert.ok(semver.compare(v2, v1) > 0, `Expected ${v2} > ${v1}`);
  }
});

test("semver.compare implements numeric vs alphanumeric prerelease identifier precedence", () => {
  // Numeric identifiers have lower precedence than non-numeric
  assert.ok(semver.compare("1.0.0-1", "1.0.0-a") < 0);
  assert.ok(semver.compare("1.0.0-999", "1.0.0-alpha") < 0);
  assert.ok(semver.compare("1.0.0-alpha.1", "1.0.0-alpha.a") < 0);

  // Numeric identifiers compared numerically
  assert.ok(semver.compare("1.0.0-2", "1.0.0-10") < 0);
  assert.ok(semver.compare("1.0.0-10", "1.0.0-2") > 0);

  // Alphanumeric identifiers compared lexically
  assert.ok(semver.compare("1.0.0-alpha", "1.0.0-beta") < 0);
  assert.ok(semver.compare("1.0.0-beta", "1.0.0-alpha") > 0);
});

test("semver.compare implements prerelease field length precedence", () => {
  // Larger set of pre-release fields has higher precedence when preceding are equal
  assert.ok(semver.compare("1.0.0-alpha", "1.0.0-alpha.1") < 0);
  assert.ok(semver.compare("1.0.0-alpha.1", "1.0.0-alpha.1.1") < 0);
  assert.ok(semver.compare("1.0.0-alpha.1.1", "1.0.0-alpha.1") > 0);
});

test("semver.compare ignores build metadata in precedence determination", () => {
  assert.equal(semver.compare("1.0.0+build.1", "1.0.0+build.2"), 0);
  assert.equal(semver.compare("1.0.0-alpha+001", "1.0.0-alpha+exp.sha.5114f85"), 0);
  assert.equal(semver.compare("1.0.0+20260911", "1.0.0"), 0);
});

test("semver.compare enforces ASCII lexical sort order, avoiding locale collation drift", () => {
  // In ASCII: "Z" (0x5A) < "a" (0x61).
  // SemVer 2.0.0 Spec Section 11 defines lexical ASCII sort order.
  assert.equal(semver.compare("1.0.0-Z", "1.0.0-a"), -1);
  assert.equal(semver.compare("1.0.0-a", "1.0.0-Z"), 1);

  // Negative control: String.prototype.localeCompare collates "Z" after "a" in standard locales,
  // confirming why local comparator delegation to node-semver prevents locale-dependent defects.
  assert.ok("Z".localeCompare("a") > 0);
});

test("checkSemverChangelog validates valid repository structure", () => {
  const violations = checkSemverChangelog({
    versionContent: "3.1.0\n",
    changelogContent: [
      "# Changelog",
      "",
      "Format: [Keep a Changelog](https://keepachangelog.com).",
      "",
      "## [Unreleased]",
      "",
      "- New unreleased item",
      "",
      "## [3.1.0] - 2026-07-29",
      "",
      "### Added",
      "- Release 3.1.0",
    ].join("\n"),
    archiveFiles: {
      "2026-W30.md": [
        "# Changelog Archive \u2014 2026-W30",
        "",
        "ISO Week 30 (2026-07-20 to 2026-07-26)",
        "",
        "## [3.0.0] - 2026-07-20",
        "",
        "### Added",
        "- Initial 3.0",
      ].join("\n"),
    },
  });

  assert.deepEqual(violations, []);
});

test("checkSemverChangelog catches invalid VERSION", () => {
  const badFormat = checkSemverChangelog({
    versionContent: "v3.1.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(badFormat.some((v) => v.rule === "SVC1"));

  const empty = checkSemverChangelog({
    versionContent: "",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(empty.some((v) => v.rule === "SVC1"));

  const multiline = checkSemverChangelog({
    versionContent: "1.0.0\n2.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n",
  });
  assert.ok(multiline.some((v) => v.rule === "SVC1"));
});

test("checkSemverChangelog catches missing [Unreleased] in CHANGELOG.md", () => {
  const missingUnreleased = checkSemverChangelog({
    versionContent: "1.0.0\n",
    changelogContent: "# Changelog\n\n## [1.0.0] - 2026-07-29\n\n- No unreleased\n",
  });
  assert.ok(missingUnreleased.some((v) => v.rule === "SVC2"));
});

test("checkSemverChangelog catches version mismatch with VERSION", () => {
  const mismatch = checkSemverChangelog({
    versionContent: "2.0.0\n",
    changelogContent: [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "## [1.9.0] - 2026-07-29",
      "",
      "- Older version",
    ].join("\n"),
  });
  assert.ok(mismatch.some((v) => v.rule === "SVC3"));
});

test("checkSemverChangelog catches invalid archive filenames and headers", () => {
  const badArchiveFile = checkSemverChangelog({
    versionContent: "1.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-07-29\n",
    archiveFiles: {
      "old-changelog.md": "# Changelog Archive \u2014 2026-W30\n",
    },
  });
  assert.ok(badArchiveFile.some((v) => v.rule === "SVC4"));

  const badHeader = checkSemverChangelog({
    versionContent: "1.0.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-07-29\n",
    archiveFiles: {
      "2026-W30.md": "# Invalid Header Title\n",
    },
  });
  assert.ok(badHeader.some((v) => v.rule === "SVC5"));
});

test("getIsoWeek and getIsoWeekRange calculate correctly", () => {
  assert.equal(getIsoWeek("2026-01-01"), "2026-W01"); // Thursday
  assert.equal(getIsoWeek("2026-01-04"), "2026-W01"); // Sunday
  assert.equal(getIsoWeek("2026-01-05"), "2026-W02"); // Monday
  assert.equal(getIsoWeek("2026-07-27"), "2026-W31"); // Monday
  assert.equal(getIsoWeek("2026-07-26"), "2026-W30"); // Sunday

  const range = getIsoWeekRange("2026-W31");
  assert.equal(range.start, "2026-07-27");
  assert.equal(range.end, "2026-08-02");
});

test("parseChangelog splits header, unreleased, and releases cleanly", () => {
  const text = [
    "# Changelog",
    "",
    "Format notes.",
    "",
    "## [Unreleased]",
    "",
    "- Added item 1",
    "- Fixed item 2",
    "",
    "## [1.2.0] - 2026-07-29",
    "",
    "### Added",
    "- Feature X",
    "",
    "## [1.1.0] - 2026-07-20",
    "",
    "### Fixed",
    "- Bug Y",
  ].join("\n");

  const parsed = parseChangelog(text);
  assert.ok(parsed.header.includes("# Changelog"));
  assert.ok(parsed.unreleasedSection.includes("## [Unreleased]"));
  assert.ok(parsed.unreleasedSection.includes("Added item 1"));
  assert.equal(parsed.releases.length, 2);
  assert.equal(parsed.releases[0]?.version, "1.2.0");
  assert.equal(parsed.releases[0]?.date, "2026-07-29");
  assert.equal(parsed.releases[1]?.version, "1.1.0");
  assert.equal(parsed.releases[1]?.date, "2026-07-20");
});

test("rotateChangelogWeekly archives idempotently", () => {
  const changelog = [
    "# Changelog",
    "",
    "Format notes.",
    "",
    "## [Unreleased]",
    "",
    "- Pending feature",
    "",
    "## [2.1.0] - 2026-07-29",
    "",
    "### Added",
    "- Feature 2.1.0",
    "",
    "## [2.0.0] - 2026-07-20",
    "",
    "### Added",
    "- Feature 2.0.0",
  ].join("\n");

  // Step 1: Initial rotation
  const run1 = rotateChangelogWeekly({ changelogContent: changelog });
  assert.equal(run1.rotatedCount, 2);
  assert.ok(run1.archives["2026-W31"]?.includes("## [2.1.0] - 2026-07-29"));
  assert.ok(run1.archives["2026-W30"]?.includes("## [2.0.0] - 2026-07-20"));
  assert.ok(!run1.updatedChangelog.includes("## [2.1.0]"));
  assert.ok(!run1.updatedChangelog.includes("## [2.0.0]"));
  assert.ok(run1.updatedChangelog.includes("## [Unreleased]"));

  // Step 2: Second run on the updated changelog produces no changes (idempotence)
  const run2 = rotateChangelogWeekly({
    changelogContent: run1.updatedChangelog,
    existingArchives: run1.archives,
  });
  assert.equal(run2.rotatedCount, 0);
  assert.equal(run2.updatedChangelog, run1.updatedChangelog);
  assert.deepEqual(run2.archives, run1.archives);

  // Step 3: Re-running against original changelog with existing archives merges without duplicating
  const run3 = rotateChangelogWeekly({
    changelogContent: changelog,
    existingArchives: run1.archives,
  });
  assert.equal(run3.rotatedCount, 0);
  assert.equal(run3.archives["2026-W31"], run1.archives["2026-W31"]);
  assert.equal(run3.archives["2026-W30"], run1.archives["2026-W30"]);
});

test("rotateChangelogWeekly supports keepLatestCount", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "## [2.1.0] - 2026-07-29",
    "",
    "### Added",
    "- Feature 2.1.0",
    "",
    "## [2.0.0] - 2026-07-20",
    "",
    "### Added",
    "- Feature 2.0.0",
  ].join("\n");

  const result = rotateChangelogWeekly({
    changelogContent: changelog,
    keepLatestCount: 1,
  });

  assert.equal(result.rotatedCount, 1);
  assert.ok(result.updatedChangelog.includes("## [2.1.0] - 2026-07-29"));
  assert.ok(!result.updatedChangelog.includes("## [2.0.0] - 2026-07-20"));
  assert.ok(result.archives["2026-W30"]?.includes("## [2.0.0] - 2026-07-20"));
});

test("architectural assertion: no duplicate SemVer parser or comparator in repository scripts", () => {
  const checkSemverPath = fileURLToPath(new URL("../../../scripts/check-semver-changelog.ts", import.meta.url));
  const rotatePath = fileURLToPath(new URL("../../../scripts/rotate-changelog-weekly.ts", import.meta.url));

  const checkSemverSource = readFileSync(checkSemverPath, "utf8");
  const rotateSource = readFileSync(rotatePath, "utf8");

  const checkSemverCode = checkSemverSource.split("export function selfTest")[0] ?? "";
  const rotateCode = rotateSource.split("export function selfTest")[0] ?? "";

  assert.ok(
    !/\bfunction\s+compareSemVer\b/u.test(checkSemverCode),
    "check-semver-changelog.ts must not define compareSemVer",
  );
  assert.ok(
    !/\bfunction\s+parseSemVerNumbers\b/u.test(checkSemverCode),
    "check-semver-changelog.ts must not define parseSemVerNumbers",
  );
  assert.ok(
    !/\bSEMVER_REGEX\b/u.test(checkSemverCode),
    "check-semver-changelog.ts must not define SEMVER_REGEX",
  );

  assert.ok(
    !/\bfunction\s+compareSemVer\b/u.test(rotateCode),
    "rotate-changelog-weekly.ts must not define compareSemVer",
  );
  assert.ok(
    !/\bfunction\s+parseSemVerNumbers\b/u.test(rotateCode),
    "rotate-changelog-weekly.ts must not define parseSemVerNumbers",
  );
});

test("SVC6: required-property additions in contracts schemas require MAJOR label", () => {
  const before = { type: "object", required: ["frozenInputs"], properties: { frozenInputs: { type: "object" } } };
  const after = {
    type: "object",
    required: ["frozenInputs", "evidenceDigest", "evidenceSource"],
    properties: {
      frozenInputs: { type: "object" },
      evidenceDigest: { type: "string" },
      evidenceSource: { type: "string" },
    },
  };
  assert.deepEqual(requiredPropertiesAdded(before, after), ["evidenceDigest", "evidenceSource"]);
  assert.equal(parseTrailingSemverLabel("… MINOR."), "MINOR");
  assert.equal(parseTrailingSemverLabel("… MAJOR."), "MAJOR");

  const underMinor = checkSemverChangelog({
    versionContent: "3.2.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.2.0] - 2026-09-15\n",
    schemaDiffs: [
      {
        path: "contracts/local-ci/v3/canary-candidate-receipt.schema.json",
        before,
        after,
        unreleasedLabelText: "Added required evidenceDigest/evidenceSource. MINOR. Fixes #369.",
      },
    ],
  });
  assert.ok(underMinor.some((v) => v.rule === "SVC6"));

  const underMajor = checkSemverChangelog({
    versionContent: "3.2.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.2.0] - 2026-09-15\n",
    schemaDiffs: [
      {
        path: "contracts/local-ci/v3/canary-candidate-receipt.schema.json",
        before,
        after,
        unreleasedLabelText: "Added required evidenceDigest/evidenceSource. MAJOR. Fixes #371.",
      },
    ],
  });
  assert.equal(underMajor.filter((v) => v.rule === "SVC6").length, 0);
});

test("SVC1: enforces one authoritative SemVer per released public contract and verifies derived repository VERSION matches TEMPLATE_VERSION", () => {
  // Baseline valid with template contract authority and derived root VERSION
  const valid = checkSemverChangelog({
    versionContent: "3.2.0\n",
    templateVersionContent: "3.2.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.2.0] - 2026-09-15\n",
    packageManifests: {
      "packages/repo-quality/package.json": JSON.stringify({
        name: "@spencer-shadley/repo-quality",
        version: "1.8.0",
      }),
    },
  });
  assert.deepEqual(valid, []);

  // Divergent root VERSION fails SVC1 because derived metadata cannot contradict contract authority
  const divergent = checkSemverChangelog({
    versionContent: "3.3.0\n",
    templateVersionContent: "3.2.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.2.0] - 2026-09-15\n",
  });
  assert.ok(
    divergent.some(
      (v) => v.rule === "SVC1" && v.message.includes("does not match primary contract authority TEMPLATE_VERSION"),
    ),
  );

  // Independent public package contract (repo-quality@1.8.0) is not forced to match root VERSION (3.2.0)
  const independentPackage = checkSemverChangelog({
    versionContent: "3.2.0\n",
    templateVersionContent: "3.2.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.2.0] - 2026-09-15\n",
    packageManifests: {
      "packages/repo-quality/package.json": JSON.stringify({
        name: "@spencer-shadley/repo-quality",
        version: "1.8.0",
      }),
    },
  });
  assert.equal(independentPackage.filter((v) => v.file.includes("packages/repo-quality")).length, 0);

  // Invalid SemVer in a package manifest is flagged under SVC1
  const invalidPackage = checkSemverChangelog({
    versionContent: "3.2.0\n",
    templateVersionContent: "3.2.0\n",
    changelogContent: "# Changelog\n\n## [Unreleased]\n\n## [3.2.0] - 2026-09-15\n",
    packageManifests: {
      "packages/repo-quality/package.json": JSON.stringify({
        name: "@spencer-shadley/repo-quality",
        version: "v1.8.0",
      }),
    },
  });
  assert.ok(
    invalidPackage.some(
      (v) => v.rule === "SVC1" && v.file.includes("packages/repo-quality") && v.message.includes("is not valid SemVer 2.0.0"),
    ),
  );
});

test("discoverPublicContracts discovers independent public contracts and tags derived metadata", () => {
  const rootDir = fileURLToPath(new URL("../../../", import.meta.url));
  const contracts = discoverPublicContracts(rootDir);

  const template = contracts.find((c) => c.name === "template");
  assert.ok(template);
  assert.equal(template.path, "TEMPLATE_VERSION");
  assert.equal(template.version, "3.3.0");
  assert.equal(template.isDerived, undefined);

  const derived = contracts.find((c) => c.name === "repository-derived");
  assert.ok(derived);
  assert.equal(derived.path, "VERSION");
  assert.equal(derived.version, "3.3.0");
  assert.equal(derived.isDerived, true);

  const repoQuality = contracts.find((c) => c.name === "@spencer-shadley/repo-quality");
  assert.ok(repoQuality);
  assert.equal(repoQuality.version, "1.8.0");
  assert.equal(repoQuality.isDerived, undefined);
});

