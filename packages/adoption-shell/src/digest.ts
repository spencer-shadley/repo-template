import { createHash } from "node:crypto";

import { canonicalJsonBytes } from "./canonical-json.js";
import {
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
  type PayloadEntry,
  type Sha256,
} from "./contract.js";

const encoder = new TextEncoder();

export function sha256Bytes(value: Uint8Array): Sha256 {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256CanonicalJson(value: unknown): Sha256 {
  return sha256Bytes(canonicalJsonBytes(value));
}

export function decodeCanonicalBase64(value: string): Uint8Array {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new TypeError("contentBase64 must use canonical padded base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new TypeError("contentBase64 must use canonical padded base64");
  }
  return bytes;
}

function u64(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("frame length must be a non-negative safe integer");
  }
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, BigInt(value), false);
  return new Uint8Array(buffer);
}

function framed(value: Uint8Array): readonly Uint8Array[] {
  return [u64(value.byteLength), value];
}

export function payloadFrame(entries: readonly PayloadEntry[]): Uint8Array {
  const ordered = [...entries].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  const chunks: Uint8Array[] = [];
  for (const entry of ordered) {
    chunks.push(
      ...framed(encoder.encode(entry.path)),
      ...framed(encoder.encode(entry.kind)),
      ...framed(encoder.encode(entry.mode)),
      ...framed(decodeCanonicalBase64(entry.contentBase64)),
    );
  }
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function sha256PayloadEntries(entries: readonly PayloadEntry[]): Sha256 {
  return sha256Bytes(payloadFrame(entries));
}

export {
  ENVELOPE_DIGEST_ALGORITHM,
  PAYLOAD_DIGEST_ALGORITHM,
};
