import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeAlsContainer } from '../index.js';

describe('decodeAlsContainer', () => {
  it('returns the exact UTF-8 text without mutating the source', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><Ableton Creator="Live"><LiveSet><Unknown Value="&#233;"/></LiveSet></Ableton>\r\n';
    const source = gzipSync(xml);
    const original = Buffer.from(source);
    expect(decodeAlsContainer(source)).toBe(xml);
    expect(source.equals(original)).toBe(true);
  });
  it('does not pretend that decompression validates XML', () => {
    expect(decodeAlsContainer(gzipSync('not XML'))).toBe('not XML');
  });
  it.each([Buffer.alloc(0), Buffer.from('<Ableton/>'), Buffer.from([0x1f, 0x8b, 0])])('rejects non-gzip input', (bytes) => {
    expect(() => decodeAlsContainer(bytes)).toThrow('gzip');
  });
  it('rejects truncated data', () => {
    expect(() => decodeAlsContainer(gzipSync('<Ableton/>').subarray(0, 12))).toThrow();
  });
  it('rejects corrupt checksum', () => {
    const bytes = gzipSync('<Ableton/>');
    bytes[bytes.length - 8] = (bytes[bytes.length - 8] ?? 0) ^ 0xff;
    expect(() => decodeAlsContainer(bytes)).toThrow();
  });
  it('rejects invalid UTF-8', () => {
    expect(() => decodeAlsContainer(gzipSync(Buffer.from([0xc3, 0x28])))).toThrow();
  });
  it('enforces input and decompressed output limits', () => {
    const bytes = gzipSync('a'.repeat(4096));
    expect(() => decodeAlsContainer(bytes, { maxCompressedBytes: 1 })).toThrow('compressed size');
    expect(() => decodeAlsContainer(bytes, { maxXmlBytes: 1024 })).toThrow();
    expect(decodeAlsContainer(bytes, { maxXmlBytes: 4096 })).toHaveLength(4096);
  });
  it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid limit %s', (limit) => {
    expect(() => decodeAlsContainer(gzipSync('x'), { maxXmlBytes: limit })).toThrow(RangeError);
  });
});
