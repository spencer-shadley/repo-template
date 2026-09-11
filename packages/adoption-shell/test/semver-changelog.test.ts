import assert from "node:assert/strict";
import test from "node:test";

import {
  checkSemverChangelog,
  compareSemVer,
  parseSemVerNumbers,
  SEMVER_REGEX,
  ISO_WEEK_ARCHIVE_REGEX,
} from "../../../scripts/check-semver-changelog.ts";

import {
  getIsoWeek,
  getIsoWeekRange,
  parseChangelog,
  parseArchiveReleases,
  rotateChangelogWeekly,
} from "../../../scripts/rotate-changelog-weekly.ts";

test("SEMVER_REGEX validates strict SemVer 2.0.0", () => {
  assert.ok(SEMVER_REGEX.test("0.1.0"));
  assert.ok(SEMVER_REGEX.test("1.0.0"));
  assert.ok(SEMVER_REGEX.test("3.1.0"));
  assert.ok(SEMVER_REGEX.test("10.20.30"));
  assert.ok(SEMVER_REGEX.test("1.0.0-alpha.1"));
  assert.ok(SEMVER_REGEX.test("1.0.0+20260911"));
  assert.ok(SEMVER_REGEX.test("1.0.0-beta.2+exp.sha.5114f85"));

  assert.ok(!SEMVER_REGEX.test(""));
  assert.ok(!SEMVER_REGEX.test("v1.0.0"));
  assert.ok(!SEMVER_REGEX.test("1.0"));
  assert.ok(!SEMVER_REGEX.test("1"));
  assert.ok(!SEMVER_REGEX.test("1.0.0.0"));
  assert.ok(!SEMVER_REGEX.test("invalid"));
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

test("compareSemVer sorts versions correctly", () => {
  assert.ok(compareSemVer("2.0.0", "1.9.9") > 0);
  assert.ok(compareSemVer("1.2.0", "1.1.9") > 0);
  assert.ok(compareSemVer("1.0.1", "1.0.0") > 0);
  assert.equal(compareSemVer("3.1.0", "3.1.0"), 0);
  assert.ok(compareSemVer("0.9.0", "1.0.0") < 0);
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
