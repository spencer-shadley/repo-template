import { ENVELOPE_DIGEST_ALGORITHM, } from "./contract.js";
import { sha256Bytes, sha256CanonicalJson } from "./digest.js";
import { compareStrings } from "./validation-helpers.js";
import { COMPONENT_REGISTRY_OVERLAY_FILE, COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID, PRODUCT_OVERLAY_BUNDLE_ID, PRODUCT_OVERLAY_BUNDLE_VERSION, PRODUCT_OVERLAY_CONTRACT_ID, PRODUCT_OVERLAY_FILE, PRODUCT_OVERLAY_SCHEMA_ID, PRODUCT_OVERLAY_SCHEMA_VERSION, TECHNOLOGY_REGISTRY_OVERLAY_FILE, TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID, defaultComponentsForProfile, defaultPlatformsForProfile, defaultProvenance, defaultTechnologiesForProfile, } from "./product-overlay-contract.js";
import { toDeterministicYaml } from "./product-overlay-yaml.js";
import { validateComponentRegistryOverlay, validateProductOverlay, validateTechnologyRegistryOverlay, } from "./product-overlay-validation.js";
export * from "./product-overlay-contract.js";
export * from "./product-overlay-yaml.js";
export * from "./product-overlay-validation.js";
export function createProductOverlayContent(profile, options) {
    const prov = options?.provenance ?? defaultProvenance();
    const platforms = options?.platforms ?? defaultPlatformsForProfile(profile.profileId);
    const body = {
        $schema: PRODUCT_OVERLAY_SCHEMA_ID,
        schemaId: PRODUCT_OVERLAY_SCHEMA_ID,
        schemaVersion: PRODUCT_OVERLAY_SCHEMA_VERSION,
        contractId: PRODUCT_OVERLAY_CONTRACT_ID,
        bootstrappedFromGuideVersion: prov.bootstrappedFromGuideVersion ?? prov.templateRelease,
        lastAuditedAgainstGuideVersion: prov.lastAuditedAgainstGuideVersion ?? prov.templateRelease,
        provenance: {
            contractId: prov.contractId ?? PRODUCT_OVERLAY_CONTRACT_ID,
            templateRelease: prov.templateRelease,
            ...(prov.templateDigest ? { templateDigest: prov.templateDigest } : {}),
            ...(prov.templateCommit ? { templateCommit: prov.templateCommit } : {}),
        },
        platforms,
        ...(options?.grandfatheredDivergences
            ? { grandfatheredDivergences: options.grandfatheredDivergences }
            : {}),
    };
    const yaml = toDeterministicYaml(body);
    const validation = validateProductOverlay(yaml);
    if (!validation.ok) {
        const msgs = validation.diagnostics.map((d) => `${d.pointer}: ${d.message} (${d.code})`).join("; ");
        throw new Error(`Failed to generate valid product overlay: ${msgs}`);
    }
    return yaml;
}
export function createTechnologyRegistryOverlayContent(profile, options) {
    const prov = options?.provenance ?? defaultProvenance();
    const technologies = options?.technologies ?? defaultTechnologiesForProfile(profile.profileId);
    const body = {
        $schema: TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID,
        schemaId: TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID,
        schemaVersion: PRODUCT_OVERLAY_SCHEMA_VERSION,
        contractId: PRODUCT_OVERLAY_CONTRACT_ID,
        registryKind: "technology",
        bootstrappedFromGuideVersion: prov.bootstrappedFromGuideVersion ?? prov.templateRelease,
        lastAuditedAgainstGuideVersion: prov.lastAuditedAgainstGuideVersion ?? prov.templateRelease,
        provenance: {
            contractId: prov.contractId ?? PRODUCT_OVERLAY_CONTRACT_ID,
            templateRelease: prov.templateRelease,
            ...(prov.templateDigest ? { templateDigest: prov.templateDigest } : {}),
            ...(prov.templateCommit ? { templateCommit: prov.templateCommit } : {}),
        },
        technologies,
    };
    const yaml = toDeterministicYaml(body);
    const validation = validateTechnologyRegistryOverlay(yaml);
    if (!validation.ok) {
        const msgs = validation.diagnostics.map((d) => `${d.pointer}: ${d.message} (${d.code})`).join("; ");
        throw new Error(`Failed to generate valid technology registry overlay: ${msgs}`);
    }
    return yaml;
}
export function createComponentRegistryOverlayContent(profile, options) {
    const prov = options?.provenance ?? defaultProvenance();
    const components = options?.components ?? defaultComponentsForProfile(profile.profileId);
    const body = {
        $schema: COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID,
        schemaId: COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID,
        schemaVersion: PRODUCT_OVERLAY_SCHEMA_VERSION,
        contractId: PRODUCT_OVERLAY_CONTRACT_ID,
        registryKind: "component",
        bootstrappedFromGuideVersion: prov.bootstrappedFromGuideVersion ?? prov.templateRelease,
        lastAuditedAgainstGuideVersion: prov.lastAuditedAgainstGuideVersion ?? prov.templateRelease,
        provenance: {
            contractId: prov.contractId ?? PRODUCT_OVERLAY_CONTRACT_ID,
            templateRelease: prov.templateRelease,
            ...(prov.templateDigest ? { templateDigest: prov.templateDigest } : {}),
            ...(prov.templateCommit ? { templateCommit: prov.templateCommit } : {}),
        },
        components,
    };
    const yaml = toDeterministicYaml(body);
    const validation = validateComponentRegistryOverlay(yaml);
    if (!validation.ok) {
        const msgs = validation.diagnostics.map((d) => `${d.pointer}: ${d.message} (${d.code})`).join("; ");
        throw new Error(`Failed to generate valid component registry overlay: ${msgs}`);
    }
    return yaml;
}
function makePayloadEntry(portablePath, content, bundleId) {
    const bytes = Buffer.from(content, "utf8");
    return Object.freeze({
        path: portablePath,
        kind: "file",
        mode: "100644",
        contentSha256: sha256Bytes(bytes),
        role: "capability-config",
        encoding: "utf-8",
        bundleId,
        contentBase64: Buffer.from(bytes).toString("base64"),
    });
}
export function materializeProductOverlayEntries(profile, options, bundleId = null) {
    const entries = [
        makePayloadEntry(PRODUCT_OVERLAY_FILE, createProductOverlayContent(profile, options), bundleId),
        makePayloadEntry(TECHNOLOGY_REGISTRY_OVERLAY_FILE, createTechnologyRegistryOverlayContent(profile, options), bundleId),
        makePayloadEntry(COMPONENT_REGISTRY_OVERLAY_FILE, createComponentRegistryOverlayContent(profile, options), bundleId),
    ];
    return Object.freeze(entries.toSorted((left, right) => compareStrings(left.path, right.path)));
}
export function createProductOverlayBundle(profile, options) {
    const bundleId = options?.id ?? PRODUCT_OVERLAY_BUNDLE_ID;
    const version = options?.version ?? PRODUCT_OVERLAY_BUNDLE_VERSION;
    const artifacts = [
        COMPONENT_REGISTRY_OVERLAY_FILE,
        PRODUCT_OVERLAY_FILE,
        TECHNOLOGY_REGISTRY_OVERLAY_FILE,
    ].sort(compareStrings);
    const bundleBody = {
        id: bundleId,
        version,
        digestAlgorithm: ENVELOPE_DIGEST_ALGORITHM,
        dependencies: [],
        artifacts,
        fixtures: [],
        goldens: [],
        modes: [
            {
                id: "overlay-validation",
                entrypoint: PRODUCT_OVERLAY_FILE,
                requiredPaths: artifacts,
            },
        ],
    };
    return Object.freeze({
        ...bundleBody,
        digest: sha256CanonicalJson(bundleBody),
    });
}
