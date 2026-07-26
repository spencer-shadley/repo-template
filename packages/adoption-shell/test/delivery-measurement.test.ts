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

function readJson<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts", "adoption-shell-v2", "fixtures", name),
      "utf8",
    ),
  ) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("portable declaration binds all six SLIs without owning targets or aggregation", () => {
  const declaration = readJson<DeliveryDeclarationV1>("delivery-declaration.json");
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

test("append-only event captures tokens, outcome, SLO movement, and human attribution", () => {
  const event = readJson<DeliveryEventV1>("delivery-event.json");
  assert.equal(validateDeliveryEventV1(event).ok, true);
  assert.equal(event.tokenUsage[0]?.totalTokens, 15);
  assert.equal(event.outcome.meaningful, true);
  assert.equal(event.sloDeltas[0]?.verified, true);
  assert.equal(event.humanMessages[0]?.primaryWorkId, event.workId);
  assert.deepEqual(event.coverage, { complete: true, errors: [] });
});

test("activity proxies and receipts alone never qualify as meaningful delivery", () => {
  const event = clone(readJson<DeliveryEventV1>("delivery-event.json")) as unknown as {
    outcome: {
      meaningful: boolean;
      meaningfulClass: string | null;
      weight: number;
      qualifyingEvidence: unknown[];
    };
  };
  event.outcome.qualifyingEvidence = [];
  const result = validateDeliveryEventV1(event);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.diagnostics.some(
        (row) => row.code === "E_MEANINGFUL_QUALIFICATION",
      ),
    );
  }

  event.outcome.meaningful = false;
  event.outcome.meaningfulClass = null;
  event.outcome.weight = 0;
  assert.equal(validateDeliveryEventV1(event).ok, true);
});

test("coverage errors remain visible without blocking structurally valid source evidence", () => {
  const event = clone(readJson<DeliveryEventV1>("delivery-event.json")) as unknown as {
    coverage: {
      complete: boolean;
      errors: string[];
    };
  };
  event.coverage = {
    complete: false,
    errors: ["unattributed-token-usage"],
  };
  assert.equal(validateDeliveryEventV1(event).ok, true);
  event.coverage.complete = true;
  const inconsistent = validateDeliveryEventV1(event);
  assert.equal(inconsistent.ok, false);
  if (!inconsistent.ok) {
    assert.ok(inconsistent.diagnostics.some((row) => row.code === "E_COVERAGE"));
  }

  event.coverage.complete = false;
  event.coverage.errors = [];
  const omitted = validateDeliveryEventV1(event);
  assert.equal(omitted.ok, false);
  if (!omitted.ok) {
    assert.ok(omitted.diagnostics.some((row) => row.code === "E_COVERAGE"));
  }
});

test("declaration rejects incomplete SLI coverage and proxy drift", () => {
  const declaration = clone(
    readJson<DeliveryDeclarationV1>("delivery-declaration.json"),
  ) as unknown as {
    slis: unknown[];
    antiGamingExclusions: string[];
  };
  declaration.slis.pop();
  declaration.antiGamingExclusions.pop();
  const result = validateDeliveryDeclarationV1(declaration);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.diagnostics.some((row) => row.pointer === "/slis"));
    assert.ok(
      result.diagnostics.some(
        (row) => row.pointer === "/antiGamingExclusions",
      ),
    );
  }
});
