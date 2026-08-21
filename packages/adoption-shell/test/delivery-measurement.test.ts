import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DELIVERY_ANTI_GAMING_EXCLUSIONS,
  DELIVERY_COVERAGE_FIELDS,
  DELIVERY_SLI_IDS,
  DELIVERY_STAGES,
  validateDeliveryDeclarationV1,
  validateDeliveryEventV1,
  type DeliveryDeclarationV1,
  type DeliveryEventV1,
} from "../../../artifacts/adoption-shell-v2/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson(name: string): unknown {
  const value: unknown = JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "adoption-shell-v2", "fixtures", name),
      "utf8",
    ),
  );
  return value;
}

function readDeclaration(name: string): DeliveryDeclarationV1 {
  const result = validateDeliveryDeclarationV1(readJson(name));
  if (!result.ok) throw new Error("fixture must be a delivery declaration");
  return result.value;
}

function readEvent(name: string): DeliveryEventV1 {
  const result = validateDeliveryEventV1(readJson(name));
  if (!result.ok) throw new Error("fixture must be a delivery event");
  return result.value;
}

function asRecord(value: unknown): Record<string, unknown> {
  const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
    candidate !== null && typeof candidate === "object" && !Array.isArray(candidate);
  assert.ok(isRecord(value));
  return value;
}

void test("portable declaration binds all six SLIs without owning targets or aggregation", () => {
  const declaration = readDeclaration("delivery-declaration.json");
  assert.equal(validateDeliveryDeclarationV1(declaration).ok, true);
  assert.deepEqual(
    declaration.slis.map((row) => row.id),
    DELIVERY_SLI_IDS,
  );
  assert.deepEqual(declaration.antiGamingExclusions, DELIVERY_ANTI_GAMING_EXCLUSIONS);
  assert.deepEqual(declaration.tokenAttribution.stages, DELIVERY_STAGES);
  assert.deepEqual(declaration.eventCapture.requiredCoverage, DELIVERY_COVERAGE_FIELDS);
  assert.ok(
    declaration.slis.every(
      (row) =>
        row.targetRef.startsWith("registry:") &&
        row.centralRollupRef.startsWith("observatory:"),
    ),
  );
  assert.equal("aggregate" in declaration, false);
  assert.equal("targetValue" in declaration, false);
});

void test("append-only event captures tokens, outcome, SLO movement, and human attribution", () => {
  const event = readEvent("delivery-event.json");
  assert.equal(validateDeliveryEventV1(event).ok, true);
  assert.equal(event.tokenUsage[0]?.totalTokens, 15);
  assert.equal(event.outcome.meaningful, true);
  assert.equal(event.sloDeltas[0]?.verified, true);
  assert.equal(event.humanMessages[0]?.primaryWorkId, event.workId);
  assert.deepEqual(event.coverage, { complete: true, errors: [] });
});

void test("activity proxies and receipts alone never qualify as meaningful delivery", () => {
  const event = structuredClone(readJson("delivery-event.json"));
  const outcome = asRecord(asRecord(event)["outcome"]);
  outcome["qualifyingEvidence"] = [];
  const result = validateDeliveryEventV1(event);
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      (row) => row.code === "E_MEANINGFUL_QUALIFICATION",
    ),
  );

  outcome["meaningful"] = false;
  outcome["meaningfulClass"] = null;
  outcome["weight"] = 0;
  assert.equal(validateDeliveryEventV1(event).ok, true);
});

void test("coverage errors remain visible without blocking structurally valid source evidence", () => {
  const event = structuredClone(readJson("delivery-event.json"));
  const eventRecord = asRecord(event);
  eventRecord["coverage"] = {
    complete: false,
    errors: ["unattributed-token-usage"],
  };
  assert.equal(validateDeliveryEventV1(event).ok, true);
  asRecord(eventRecord["coverage"])["complete"] = true;
  const inconsistent = validateDeliveryEventV1(event);
  assert.equal(inconsistent.ok, false);
  assert.ok(inconsistent.diagnostics.some((row) => row.code === "E_COVERAGE"));

  asRecord(eventRecord["coverage"])["complete"] = false;
  asRecord(eventRecord["coverage"])["errors"] = [];
  const omitted = validateDeliveryEventV1(event);
  assert.equal(omitted.ok, false);
  assert.ok(omitted.diagnostics.some((row) => row.code === "E_COVERAGE"));
});

void test("declaration rejects a weighted class exceeding the schema's maximum weight", () => {
  const declaration = asRecord(structuredClone(readJson("delivery-declaration.json")));
  const meaningfulClasses = declaration["meaningfulClasses"];
  if (!Array.isArray(meaningfulClasses) || meaningfulClasses.length === 0) {
    throw new Error("fixture must declare at least one meaningful class");
  }
  const declaredClass = asRecord(meaningfulClasses[0]);
  declaredClass["aggregationMode"] = "weighted";
  declaredClass["weight"] = 1000;
  assert.equal(validateDeliveryDeclarationV1(declaration).ok, true);

  declaredClass["weight"] = 1000.01;
  const result = validateDeliveryDeclarationV1(declaration);
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      (row) =>
        row.pointer === "/meaningfulClasses/0/weight" && row.code === "E_RANGE",
    ),
  );
});

void test("declaration rejects incomplete SLI coverage and proxy drift", () => {
  const declaration = asRecord(structuredClone(readJson("delivery-declaration.json")));
  const slis = declaration["slis"];
  const exclusions = declaration["antiGamingExclusions"];
  assert.ok(Array.isArray(slis));
  assert.ok(Array.isArray(exclusions));
  slis.pop();
  exclusions.pop();
  const result = validateDeliveryDeclarationV1(declaration);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((row) => row.pointer === "/slis"));
  assert.ok(
    result.diagnostics.some(
      (row) => row.pointer === "/antiGamingExclusions",
    ),
  );
});
