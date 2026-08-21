import { CONTRACT_VERSION, } from "./contract.js";
import { DELIVERY_MEASUREMENT_CONTRACT_ID, } from "./delivery-measurement-contract.js";
import { assertSortedUnique, Diagnostics, } from "./validation-helpers.js";
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
export function finish(value, diagnostics) {
    const rows = diagnostics.sorted();
    return rows.length === 0 ? { ok: true, value } : { ok: false, diagnostics: rows };
}
export function ref(value, pointer, diagnostics) {
    return diagnostics.string(value, pointer, {
        min: 1,
        max: 160,
        pattern: REF_PATTERN,
    });
}
export function oneOf(value, pointer, allowed, diagnostics) {
    if (!diagnostics.string(value, pointer))
        return false;
    if (!allowed.includes(value)) {
        diagnostics.add("E_ENUM", pointer, "unsupported value");
        return false;
    }
    return true;
}
export function bool(value, pointer, diagnostics) {
    if (typeof value === "boolean")
        return true;
    diagnostics.add("E_TYPE", pointer, "expected boolean");
    return false;
}
export function number(value, pointer, diagnostics, integer = false) {
    if (typeof value !== "number" ||
        !Number.isFinite(value) ||
        (integer && !Number.isSafeInteger(value))) {
        diagnostics.add("E_TYPE", pointer, integer ? "expected safe integer" : "expected finite number");
        return false;
    }
    return true;
}
export function exactArray(value, pointer, expected, diagnostics) {
    if (!diagnostics.array(value, pointer, expected.length, expected.length))
        return;
    for (const [index, row] of value.entries())
        oneOf(row, `${pointer}/${index}`, expected, diagnostics);
    if (value.every((row) => typeof row === "string")) {
        const actual = value;
        assertSortedUnique(actual, pointer, diagnostics);
        if (actual.some((row, index) => row !== expected[index])) {
            diagnostics.add("E_COVERAGE", pointer, "required closed set does not match");
        }
    }
}
export function schemaIdentity(value, id, digest, diagnostics) {
    diagnostics.string(value["schemaId"], "/schemaId", { constant: id });
    diagnostics.string(value["schemaVersion"], "/schemaVersion", {
        constant: CONTRACT_VERSION,
    });
    if (diagnostics.sha(value["schemaDigest"], "/schemaDigest") &&
        value["schemaDigest"] !== digest) {
        diagnostics.add("E_SCHEMA_DIGEST", "/schemaDigest", "schema digest mismatch");
    }
    diagnostics.string(value["contractId"], "/contractId", {
        constant: DELIVERY_MEASUREMENT_CONTRACT_ID,
    });
}
