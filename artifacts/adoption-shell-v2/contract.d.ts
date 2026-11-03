export declare const CONTRACT_ID: "repo-template/adoption-shell-v2";
export declare const CONTRACT_VERSION: "2.0.0";
export declare const ENVELOPE_DIGEST_ALGORITHM: "sha256-rfc8785-v1";
export declare const PAYLOAD_DIGEST_ALGORITHM: "sha256-framed-path-kind-mode-content-v1";
export declare const RELEASE_RECEIPT_KIND: "repo-template/release-receipt/v1";
export declare const REPO_TEMPLATE_REPOSITORY: "spencer-shadley/repo-template";
export declare const REPO_TEMPLATE_ORIGIN: "https://github.com/spencer-shadley/repo-template.git";
export declare const RELEASE_PAYLOAD_MANIFEST_PATH: "release/release-payload-set.json";
export declare const ARTIFACT_MANIFEST_PATH: "artifacts/adoption-shell-v2/artifact-manifest.json";
export declare const SCHEMA_IDS: {
    readonly deliveryDeclaration: "https://schemas.repo-template.dev/delivery-measurement-v1/delivery-declaration.schema.json";
    readonly deliveryEvent: "https://schemas.repo-template.dev/delivery-measurement-v1/delivery-event.schema.json";
    readonly materializerInput: "https://schemas.repo-template.dev/adoption-shell-v2/materializer-input.schema.json";
    readonly materializerOutputManifest: "https://schemas.repo-template.dev/adoption-shell-v2/materializer-output-manifest.schema.json";
    readonly releasePayloadSet: "https://schemas.repo-template.dev/adoption-shell-v2/release-payload-set.schema.json";
    readonly capabilityBundle: "https://schemas.repo-template.dev/adoption-shell-v2/capability-bundle.schema.json";
    readonly artifactManifest: "https://schemas.repo-template.dev/adoption-shell-v2/artifact-manifest.schema.json";
    readonly templateReleaseReceipt: "https://schemas.repo-template.dev/adoption-shell-v2/template-release-receipt.schema.json";
    readonly verificationReceipt: "https://schemas.repo-template.dev/adoption-shell-v2/verification-receipt.schema.json";
    readonly localCiContractV2: "https://schemas.repo-template.dev/local-ci-v2/local-ci-contract-v2.schema.json";
    readonly localCiContractV3: "https://schemas.repo-template.dev/local-ci-v3/local-ci-contract-v3.schema.json";
    readonly localCiOutcomeV1: "https://schemas.repo-template.dev/local-ci-outcome-v1/local-ci-outcome-v1.schema.json";
};
export declare const SCHEMA_DIGESTS: {
    readonly deliveryDeclaration: "7d70655d8232962d9a6e95b3edaf256a9d2c0e674ade9877cb787a29b98c5b7e";
    readonly deliveryEvent: "d0594c890c3291f1cc811886496b1d17f99df7155645571dd36fd03d0d50fa72";
    readonly materializerInput: "fe5527be73d4e652c14c423f428c66bf5c56aa1f206be159e2f566f2a9ba8c97";
    readonly materializerOutputManifest: "e7503619b5a53579b0f95a7a218f9ca9a3024ea7194c7359e7311d0bde0a90d1";
    readonly releasePayloadSet: "2e45fc30726def40628985347b729586ab8944c2387c1325cd2264740280733f";
    readonly capabilityBundle: "956cbe96172c5067e2e67327e63c0ea88542983991c595ad489e5413c6a42dd0";
    readonly artifactManifest: "b805467065d2538dc3bf21d6249eda17dd4a342a27252e12a8dea7d458256b95";
    readonly templateReleaseReceipt: "56640de35655e7eb92953cbb27a2c247f6dbf775584671d6cd052458791b7da7";
    readonly verificationReceipt: "8a282bca596130df44f33cb00241d7874a23a2b78c3d23c7c4bd0026103ad256";
    readonly localCiContractV2: "a8f34f07e1598f80e4294a2250c4bb34a5dcc22ec57a017ef42b82a19815d63f";
    readonly localCiContractV3: "8bae75ca0d7911f42a78ef05efcc02b4e765b46c1f1b258ad7ed59e4d52691b4";
    readonly localCiOutcomeV1: "0ae86bc068fbd4e1cc2ff58409d3909204573f0ac0b09cdbc7dab974bb4ea429";
};
export type FileMode = "100644" | "100755";
export type EntryKind = "file";
export type EntryEncoding = "utf-8" | "binary";
export type EntryRole = "generic-base-text" | "generic-base-binary" | "capability-executable" | "capability-config" | "capability-fixture" | "capability-golden";
export interface SchemaIdentity {
    readonly schemaId: string;
    readonly schemaVersion: typeof CONTRACT_VERSION;
    readonly schemaDigest: string;
}
export interface PayloadEntry {
    readonly path: string;
    readonly kind: EntryKind;
    readonly mode: FileMode;
    readonly contentSha256: string;
    readonly role: EntryRole;
    readonly encoding: EntryEncoding;
    readonly bundleId: string | null;
    readonly contentBase64: string;
}
export type ReleasePayloadEntryDraftV2 = Omit<PayloadEntry, "contentSha256">;
export interface ReleasePayloadSet extends SchemaIdentity {
    readonly contractId: typeof CONTRACT_ID;
    readonly digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    readonly payloadDigestAlgorithm: typeof PAYLOAD_DIGEST_ALGORITHM;
    readonly releaseDigest: string;
    readonly payloadDigest: string;
    readonly entryCount: number;
    readonly migrationRefs: readonly [];
    readonly entries: readonly PayloadEntry[];
}
export interface BundleReference {
    readonly id: string;
    readonly version: string;
    readonly digest: string;
}
export interface CapabilityMode {
    readonly id: string;
    readonly entrypoint: string;
    readonly requiredPaths: readonly string[];
}
export interface CapabilityBundle {
    readonly id: string;
    readonly version: string;
    readonly digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    readonly digest: string;
    readonly dependencies: readonly BundleReference[];
    readonly artifacts: readonly string[];
    readonly fixtures: readonly string[];
    readonly goldens: readonly string[];
    readonly modes: readonly CapabilityMode[];
}
export interface CapabilityBundleRegistry extends SchemaIdentity {
    readonly contractId: typeof CONTRACT_ID;
    readonly digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    readonly registryDigest: string;
    readonly bundles: readonly CapabilityBundle[];
}
export interface MaterializerInput extends SchemaIdentity {
    readonly contractId: typeof CONTRACT_ID;
    readonly release: ReleasePayloadSet;
    readonly capabilities: CapabilityBundleRegistry;
    readonly requestedBundles: readonly BundleReference[];
    readonly conformance: Readonly<{
        noLocalIssueTemplateOverride: true;
        noPreCustodyWorkflows: true;
    }>;
}
export interface OutputManifestEntry {
    readonly path: string;
    readonly kind: EntryKind;
    readonly mode: FileMode;
    readonly contentSha256: string;
    readonly role: EntryRole;
    readonly encoding: EntryEncoding;
    readonly bundleId: string | null;
}
export interface MaterializerOutputManifest extends SchemaIdentity {
    readonly contractId: typeof CONTRACT_ID;
    readonly digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    readonly manifestDigest: string;
    readonly releaseDigest: string;
    readonly releasePayloadDigest: string;
    readonly payloadDigestAlgorithm: typeof PAYLOAD_DIGEST_ALGORITHM;
    readonly outputPayloadDigest: string;
    readonly entryCount: number;
    readonly selectedBundles: readonly BundleReference[];
    readonly migrationRefs: readonly [];
    readonly entries: readonly OutputManifestEntry[];
}
export interface FileClosureRow {
    readonly path: string;
    readonly kind: EntryKind;
    readonly mode: FileMode;
    readonly sha256: string;
    readonly bytes: number;
}
export interface SchemaClosureRow extends FileClosureRow {
    readonly id: string;
    readonly version: typeof CONTRACT_VERSION;
}
export interface ArtifactManifest extends SchemaIdentity {
    readonly contractId: typeof CONTRACT_ID;
    readonly contractVersion: typeof CONTRACT_VERSION;
    readonly digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    readonly manifestDigest: string;
    readonly artifactDigestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    readonly artifactDigest: string;
    readonly toolchain: Readonly<{
        typescript: "7.0.2";
        nodeCompatibility: ">=24.16.0 <25";
        packageManager: "pnpm@11.17.0";
    }>;
    readonly entrypoint: "index.js";
    readonly validatorExport: "validateMaterializerInputV2";
    readonly runtimeDependencyCount: 0;
    readonly releaseReceiptKind: typeof RELEASE_RECEIPT_KIND;
    readonly sources: readonly FileClosureRow[];
    readonly schemas: readonly SchemaClosureRow[];
    readonly emitted: readonly FileClosureRow[];
    readonly fixtures: readonly FileClosureRow[];
    readonly goldens: readonly FileClosureRow[];
}
export interface VerificationReceipt extends SchemaIdentity {
    readonly contractId: typeof CONTRACT_ID;
    readonly receiptKind: "repo-template/adoption-shell-verification/v2";
    readonly digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    readonly receiptDigest: string;
    readonly artifactDigest: string;
    readonly inputDigest: string;
    readonly outputManifestDigest: string;
    readonly outputPayloadDigest: string;
    readonly independentRunCount: 2;
    readonly result: "verified";
}
export type TemplateReleasePublicationState = "candidate" | "published";
export interface TemplateReleaseEvidence {
    readonly review: Readonly<{
        subject: "producer-commit";
        url: string;
        result: "approved";
    }>;
    readonly canaryReceipts: Readonly<Record<string, Readonly<{
        url: string;
        receiptSha256: string;
    }>>>;
    readonly checks: Readonly<Record<string, Readonly<{
        command: string;
        result: "passed";
    }>>>;
    readonly publicationReadback: Readonly<{
        kind: "producer-tag-ref/v1";
    }>;
    readonly rollback: Readonly<{
        disposition: "immutable-correct-forward";
        supersession: "new-semver-only";
    }>;
}
export interface TemplateReleaseReceipt extends SchemaIdentity {
    readonly contractId: typeof CONTRACT_ID;
    readonly receiptKind: typeof RELEASE_RECEIPT_KIND;
    readonly publicationState: TemplateReleasePublicationState;
    readonly releaseId: string;
    readonly receiptDigestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    readonly receiptDigest: string;
    readonly producer: Readonly<{
        repository: typeof REPO_TEMPLATE_REPOSITORY;
        origin: typeof REPO_TEMPLATE_ORIGIN;
        semver: string;
        tag: string;
        commit: string;
        tree: string;
    }>;
    readonly receiptTransport: Readonly<{
        kind: "annotated-git-tag-message/v1";
        tagName: string;
        targetObjectType: "commit";
        bodyEncoding: "utf-8";
        bodyCanonicalization: "rfc8785";
    }>;
    readonly payloadSet: Readonly<{
        manifestPath: typeof RELEASE_PAYLOAD_MANIFEST_PATH;
        schemaId: typeof SCHEMA_IDS.releasePayloadSet;
        schemaVersion: typeof CONTRACT_VERSION;
        schemaDigest: string;
        manifestDigest: string;
        payloadDigestAlgorithm: typeof PAYLOAD_DIGEST_ALGORITHM;
        payloadDigest: string;
        entryCount: number;
    }>;
    readonly capabilityBundles: readonly BundleReference[];
    readonly materializer: Readonly<{
        contractId: typeof CONTRACT_ID;
        contractVersion: typeof CONTRACT_VERSION;
        artifactManifestPath: typeof ARTIFACT_MANIFEST_PATH;
        artifactManifestSchemaId: typeof SCHEMA_IDS.artifactManifest;
        artifactManifestSchemaVersion: typeof CONTRACT_VERSION;
        artifactManifestSchemaDigest: string;
        artifactManifestDigest: string;
        artifactDigest: string;
        entrypoint: "index.js";
        validatorExport: "validateMaterializerInputV2";
        runtimeCompatibility: ">=24.16.0 <25";
        compatibleReleaseReceiptKind: typeof RELEASE_RECEIPT_KIND;
    }>;
    readonly releaseEvidence?: TemplateReleaseEvidence;
    readonly migrationRefs: readonly [];
}
export interface TemplateReleaseClosure {
    readonly receipt: TemplateReleaseReceipt;
    readonly payloadSet: ReleasePayloadSet;
    readonly capabilityRegistry: CapabilityBundleRegistry;
    readonly artifactManifest: ArtifactManifest;
    readonly releaseEvidence?: TemplateReleaseEvidence;
}
export interface TemplateReleaseCandidateInput {
    readonly semver: string;
    readonly commit: string;
    readonly tree: string;
    readonly payloadSet: ReleasePayloadSet;
    readonly capabilityRegistry: CapabilityBundleRegistry;
    readonly artifactManifest: ArtifactManifest;
}
export interface MaterializationResult {
    readonly entries: readonly PayloadEntry[];
    readonly manifest: MaterializerOutputManifest;
}
export interface Diagnostic {
    readonly code: string;
    readonly pointer: string;
    readonly message: string;
}
export type ValidationResult<T> = Readonly<{
    ok: true;
    value: T;
}> | Readonly<{
    ok: false;
    diagnostics: readonly Diagnostic[];
}>;
export declare class AdoptionShellValidationError extends Error {
    readonly diagnostics: readonly Diagnostic[];
    constructor(diagnostics: readonly Diagnostic[]);
}
