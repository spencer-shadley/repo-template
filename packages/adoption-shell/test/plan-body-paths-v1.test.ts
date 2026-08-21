import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import type { FormatsPlugin } from "ajv-formats";

import { canonicalizeJson } from "../src/canonical-json.ts";
import { sha256Bytes } from "../src/digest.ts";
import { validatePlanRecordV1 } from "../src/plan-record-v1.ts";
import {
  archiveAggregateSha256V1,
  createWorkMigrationManifestV1,
  validateWorkMigrationManifestV1,
} from "../src/work-migration-manifest-v1.ts";

const contract = (name: string): URL =>
  new URL(`../../../contracts/plan-record/v1/${name}`, import.meta.url);
const parse = (name: string): unknown =>
  JSON.parse(fs.readFileSync(contract(name), "utf8")) as unknown;

const planExample = parse("plan-record.example.json") as Record<string, unknown>;
const manifestExample = parse("work-migration-manifest.example.json") as Record<string, unknown>;
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;
const ajv = new Ajv2020({ allErrors: true, strictSchema: true, strictTypes: false });
addFormats(ajv);
const validatePlanSchema = ajv.compile(parse("plan-record.schema.json") as AnySchema);
const validateManifestSchema = ajv.compile(
  parse("work-migration-manifest.schema.json") as AnySchema,
);
const encoder = new TextEncoder();

function manifestBody(): Record<string, unknown> {
  const value = structuredClone(manifestExample);
  delete value["manifestSha256"];
  return value;
}

function signed(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    manifestSha256: sha256Bytes(encoder.encode(canonicalizeJson(body))),
  };
}

function livePathCandidate(path: string): Record<string, unknown> {
  const body = manifestBody();
  const decisions = body["decisions"] as Record<string, unknown>[];
  decisions[0]!["path"] = path;
  body["changedPaths"] = [path];
  return body;
}

function archivePathCandidate(path: string): Record<string, unknown> {
  const body = manifestBody();
  const archive = body["archive"] as Record<string, unknown>;
  const members = archive["members"] as { path: string; blobSha256: string }[];
  members[0] = { ...members[0]!, path };
  members.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const aggregate = archiveAggregateSha256V1(members);
  archive["aggregateSha256"] = aggregate;
  const dispositions = archive["dispositions"] as Record<string, unknown>[];
  dispositions[0]!["aggregateSha256"] = aggregate;
  return body;
}

void test("canonical live plan bodies reject indexes, empty names, and sidecars", () => {
  const invalid = [
    "plans/QUEUE.md",
    "plans/README.md",
    "plans/.md",
    "plans/001-.md",
    "plans/001.log.md",
    "plans/001.result.md",
    "plans/001.critic.md",
    "plans/001.feedback.md",
    "plans/001.deadletter.json",
    "plans/001-drain.log.md",
    "plans/001-drain.deadletter.md",
  ];
  for (const path of invalid) {
    const record = { ...planExample, sourcePath: path };
    assert.equal(validatePlanRecordV1(record), false, `${path}: PlanRecord runtime`);
    assert.equal(validatePlanSchema(record), false, `${path}: PlanRecord schema`);
    const body = livePathCandidate(path);
    assert.throws(() => createWorkMigrationManifestV1(body as never), /input is invalid/, path);
    assert.equal(validateWorkMigrationManifestV1(signed(body)), false, `${path}: manifest runtime`);
    assert.equal(validateManifestSchema(signed(body)), false, `${path}: manifest schema`);
  }
});

void test("canonical archive plan bodies reject indexes, empty names, and sidecars", () => {
  const invalid = [
    "plans/archive/README.md",
    "plans/archive/.md",
    "plans/archive/001-.md",
    "plans/archive/001.log.md",
    "plans/archive/001.result.md",
    "plans/archive/001.critic.md",
    "plans/archive/001.feedback.md",
    "plans/archive/001.deadletter.json",
    "plans/archive/001-drain.result.md",
    "plans/archive/001-drain.deadletter.md",
  ];
  for (const path of invalid) {
    const body = archivePathCandidate(path);
    assert.throws(() => createWorkMigrationManifestV1(body as never), /input is invalid/, path);
    assert.equal(validateWorkMigrationManifestV1(signed(body)), false, `${path}: runtime`);
    assert.equal(validateManifestSchema(signed(body)), false, `${path}: schema`);
  }
});

void test("canonical plan bodies preserve version and incident slug shapes", () => {
  for (const path of [
    "plans/004-adopt-repo-template-v2.2.0-overlay-migration.md",
    "plans/294-_incident-manager-timeout-plan.md",
  ]) {
    const record = { ...planExample, sourcePath: path };
    assert.equal(validatePlanRecordV1(record), true, `${path}: runtime`);
    assert.equal(validatePlanSchema(record), true, `${path}: schema`);
    const manifest = createWorkMigrationManifestV1(livePathCandidate(path) as never);
    assert.equal(validateWorkMigrationManifestV1(manifest), true);
    assert.equal(validateManifestSchema(manifest), true);
  }
  for (const path of [
    "plans/archive/004-adopt-repo-template-v2.2.0-overlay-migration.md",
    "plans/archive/294-_incident-manager-timeout-plan.md",
  ]) {
    const manifest = createWorkMigrationManifestV1(archivePathCandidate(path) as never);
    assert.equal(validateWorkMigrationManifestV1(manifest), true);
    assert.equal(validateManifestSchema(manifest), true);
  }
});
