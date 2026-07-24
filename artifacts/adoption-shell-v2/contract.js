export const CONTRACT_ID = "repo-template/adoption-shell-v2";
export const CONTRACT_VERSION = "2.0.0";
export const ENVELOPE_DIGEST_ALGORITHM = "sha256-rfc8785-v1";
export const PAYLOAD_DIGEST_ALGORITHM = "sha256-framed-path-kind-mode-content-v1";
export const RELEASE_RECEIPT_KIND = "repo-template/release-receipt/v1";
export const SCHEMA_IDS = {
    deliveryDeclaration: "https://schemas.repo-template.dev/delivery-measurement-v1/delivery-declaration.schema.json",
    deliveryEvent: "https://schemas.repo-template.dev/delivery-measurement-v1/delivery-event.schema.json",
    materializerInput: "https://schemas.repo-template.dev/adoption-shell-v2/materializer-input.schema.json",
    materializerOutputManifest: "https://schemas.repo-template.dev/adoption-shell-v2/materializer-output-manifest.schema.json",
    releasePayloadSet: "https://schemas.repo-template.dev/adoption-shell-v2/release-payload-set.schema.json",
    capabilityBundle: "https://schemas.repo-template.dev/adoption-shell-v2/capability-bundle.schema.json",
    artifactManifest: "https://schemas.repo-template.dev/adoption-shell-v2/artifact-manifest.schema.json",
    verificationReceipt: "https://schemas.repo-template.dev/adoption-shell-v2/verification-receipt.schema.json",
};
// Updated only when the corresponding committed schema bytes change.
export const SCHEMA_DIGESTS = {
    deliveryDeclaration: "7d70655d8232962d9a6e95b3edaf256a9d2c0e674ade9877cb787a29b98c5b7e",
    deliveryEvent: "d0594c890c3291f1cc811886496b1d17f99df7155645571dd36fd03d0d50fa72",
    materializerInput: "fe5527be73d4e652c14c423f428c66bf5c56aa1f206be159e2f566f2a9ba8c97",
    materializerOutputManifest: "e7503619b5a53579b0f95a7a218f9ca9a3024ea7194c7359e7311d0bde0a90d1",
    releasePayloadSet: "2e45fc30726def40628985347b729586ab8944c2387c1325cd2264740280733f",
    capabilityBundle: "956cbe96172c5067e2e67327e63c0ea88542983991c595ad489e5413c6a42dd0",
    artifactManifest: "ad14f0c97ecdd41895bc8a870eeac55f6acf0d625e9b8973739e0fb971282957",
    verificationReceipt: "8a282bca596130df44f33cb00241d7874a23a2b78c3d23c7c4bd0026103ad256",
};
export class AdoptionShellValidationError extends Error {
    diagnostics;
    constructor(diagnostics) {
        super("adoption-shell-v2 input failed validation");
        this.name = "AdoptionShellValidationError";
        this.diagnostics = diagnostics;
    }
}
