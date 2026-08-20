import { ENVELOPE_DIGEST_ALGORITHM, PAYLOAD_DIGEST_ALGORITHM, type PayloadEntry } from "./contract.ts";
export declare function sha256Bytes(value: Uint8Array): string;
export declare function sha256CanonicalJson(value: unknown): string;
export declare function decodeCanonicalBase64(value: string): Uint8Array;
export declare function payloadFrame(entries: readonly PayloadEntry[]): Uint8Array;
export declare function sha256PayloadEntries(entries: readonly PayloadEntry[]): string;
export { ENVELOPE_DIGEST_ALGORITHM, PAYLOAD_DIGEST_ALGORITHM, };
