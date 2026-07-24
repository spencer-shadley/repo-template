import { ENVELOPE_DIGEST_ALGORITHM, PAYLOAD_DIGEST_ALGORITHM, type PayloadEntry, type Sha256 } from "./contract.ts";
export declare function sha256Bytes(value: Uint8Array): Sha256;
export declare function sha256CanonicalJson(value: unknown): Sha256;
export declare function decodeCanonicalBase64(value: string): Uint8Array;
export declare function payloadFrame(entries: readonly PayloadEntry[]): Uint8Array;
export declare function sha256PayloadEntries(entries: readonly PayloadEntry[]): Sha256;
export { ENVELOPE_DIGEST_ALGORITHM, PAYLOAD_DIGEST_ALGORITHM, };
