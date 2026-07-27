import { SCHEMA_DIGESTS, SCHEMA_IDS, } from "./contract.js";
import { DELIVERY_ANTI_GAMING_EXCLUSIONS, DELIVERY_COVERAGE_ERRORS, DELIVERY_COVERAGE_FIELDS, DELIVERY_EVIDENCE_KINDS, DELIVERY_MEASUREMENT_CONTRACT_ID, DELIVERY_SLI_IDS, DELIVERY_STAGES, } from "./delivery-measurement-contract.js";
import { bool, exactArray, finish, number, oneOf, ref, schemaIdentity, } from "./delivery-measurement-validation.js";
import { assertSortedUnique, Diagnostics, } from "./validation-helpers.js";
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
function validateTokenUsage(value, pointer, diagnostics) {
    const fields = [
        "attributionId",
        "stage",
        "provider",
        "model",
        "inputTokens",
        "outputTokens",
        "totalTokens",
    ];
    if (!diagnostics.object(value, pointer, fields, fields))
        return null;
    const id = ref(value["attributionId"], `${pointer}/attributionId`, diagnostics)
        ? value["attributionId"]
        : null;
    oneOf(value["stage"], `${pointer}/stage`, DELIVERY_STAGES, diagnostics);
    ref(value["provider"], `${pointer}/provider`, diagnostics);
    ref(value["model"], `${pointer}/model`, diagnostics);
    const inputValue = value["inputTokens"];
    const outputValue = value["outputTokens"];
    const totalValue = value["totalTokens"];
    const input = number(inputValue, `${pointer}/inputTokens`, diagnostics, true);
    const output = number(outputValue, `${pointer}/outputTokens`, diagnostics, true);
    const total = number(totalValue, `${pointer}/totalTokens`, diagnostics, true);
    for (const field of ["inputTokens", "outputTokens", "totalTokens"]) {
        if (typeof value[field] === "number" && value[field] < 0) {
            diagnostics.add("E_RANGE", `${pointer}/${field}`, "token count must be non-negative");
        }
    }
    if (input && output && total && totalValue !== inputValue + outputValue) {
        diagnostics.add("E_TOKEN_TOTAL", `${pointer}/totalTokens`, "must equal inputTokens + outputTokens");
    }
    return id;
}
function validateOutcome(value, pointer, diagnostics) {
    const fields = [
        "outcomeId",
        "status",
        "receiptRef",
        "meaningful",
        "meaningfulClass",
        "weight",
        "qualifyingEvidence",
        "activityRefs",
    ];
    if (!diagnostics.object(value, pointer, fields, fields))
        return;
    ref(value["outcomeId"], `${pointer}/outcomeId`, diagnostics);
    oneOf(value["status"], `${pointer}/status`, ["landed", "non-delivery"], diagnostics);
    ref(value["receiptRef"], `${pointer}/receiptRef`, diagnostics);
    const meaningfulValue = value["meaningful"];
    const statusValue = value["status"];
    const weightValue = value["weight"];
    const meaningful = bool(meaningfulValue, `${pointer}/meaningful`, diagnostics);
    const weight = number(weightValue, `${pointer}/weight`, diagnostics);
    if (weight && (weightValue < 0 || weightValue > 1000)) {
        diagnostics.add("E_RANGE", `${pointer}/weight`, "weight must be between 0 and 1000");
    }
    const meaningfulClass = value["meaningfulClass"];
    const classPresent = meaningfulClass === null
        ? false
        : ref(meaningfulClass, `${pointer}/meaningfulClass`, diagnostics);
    const evidenceCount = diagnostics.array(value["qualifyingEvidence"], `${pointer}/qualifyingEvidence`, 0, 16)
        ? value["qualifyingEvidence"].length
        : 0;
    if (Array.isArray(value["qualifyingEvidence"])) {
        value["qualifyingEvidence"].forEach((row, index) => {
            const rowPointer = `${pointer}/qualifyingEvidence/${index}`;
            if (diagnostics.object(row, rowPointer, ["kind", "verificationRef"], ["kind", "verificationRef"])) {
                oneOf(row["kind"], `${rowPointer}/kind`, DELIVERY_EVIDENCE_KINDS, diagnostics);
                ref(row["verificationRef"], `${rowPointer}/verificationRef`, diagnostics);
            }
        });
    }
    const activityRefs = value["activityRefs"];
    if (diagnostics.array(activityRefs, `${pointer}/activityRefs`, 0, 128)) {
        const refs = [];
        activityRefs.forEach((row, index) => {
            if (ref(row, `${pointer}/activityRefs/${index}`, diagnostics))
                refs.push(row);
        });
        assertSortedUnique(refs, `${pointer}/activityRefs`, diagnostics);
    }
    if (meaningful) {
        if (meaningfulValue) {
            if (statusValue !== "landed" ||
                !classPresent ||
                !weight ||
                weightValue <= 0 ||
                evidenceCount === 0) {
                diagnostics.add("E_MEANINGFUL_QUALIFICATION", pointer, "meaningful delivery requires landed status, class, positive weight, and qualifying evidence");
            }
        }
        else if (meaningfulClass !== null ||
            weightValue !== 0 ||
            evidenceCount !== 0) {
            diagnostics.add("E_MEANINGFUL_QUALIFICATION", pointer, "non-meaningful outcome requires null class, zero weight, and no qualifying evidence");
        }
    }
}
function validateSloDelta(value, pointer, diagnostics) {
    const fields = ["sloRef", "measuredDelta", "verified", "verificationRef"];
    if (!diagnostics.object(value, pointer, fields, fields))
        return null;
    const id = ref(value["sloRef"], `${pointer}/sloRef`, diagnostics)
        ? value["sloRef"]
        : null;
    number(value["measuredDelta"], `${pointer}/measuredDelta`, diagnostics);
    if (bool(value["verified"], `${pointer}/verified`, diagnostics)) {
        if (value["verified"]) {
            ref(value["verificationRef"], `${pointer}/verificationRef`, diagnostics);
        }
        else if (value["verificationRef"] !== null) {
            diagnostics.add("E_CONST", `${pointer}/verificationRef`, "unverified delta requires null");
        }
    }
    return id;
}
function validateHumanMessage(value, pointer, workId, diagnostics) {
    const fields = ["messageId", "kind", "primaryWorkId", "relatedRefs"];
    if (!diagnostics.object(value, pointer, fields, fields))
        return null;
    const id = ref(value["messageId"], `${pointer}/messageId`, diagnostics)
        ? value["messageId"]
        : null;
    oneOf(value["kind"], `${pointer}/kind`, ["approve", "correct", "decide", "unblock"], diagnostics);
    if (ref(value["primaryWorkId"], `${pointer}/primaryWorkId`, diagnostics) &&
        value["primaryWorkId"] !== workId) {
        diagnostics.add("E_PRIMARY_ATTRIBUTION", `${pointer}/primaryWorkId`, "must equal the event workId");
    }
    if (diagnostics.array(value["relatedRefs"], `${pointer}/relatedRefs`, 0, 128)) {
        const refs = [];
        value["relatedRefs"].forEach((row, index) => {
            if (ref(row, `${pointer}/relatedRefs/${index}`, diagnostics))
                refs.push(row);
        });
        assertSortedUnique(refs, `${pointer}/relatedRefs`, diagnostics);
    }
    return id;
}
export function validateDeliveryEventV1(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "schemaId", "schemaVersion", "schemaDigest", "contractId", "eventKind",
        "eventId", "workId", "repoRef", "planeRef", "fleetRef", "recordedAt",
        "tokenUsage", "outcome", "sloDeltas", "humanMessages", "coverage",
    ];
    if (!diagnostics.object(value, "", fields, fields)) {
        return finish(value, diagnostics);
    }
    schemaIdentity(value, SCHEMA_IDS.deliveryEvent, SCHEMA_DIGESTS.deliveryEvent, diagnostics);
    diagnostics.string(value["eventKind"], "/eventKind", {
        constant: "repo-template/delivery-event/v1",
    });
    for (const field of ["eventId", "workId", "repoRef", "planeRef", "fleetRef"]) {
        ref(value[field], `/${field}`, diagnostics);
    }
    if (diagnostics.string(value["recordedAt"], "/recordedAt", { max: 35 }) &&
        !UTC_INSTANT.test(value["recordedAt"])) {
        diagnostics.add("E_FORMAT", "/recordedAt", "must be a UTC RFC 3339 instant");
    }
    if (diagnostics.array(value["tokenUsage"], "/tokenUsage", 0, 128)) {
        const ids = [];
        value["tokenUsage"].forEach((row, index) => {
            const id = validateTokenUsage(row, `/tokenUsage/${index}`, diagnostics);
            if (id !== null)
                ids.push(id);
        });
        assertSortedUnique(ids, "/tokenUsage", diagnostics);
    }
    validateOutcome(value["outcome"], "/outcome", diagnostics);
    if (diagnostics.array(value["sloDeltas"], "/sloDeltas", 0, 128)) {
        const ids = [];
        value["sloDeltas"].forEach((row, index) => {
            const id = validateSloDelta(row, `/sloDeltas/${index}`, diagnostics);
            if (id !== null)
                ids.push(id);
        });
        assertSortedUnique(ids, "/sloDeltas", diagnostics);
    }
    if (diagnostics.array(value["humanMessages"], "/humanMessages", 0, 128)) {
        const ids = [];
        value["humanMessages"].forEach((row, index) => {
            const id = validateHumanMessage(row, `/humanMessages/${index}`, value["workId"], diagnostics);
            if (id !== null)
                ids.push(id);
        });
        assertSortedUnique(ids, "/humanMessages", diagnostics);
    }
    if (diagnostics.object(value["coverage"], "/coverage", ["complete", "errors"], ["complete", "errors"])) {
        const complete = bool(value["coverage"]["complete"], "/coverage/complete", diagnostics);
        if (diagnostics.array(value["coverage"]["errors"], "/coverage/errors", 0, 32)) {
            const errors = [];
            value["coverage"]["errors"].forEach((row, index) => {
                if (oneOf(row, `/coverage/errors/${index}`, DELIVERY_COVERAGE_ERRORS, diagnostics)) {
                    errors.push(row);
                }
            });
            assertSortedUnique(errors, "/coverage/errors", diagnostics);
            if (complete && value["coverage"]["complete"] !== (errors.length === 0)) {
                diagnostics.add("E_COVERAGE", "/coverage", "complete must be true exactly when coverage errors are empty");
            }
        }
    }
    return finish(value, diagnostics);
}
function validateClass(value, pointer, diagnostics) {
    const fields = ["classId", "description", "evidenceKinds", "aggregationMode", "weight"];
    if (!diagnostics.object(value, pointer, fields, fields))
        return null;
    const id = ref(value["classId"], `${pointer}/classId`, diagnostics)
        ? value["classId"]
        : null;
    diagnostics.string(value["description"], `${pointer}/description`, { min: 1, max: 500 });
    if (diagnostics.array(value["evidenceKinds"], `${pointer}/evidenceKinds`, 1, 4)) {
        const kinds = [];
        value["evidenceKinds"].forEach((row, index) => {
            if (oneOf(row, `${pointer}/evidenceKinds/${index}`, DELIVERY_EVIDENCE_KINDS, diagnostics)) {
                kinds.push(row);
            }
        });
        assertSortedUnique(kinds, `${pointer}/evidenceKinds`, diagnostics);
    }
    const mode = oneOf(value["aggregationMode"], `${pointer}/aggregationMode`, ["segmented", "weighted"], diagnostics);
    if (mode && value["aggregationMode"] === "weighted") {
        if (!number(value["weight"], `${pointer}/weight`, diagnostics) ||
            value["weight"] <= 0 ||
            value["weight"] > 1000) {
            diagnostics.add("E_RANGE", `${pointer}/weight`, "weighted class requires a weight greater than 0 and at most 1000");
        }
    }
    else if (mode && value["weight"] !== null) {
        diagnostics.add("E_CONST", `${pointer}/weight`, "segmented class requires null weight");
    }
    return id;
}
export function validateDeliveryDeclarationV1(value) {
    const diagnostics = new Diagnostics();
    const fields = [
        "schemaId", "schemaVersion", "schemaDigest", "contractId", "declarationKind",
        "classificationGeneration", "repoBinding", "meaningfulClasses",
        "antiGamingExclusions", "tokenAttribution", "slis", "eventCapture",
    ];
    if (!diagnostics.object(value, "", fields, fields)) {
        return finish(value, diagnostics);
    }
    schemaIdentity(value, SCHEMA_IDS.deliveryDeclaration, SCHEMA_DIGESTS.deliveryDeclaration, diagnostics);
    diagnostics.string(value["declarationKind"], "/declarationKind", {
        constant: "repo-template/delivery-declaration/v1",
    });
    ref(value["classificationGeneration"], "/classificationGeneration", diagnostics);
    if (diagnostics.object(value["repoBinding"], "/repoBinding", ["repoRef", "planeRef", "fleetRef", "registryGeneration", "registryDigest", "centralRollupRef"], ["repoRef", "planeRef", "fleetRef", "registryGeneration", "registryDigest", "centralRollupRef"])) {
        for (const field of ["repoRef", "planeRef", "fleetRef", "registryGeneration", "centralRollupRef"]) {
            ref(value["repoBinding"][field], `/repoBinding/${field}`, diagnostics);
        }
        diagnostics.sha(value["repoBinding"]["registryDigest"], "/repoBinding/registryDigest");
    }
    if (diagnostics.array(value["meaningfulClasses"], "/meaningfulClasses", 1, 128)) {
        const ids = [];
        value["meaningfulClasses"].forEach((row, index) => {
            const id = validateClass(row, `/meaningfulClasses/${index}`, diagnostics);
            if (id !== null)
                ids.push(id);
        });
        assertSortedUnique(ids, "/meaningfulClasses", diagnostics);
    }
    exactArray(value["antiGamingExclusions"], "/antiGamingExclusions", DELIVERY_ANTI_GAMING_EXCLUSIONS, diagnostics);
    if (diagnostics.object(value["tokenAttribution"], "/tokenAttribution", ["stages", "requireComplete", "unattributedPolicy"], ["stages", "requireComplete", "unattributedPolicy"])) {
        exactArray(value["tokenAttribution"]["stages"], "/tokenAttribution/stages", DELIVERY_STAGES, diagnostics);
        if (value["tokenAttribution"]["requireComplete"] !== true) {
            diagnostics.add("E_CONST", "/tokenAttribution/requireComplete", "must be true");
        }
        diagnostics.string(value["tokenAttribution"]["unattributedPolicy"], "/tokenAttribution/unattributedPolicy", { constant: "visible-coverage-error-in-totals" });
    }
    if (diagnostics.array(value["slis"], "/slis", 6, 6)) {
        const ids = [];
        value["slis"].forEach((row, index) => {
            const pointer = `/slis/${index}`;
            const sliFields = [
                "id", "scopes", "targetRef", "budgetRef", "windowRef",
                "exceptionPolicyRef", "revisitTrigger", "centralRollupRef",
            ];
            if (!diagnostics.object(row, pointer, sliFields, sliFields))
                return;
            if (oneOf(row["id"], `${pointer}/id`, DELIVERY_SLI_IDS, diagnostics))
                ids.push(row["id"]);
            exactArray(row["scopes"], `${pointer}/scopes`, ["fleet", "plane", "repo"], diagnostics);
            for (const field of ["targetRef", "budgetRef", "windowRef", "exceptionPolicyRef", "centralRollupRef"]) {
                ref(row[field], `${pointer}/${field}`, diagnostics);
            }
            diagnostics.string(row["revisitTrigger"], `${pointer}/revisitTrigger`, { min: 1, max: 500 });
        });
        assertSortedUnique(ids, "/slis", diagnostics);
        if (ids.some((row, index) => row !== DELIVERY_SLI_IDS[index])) {
            diagnostics.add("E_COVERAGE", "/slis", "all six SLI identities are required exactly once");
        }
    }
    if (diagnostics.object(value["eventCapture"], "/eventCapture", ["appendOnly", "eventKind", "coverageErrorPolicy", "requiredCoverage"], ["appendOnly", "eventKind", "coverageErrorPolicy", "requiredCoverage"])) {
        if (value["eventCapture"]["appendOnly"] !== true) {
            diagnostics.add("E_CONST", "/eventCapture/appendOnly", "must be true");
        }
        diagnostics.string(value["eventCapture"]["eventKind"], "/eventCapture/eventKind", {
            constant: "repo-template/delivery-event/v1",
        });
        diagnostics.string(value["eventCapture"]["coverageErrorPolicy"], "/eventCapture/coverageErrorPolicy", { constant: "visible-non-blocking" });
        exactArray(value["eventCapture"]["requiredCoverage"], "/eventCapture/requiredCoverage", DELIVERY_COVERAGE_FIELDS, diagnostics);
    }
    return finish(value, diagnostics);
}
