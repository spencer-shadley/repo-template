import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Standard SemVer 2.0.0 regex pattern
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?\s*$/;

// ISO week archive filename regex pattern (e.g. 2026-W30.md)
const ISO_WEEK_ARCHIVE_REGEX = /^\d{4}-W\d{2}\.md$/;

export function validateSemverChangelog(customRoot = root) {
  const errors = [];

  // 1. Validate VERSION file
  const versionPath = path.join(customRoot, "VERSION");
  if (!fs.existsSync(versionPath)) {
    errors.push("Missing VERSION file at repository root");
  } else {
    const rawVersion = fs.readFileSync(versionPath, "utf8").trim();
    if (!rawVersion) {
      errors.push("VERSION file is empty");
    } else if (!SEMVER_REGEX.test(rawVersion)) {
      errors.push(`VERSION file content "${rawVersion}" is not valid SemVer 2.0.0`);
    }
  }

  // 2. Validate CHANGELOG.md file
  const changelogPath = path.join(customRoot, "CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) {
    errors.push("Missing CHANGELOG.md file at repository root");
  } else {
    const rawChangelog = fs.readFileSync(changelogPath, "utf8");
    if (!/##\s*\[Unreleased\]/i.test(rawChangelog)) {
      errors.push("CHANGELOG.md missing required '## [Unreleased]' section");
    }
  }

  // 3. Validate weekly archive directory if present
  const archiveDir = path.join(customRoot, "docs", "changelogs");
  if (fs.existsSync(archiveDir)) {
    const entries = fs.readdirSync(archiveDir);
    for (const entry of entries) {
      if (entry === ".gitkeep") continue;
      if (!ISO_WEEK_ARCHIVE_REGEX.test(entry)) {
        errors.push(
          `Archived changelog file "${entry}" in docs/changelogs/ does not match ISO week format YYYY-Www.md`
        );
      }
    }
  }

  return errors;
}

export function selfTest() {
  const selfErrors = [];
  // Prove self-test catches invalid SemVer
  if (SEMVER_REGEX.test("invalid.version.number")) {
    selfErrors.push("self-test failed: invalid version passed regex");
  }
  if (!SEMVER_REGEX.test("1.0.0-alpha.1+20260727")) {
    selfErrors.push("self-test failed: valid SemVer failed regex");
  }
  if (!ISO_WEEK_ARCHIVE_REGEX.test("2026-W30.md")) {
    selfErrors.push("self-test failed: valid ISO week archive filename failed regex");
  }
  if (ISO_WEEK_ARCHIVE_REGEX.test("invalid-changelog.md")) {
    selfErrors.push("self-test failed: invalid archive filename passed regex");
  }
  return selfErrors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (process.argv.includes("--self-test")) {
    const selfTestResults = selfTest();
    if (selfTestResults.length > 0) {
      console.error("semver-changelog-lint self-test failed:", selfTestResults);
      process.exitCode = 1;
    } else {
      console.log("semver-changelog-lint: self-test passed");
    }
  } else {
    const errors = validateSemverChangelog();
    if (errors.length > 0) {
      console.error("semver-changelog-lint errors found:", errors);
      process.exitCode = 1;
    } else {
      console.log("semver-changelog-lint: VERSION, CHANGELOG.md, and weekly archive paths valid");
    }
  }
}
