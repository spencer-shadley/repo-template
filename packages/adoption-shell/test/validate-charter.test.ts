import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCharter } from "../src/validate-charter.ts";

void describe("validateCharter", () => {
  const templateSource = `
# Some Repo - Agent Rules

## Mission

{{ONE_LINE_DESCRIPTION}} <!-- TODO(setup!): one durable outcome, stated without implementation or model identity. -->

## Responsibilities

{{RESPONSIBILITIES}} <!-- TODO(setup!): what this repo owns; one short paragraph or 2-4 bullets. -->

## Non-responsibilities

{{NON_GOALS}} <!-- TODO(setup!): adjacent authority this repo must not absorb. -->

## Current status / readiness

<!-- TODO(setup!): point to the current evidence that establishes commissioning/readiness. Durable
responsibility is not a claim that implementation is complete. -->

[PRIORITIES.md](./PRIORITIES.md)
  `;

  const materialized = `
# Some Repo - Agent Rules

## Mission

We build the thing.

## Responsibilities

- Code things
- Deploy things

## Non-responsibilities

- HR things

## Current status / readiness

Everything is great.

[PRIORITIES.md](./PRIORITIES.md)
  `;

  void it("accepts valid template source", () => {
    const result = validateCharter(templateSource, "template-source");
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });

  void it("rejects materialized content in template-source mode", () => {
    const result = validateCharter(materialized, "template-source");
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("missing {{ONE_LINE_DESCRIPTION}}")));
    assert.ok(result.errors.some(e => e.includes("missing setup TODO")));
  });

  void it("accepts valid materialized repository", () => {
    const result = validateCharter(materialized, "materialized-repository");
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });

  void it("rejects placeholders in materialized-repository mode", () => {
    const result = validateCharter(templateSource, "materialized-repository");
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("rejected setup placeholder")));
    assert.ok(result.errors.some(e => e.includes("rejected setup TODO")));
  });

  void it("rejects empty sections in materialized mode", () => {
    const empty = `
## Mission

## Responsibilities

## Non-responsibilities

## Current status / readiness

[PRIORITIES.md](./PRIORITIES.md)
`;
    const result = validateCharter(empty, "materialized-repository");
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("empty concrete prose")));
  });
});
