import { gzipSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseAls, serializeAls, writeAlsOverwriteProtection } from '../index.js';

function session(protection = '<OverwriteProtectionNumber Value="3072" />', version = '12.0_12117'): string {
  return `<?xml version="1.0"?><Ableton MajorVersion="5" MinorVersion="${version}" Creator="Ableton Live 12.1d1"><LiveSet><NextPointeeId Value="1"/>${protection}<MainTrack/><Unknown>DEADBEEF</Unknown></LiveSet></Ableton>`;
}
const parsed = (s: string) => parseAls(gzipSync(s));

describe('writeAlsOverwriteProtection', () => {
  it('changes only the LiveSet overwrite protection number', () => {
    const xml = session();
    const original = parsed(xml);
    const edited = writeAlsOverwriteProtection(original, 99999);
    expect(gunzipSync(serializeAls(edited)).toString()).toBe(xml.replace('Value="3072"', 'Value="99999"'));
    expect(gunzipSync(serializeAls(original)).toString()).toBe(xml);
    expect(writeAlsOverwriteProtection(original, 3072)).toBe(original);
  });
  it('ignores nested overwrite protection numbers', () => {
    const nested = '<MainTrack><OverwriteProtectionNumber Value="1"/></MainTrack>';
    const xml = session().replace('<MainTrack/>', nested);
    const edited = writeAlsOverwriteProtection(parsed(xml), 4000);
    expect(gunzipSync(serializeAls(edited)).toString()).toBe(xml.replace('Value="3072"', 'Value="4000"'));
  });
  it.each([-1, 1.5, NaN, Infinity])('rejects invalid value %s', (value) => {
    expect(() => writeAlsOverwriteProtection(parsed(session()), value)).toThrow(RangeError);
  });
  it('refuses missing or duplicated numbers', () => {
    expect(() => writeAlsOverwriteProtection(parsed(session('')), 1)).toThrow('missing or duplicated');
    const twice = '<OverwriteProtectionNumber Value="1"/><OverwriteProtectionNumber Value="2"/>';
    expect(() => writeAlsOverwriteProtection(parsed(session(twice)), 1)).toThrow('missing or duplicated');
  });
  it('refuses sets that are not enabled for writing', () => {
    expect(() => writeAlsOverwriteProtection(parsed(session(undefined, '99.0')), 1)).toThrow('writing');
  });
});
