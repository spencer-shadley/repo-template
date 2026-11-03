import { CONTRACT_VERSION, SCHEMA_DIGESTS, } from "./contract.js";
import { SEMVER_PATTERN } from "./validation-helpers.js";
export const PRODUCT_OVERLAY_CONTRACT_ID = "repo-template/product-overlay/v1";
export const PRODUCT_OVERLAY_SCHEMA_VERSION = "1.0.0";
export const PRODUCT_OVERLAY_SCHEMA_ID = "https://schemas.repo-template.dev/product-overlay/v1/product-overlay.schema.json";
export const TECHNOLOGY_REGISTRY_OVERLAY_SCHEMA_ID = "https://schemas.repo-template.dev/product-overlay/v1/technology-registry.overlay.schema.json";
export const COMPONENT_REGISTRY_OVERLAY_SCHEMA_ID = "https://schemas.repo-template.dev/product-overlay/v1/component-registry.overlay.schema.json";
export const PRODUCT_OVERLAY_BUNDLE_ID = "repo-template/product-overlay";
export const PRODUCT_OVERLAY_BUNDLE_VERSION = "1.0.0";
export const PRODUCT_OVERLAY_FILE = "product-overlay.yaml";
export const TECHNOLOGY_REGISTRY_OVERLAY_FILE = "technology-registry.overlay.yaml";
export const COMPONENT_REGISTRY_OVERLAY_FILE = "component-registry.overlay.yaml";
export const PRODUCT_PLATFORM_ROLES = [
    "primary",
    "secondary",
    "accessory",
    "specialized",
    "dormant",
    "not-targeted",
];
export const REGISTRY_LIFECYCLE_STATES = [
    "preferred-default",
    "context-preferred",
    "supported-alternative",
    "candidate",
    "legacy-compatibility",
    "discouraged",
    "prohibited",
];
export const CANONICAL_PLATFORM_NAMES = [
    "web",
    "android",
    "windows",
    "browser-extension",
    "chromeos",
    "ios",
    "macos",
    "linux",
    "cli",
    "scheduled-job",
];
const MUTABLE_PROVENANCE_PATTERN = /(?:^|[/:])(?:master|main|HEAD|origin\/master|trunk|dev|develop|staging|latest)(?:[/:].*)?$/i;
function hasValidGitHubUrlStructure(url) {
    return (url.protocol === "https:" &&
        url.hostname.toLowerCase() === "github.com" &&
        url.search === "" &&
        url.hash === "" &&
        url.username === "" &&
        url.password === "" &&
        url.port === "" &&
        !url.pathname.endsWith("/"));
}
const GITHUB_REPO_SEGMENT = /^[a-zA-Z0-9_.-]+$/;
function isValidGitHubCommitPath(segments) {
    if (segments.length !== 4 || segments[2] !== "commit")
        return false;
    const owner = segments[0];
    const repo = segments[1];
    const commit = segments[3];
    if (!owner || !repo || !commit)
        return false;
    return GITHUB_REPO_SEGMENT.test(owner) && GITHUB_REPO_SEGMENT.test(repo) && /^[0-9a-f]{40}$/i.test(commit);
}
function isValidGitHubReleaseTagPath(segments) {
    if (segments.length !== 5 || segments[2] !== "releases" || segments[3] !== "tag")
        return false;
    const owner = segments[0];
    const repo = segments[1];
    const tag = segments[4];
    if (!owner || !repo || !tag)
        return false;
    if (!GITHUB_REPO_SEGMENT.test(owner) || !GITHUB_REPO_SEGMENT.test(repo))
        return false;
    const tagToTest = tag.startsWith("v") ? tag.slice(1) : tag;
    return SEMVER_PATTERN.test(tagToTest);
}
export function isImmutableGitHubUrl(value) {
    if (value.includes("..") || /%2e/i.test(value))
        return false;
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return false;
    }
    if (!hasValidGitHubUrlStructure(url))
        return false;
    const segments = url.pathname.split("/").filter(Boolean);
    return isValidGitHubCommitPath(segments) || isValidGitHubReleaseTagPath(segments);
}
export function isImmutableProvenance(value) {
    if (typeof value !== "string")
        return false;
    const trimmed = value.trim();
    if (trimmed === "" || MUTABLE_PROVENANCE_PATTERN.test(trimmed)) {
        return false;
    }
    if (SEMVER_PATTERN.test(trimmed.startsWith("v") ? trimmed.slice(1) : trimmed)) {
        return true;
    }
    if (/^[0-9a-f]{40}$/i.test(trimmed) || /^[0-9a-f]{64}$/i.test(trimmed)) {
        return true;
    }
    if (/^sha256:[0-9a-f]{64}$/i.test(trimmed)) {
        return true;
    }
    if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+@v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-zA-Z.-]+)?$/i.test(trimmed)) {
        return true;
    }
    if (trimmed === "legacy") {
        return true;
    }
    if (trimmed.includes("://")) {
        return isImmutableGitHubUrl(trimmed);
    }
    return false;
}
export function defaultPlatformsForProfile(profileId) {
    if (profileId === "service") {
        return {
            "cli": { role: "secondary", priority: 2 },
            "scheduled-job": { role: "primary", priority: 1 },
            "web": { role: "not-targeted", rationale: "Backend service only" },
            "android": { role: "not-targeted", rationale: "Backend service only" },
            "windows": { role: "not-targeted", rationale: "Backend service only" },
            "macos": { role: "not-targeted", rationale: "Backend service only" },
            "linux": { role: "not-targeted", rationale: "Backend service only" },
            "ios": { role: "not-targeted", rationale: "Backend service only" },
            "chromeos": { role: "not-targeted", rationale: "Backend service only" },
            "browser-extension": { role: "not-targeted", rationale: "Backend service only" },
        };
    }
    if (profileId === "library") {
        return {
            "cli": { role: "specialized", priority: 1, rationale: "Local validation and build CLI" },
            "web": { role: "not-targeted", rationale: "Shared library package" },
            "android": { role: "not-targeted", rationale: "Shared library package" },
            "windows": { role: "not-targeted", rationale: "Shared library package" },
            "macos": { role: "not-targeted", rationale: "Shared library package" },
            "linux": { role: "not-targeted", rationale: "Shared library package" },
            "ios": { role: "not-targeted", rationale: "Shared library package" },
            "chromeos": { role: "not-targeted", rationale: "Shared library package" },
            "browser-extension": { role: "not-targeted", rationale: "Shared library package" },
            "scheduled-job": { role: "not-targeted", rationale: "Shared library package" },
        };
    }
    if (profileId === "standalone") {
        return {
            "cli": { role: "primary", priority: 1 },
            "scheduled-job": { role: "secondary", priority: 2 },
            "web": { role: "not-targeted", rationale: "Standalone CLI tool" },
            "android": { role: "not-targeted", rationale: "Standalone CLI tool" },
            "windows": { role: "not-targeted", rationale: "Standalone CLI tool" },
            "macos": { role: "not-targeted", rationale: "Standalone CLI tool" },
            "linux": { role: "not-targeted", rationale: "Standalone CLI tool" },
            "ios": { role: "not-targeted", rationale: "Standalone CLI tool" },
            "chromeos": { role: "not-targeted", rationale: "Standalone CLI tool" },
            "browser-extension": { role: "not-targeted", rationale: "Standalone CLI tool" },
        };
    }
    return {
        "web": { role: "primary", priority: 1 },
        "android": { role: "secondary", priority: 2 },
        "browser-extension": { role: "accessory", priority: 3 },
        "cli": { role: "specialized", priority: 4, rationale: "Developer and operations tooling" },
        "scheduled-job": { role: "specialized", priority: 5, rationale: "Background worker execution" },
        "windows": { role: "dormant", revisitTrigger: "Evaluate desktop support upon customer demand" },
        "macos": { role: "dormant", revisitTrigger: "Evaluate desktop support upon customer demand" },
        "linux": { role: "dormant", revisitTrigger: "Evaluate desktop support upon customer demand" },
        "ios": { role: "dormant", revisitTrigger: "Evaluate mobile iOS support upon user demand" },
        "chromeos": { role: "not-targeted", rationale: "Covered by web PWA surface" },
    };
}
export function defaultTechnologiesForProfile(profileId) {
    const common = {
        "technology.typescript": {
            state: "preferred-default",
            rationale: "Primary language across all fleet applications",
        },
        "technology.pnpm": {
            state: "preferred-default",
            rationale: "Host execution and supply-chain isolation",
        },
    };
    if (profileId === "full-stack" || profileId === "service") {
        return {
            ...common,
            "technology.turborepo": {
                state: "preferred-default",
                rationale: "Task graph pipeline for monorepo workspaces",
            },
            "technology.postgresql": {
                state: "preferred-default",
                rationale: "Authoritative relational database",
            },
            "technology.docker": {
                state: "preferred-default",
                rationale: "Hermetic container runtime for local and CI services",
            },
        };
    }
    if (profileId === "library") {
        return {
            ...common,
            "technology.turborepo": {
                state: "preferred-default",
                rationale: "Task graph pipeline for monorepo packages",
            },
        };
    }
    return common;
}
export function defaultComponentsForProfile(profileId) {
    if (profileId === "full-stack") {
        return {
            "component.tanstack-router": {
                state: "preferred-default",
                rationale: "Type-safe routing for web surfaces",
            },
            "component.dbmate": {
                state: "preferred-default",
                rationale: "Ordered database migrations",
            },
        };
    }
    if (profileId === "service") {
        return {
            "component.dbmate": {
                state: "preferred-default",
                rationale: "Ordered database migrations",
            },
        };
    }
    return {};
}
export function defaultProvenance() {
    return Object.freeze({
        contractId: PRODUCT_OVERLAY_CONTRACT_ID,
        templateRelease: CONTRACT_VERSION,
        templateDigest: SCHEMA_DIGESTS.materializerInput,
        bootstrappedFromGuideVersion: CONTRACT_VERSION,
        lastAuditedAgainstGuideVersion: CONTRACT_VERSION,
    });
}
