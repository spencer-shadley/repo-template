export const CONTRACT_ID = "repo-template/adoption-shell-v2";
export const CONTRACT_VERSION = "2.0.0";
export const ENVELOPE_DIGEST_ALGORITHM = "sha256-rfc8785-v1";
export const PAYLOAD_DIGEST_ALGORITHM = "sha256-framed-path-kind-mode-content-v1";
export const RELEASE_RECEIPT_KIND = "repo-template/release-receipt/v1";
export const REPO_TEMPLATE_REPOSITORY = "spencer-shadley/repo-template";
export const REPO_TEMPLATE_ORIGIN = "https://github.com/spencer-shadley/repo-template.git";
export const RELEASE_PAYLOAD_MANIFEST_PATH = "release/release-payload-set.json";
export const ARTIFACT_MANIFEST_PATH = "artifacts/adoption-shell-v2/artifact-manifest.json";
export const SCHEMA_IDS = {
    deliveryDeclaration: "https://schemas.repo-template.dev/delivery-measurement-v1/delivery-declaration.schema.json",
    deliveryEvent: "https://schemas.repo-template.dev/delivery-measurement-v1/delivery-event.schema.json",
    materializerInput: "https://schemas.repo-template.dev/adoption-shell-v2/materializer-input.schema.json",
    materializerOutputManifest: "https://schemas.repo-template.dev/adoption-shell-v2/materializer-output-manifest.schema.json",
    releasePayloadSet: "https://schemas.repo-template.dev/adoption-shell-v2/release-payload-set.schema.json",
    capabilityBundle: "https://schemas.repo-template.dev/adoption-shell-v2/capability-bundle.schema.json",
    artifactManifest: "https://schemas.repo-template.dev/adoption-shell-v2/artifact-manifest.schema.json",
    templateReleaseReceipt: "https://schemas.repo-template.dev/adoption-shell-v2/template-release-receipt.schema.json",
    verificationReceipt: "https://schemas.repo-template.dev/adoption-shell-v2/verification-receipt.schema.json",
    localCiContractV2: "https://schemas.repo-template.dev/local-ci-v2/local-ci-contract-v2.schema.json",
    localCiContractV3: "https://schemas.repo-template.dev/local-ci-v3/local-ci-contract-v3.schema.json",
    localCiOutcomeV1: "https://schemas.repo-template.dev/local-ci-outcome-v1/local-ci-outcome-v1.schema.json",
};
// Updated only when the corresponding committed schema bytes change.
export const SCHEMA_DIGESTS = {
    deliveryDeclaration: "7d70655d8232962d9a6e95b3edaf256a9d2c0e674ade9877cb787a29b98c5b7e",
    deliveryEvent: "d0594c890c3291f1cc811886496b1d17f99df7155645571dd36fd03d0d50fa72",
    materializerInput: "fe5527be73d4e652c14c423f428c66bf5c56aa1f206be159e2f566f2a9ba8c97",
    materializerOutputManifest: "e7503619b5a53579b0f95a7a218f9ca9a3024ea7194c7359e7311d0bde0a90d1",
    releasePayloadSet: "2e45fc30726def40628985347b729586ab8944c2387c1325cd2264740280733f",
    capabilityBundle: "956cbe96172c5067e2e67327e63c0ea88542983991c595ad489e5413c6a42dd0",
    artifactManifest: "b805467065d2538dc3bf21d6249eda17dd4a342a27252e12a8dea7d458256b95",
    templateReleaseReceipt: "56640de35655e7eb92953cbb27a2c247f6dbf775584671d6cd052458791b7da7",
    verificationReceipt: "8a282bca596130df44f33cb00241d7874a23a2b78c3d23c7c4bd0026103ad256",
    localCiContractV2: "a8f34f07e1598f80e4294a2250c4bb34a5dcc22ec57a017ef42b82a19815d63f",
    localCiContractV3: "8bae75ca0d7911f42a78ef05efcc02b4e765b46c1f1b258ad7ed59e4d52691b4",
    localCiOutcomeV1: "0ae86bc068fbd4e1cc2ff58409d3909204573f0ac0b09cdbc7dab974bb4ea429",
};
export class AdoptionShellValidationError extends Error {
    diagnostics;
    constructor(diagnostics) {
        super("adoption-shell-v2 input failed validation");
        this.name = "AdoptionShellValidationError";
        this.diagnostics = diagnostics;
    }
}
