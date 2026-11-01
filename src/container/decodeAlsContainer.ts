import { gunzipSync } from 'node:zlib';
import { TextDecoder } from 'node:util';

export interface AlsDecodeLimits {
  maxCompressedBytes?: number;
  maxXmlBytes?: number;
}

/** Decode only the gzip/UTF-8 container. XML and LiveSet semantics are not validated yet. */
export function decodeAlsContainer(input: Uint8Array, limits: AlsDecodeLimits = {}): string {
  const maxCompressedBytes = limits.maxCompressedBytes ?? 128 * 1024 * 1024;
  const maxXmlBytes = limits.maxXmlBytes ?? 256 * 1024 * 1024;
  for (const limit of [maxCompressedBytes, maxXmlBytes]) {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError('Limits must be positive safe integers');
  }
  if (input.byteLength > maxCompressedBytes) throw new RangeError('ALS compressed size limit exceeded');
  if (input[0] !== 0x1f || input[1] !== 0x8b || input[2] !== 8) throw new Error('Expected a gzip ALS container');
  // Enforce the actual output size; the gzip footer is not a trusted allocation limit.
  const decoded = gunzipSync(input, { maxOutputLength: maxXmlBytes });
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decoded);
}
