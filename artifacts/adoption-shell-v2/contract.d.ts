export declare const CONTRACT_ID: "repo-template/adoption-shell-v2";
export declare const CONTRACT_VERSION: "2.0.0";
export declare const ENVELOPE_DIGEST_ALGORITHM: "sha256-rfc8785-v1";
export declare const PAYLOAD_DIGEST_ALGORITHM: "sha256-framed-path-kind-mode-content-v1";
export declare const RELEASE_RECEIPT_KIND: "repo-template/release-receipt/v1";
export declare const SCHEMA_IDS: {
    readonly deliveryDeclaration: "https://schemas.repo-template.dev/delivery-measurement-v1/delivery-declaration.schema.json";
    readonly deliveryEvent: "https://schemas.repo-template.dev/delivery-measurement-v1/delivery-event.schema.json";
    readonly materializerInput: "https://schemas.repo-template.dev/adoption-shell-v2/materializer-input.schema.json";
    readonly materializerOutputManifest: "https://schemas.repo-template.dev/adoption-shell-v2/materializer-output-manifest.schema.json";
    readonly releasePayloadSet: "https://schemas.repo-template.dev/adoption-shell-v2/release-payload-set.schema.json";
    readonly capabilityBundle: "https://schemas.repo-template.dev/adoption-shell-v2/capability-bundle.schema.json";
    readonly artifactManifest: "https://schemas.repo-template.dev/adoption-shell-v2/artifact-manifest.schema.json";
    readonly verificationReceipt: "https://schemas.repo-template.dev/adoption-shell-v2/verification-receipt.schema.json";
};
export declare const SCHEMA_DIGESTS: {
    readonly deliveryDeclaration: "7d70655d8232962d9a6e95b3edaf256a9d2c0e674ade9877cb787a29b98c5b7e";
    readonly deliveryEvent: "d0594c890c3291f1cc811886496b1d17f99df7155645571dd36fd03d0d50fa72";
    readonly materializerInput: "fe5527be73d4e652c14c423f428c66bf5c56aa1f206be159e2f566f2a9ba8c97";
    readonly materializerOutputManifest: "e7503619b5a53579b0f95a7a218f9ca9a3024ea7194c7359e7311d0bde0a90d1";
    readonly releasePayloadSet: "2e45fc30726def40628985347b729586ab8944c2387c1325cd2264740280733f";
    readonly capabilityBundle: "956cbe96172c5067e2e67327e63c0ea88542983991c595ad489e5413c6a42dd0";
    readonly artifactManifest: "ad14f0c97ecdd41895bc8a870eeac55f6acf0d625e9b8973739e0fb971282957";
    readonly verificationReceipt: "8a282bca596130df44f33cb00241d7874a23a2b78c3d23c7c4bd0026103ad256";
};
export type Sha256 = string;
export type FileMode = "100644" | "100755";
export type EntryKind = "file";
export type EntryEncoding = "utf-8" | "binary";
export type EntryRole = "generic-base-text" | "generic-base-binary" | "capability-executable" | "capability-config" | "capability-fixture" | "capability-golden";
export interface SchemaIdentity {
    readonly schemaId: string;
    readonly schemaVersion: typeof CONTRACT_VERSION;
    readonly schemaDigest: Sha256;
}
export interface PayloadEntry extends Readonly<{
    path: string;
    kind: EntryKind;
    mode: FileMode;
    contentSha256: Sha256;
    role: EntryRole;
    encoding: EntryEncoding;
    bundleId: string | null;
    contentBase64: string;
}> {
}
export interface ReleasePayloadSet extends SchemaIdentity, Readonly<{
    contractId: typeof CONTRACT_ID;
    digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    payloadDigestAlgorithm: typeof PAYLOAD_DIGEST_ALGORITHM;
    releaseDigest: Sha256;
    payloadDigest: Sha256;
    entryCount: number;
    migrationRefs: readonly [];
    entries: readonly PayloadEntry[];
}> {
}
export interface BundleReference extends Readonly<{
    id: string;
    version: string;
    digest: Sha256;
}> {
}
export interface CapabilityMode extends Readonly<{
    id: string;
    entrypoint: string;
    requiredPaths: readonly string[];
}> {
}
export interface CapabilityBundle extends Readonly<{
    id: string;
    version: string;
    digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    digest: Sha256;
    dependencies: readonly BundleReference[];
    artifacts: readonly string[];
    fixtures: readonly string[];
    goldens: readonly string[];
    modes: readonly CapabilityMode[];
}> {
}
export interface CapabilityBundleRegistry extends SchemaIdentity, Readonly<{
    contractId: typeof CONTRACT_ID;
    digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    registryDigest: Sha256;
    bundles: readonly CapabilityBundle[];
}> {
}
export interface MaterializerInput extends SchemaIdentity, Readonly<{
    contractId: typeof CONTRACT_ID;
    release: ReleasePayloadSet;
    capabilities: CapabilityBundleRegistry;
    requestedBundles: readonly BundleReference[];
    conformance: Readonly<{
        noLocalIssueTemplateOverride: true;
        noPreCustodyWorkflows: true;
    }>;
}> {
}
export interface OutputManifestEntry extends Readonly<{
    path: string;
    kind: EntryKind;
    mode: FileMode;
    contentSha256: Sha256;
    role: EntryRole;
    encoding: EntryEncoding;
    bundleId: string | null;
}> {
}
export interface MaterializerOutputManifest extends SchemaIdentity, Readonly<{
    contractId: typeof CONTRACT_ID;
    digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    manifestDigest: Sha256;
    releaseDigest: Sha256;
    releasePayloadDigest: Sha256;
    payloadDigestAlgorithm: typeof PAYLOAD_DIGEST_ALGORITHM;
    outputPayloadDigest: Sha256;
    entryCount: number;
    selectedBundles: readonly BundleReference[];
    migrationRefs: readonly [];
    entries: readonly OutputManifestEntry[];
}> {
}
export interface FileClosureRow extends Readonly<{
    path: string;
    kind: EntryKind;
    mode: FileMode;
    sha256: Sha256;
    bytes: number;
}> {
}
export interface SchemaClosureRow extends FileClosureRow, Readonly<{
    id: string;
    version: typeof CONTRACT_VERSION;
}> {
}
export interface ArtifactManifest extends SchemaIdentity, Readonly<{
    contractId: typeof CONTRACT_ID;
    contractVersion: typeof CONTRACT_VERSION;
    digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    manifestDigest: Sha256;
    artifactDigestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    artifactDigest: Sha256;
    toolchain: Readonly<{
        typescript: "7.0.2";
        nodeCompatibility: ">=24.16.0 <25";
        packageManager: "pnpm@11.17.0";
    }>;
    entrypoint: "index.js";
    validatorExport: "validateMaterializerInputV2";
    runtimeDependencyCount: 0;
    releaseReceiptKind: typeof RELEASE_RECEIPT_KIND;
    sources: readonly FileClosureRow[];
    schemas: readonly SchemaClosureRow[];
    emitted: readonly FileClosureRow[];
    fixtures: readonly FileClosureRow[];
    goldens: readonly FileClosureRow[];
}> {
}
export interface VerificationReceipt extends SchemaIdentity, Readonly<{
    contractId: typeof CONTRACT_ID;
    receiptKind: "repo-template/adoption-shell-verification/v2";
    digestAlgorithm: typeof ENVELOPE_DIGEST_ALGORITHM;
    receiptDigest: Sha256;
    artifactDigest: Sha256;
    inputDigest: Sha256;
    outputManifestDigest: Sha256;
    outputPayloadDigest: Sha256;
    independentRunCount: 2;
    result: "verified";
}> {
}
export interface MaterializationResult extends Readonly<{
    entries: readonly PayloadEntry[];
    manifest: MaterializerOutputManifest;
}> {
}
export interface Diagnostic extends Readonly<{
    code: string;
    pointer: string;
    message: string;
}> {
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
