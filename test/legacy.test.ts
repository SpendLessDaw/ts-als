import { gzipSync, gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { parseAls, listSamples, inspectSamples, readAlsTempo, writeAlsTempo, rewriteSamplePaths, serializeAls } from '../index.js';
import { readAliasPath } from '../src/samples/readAliasPath.js';

function session(major: number, sample = '', automation = ''): string {
  const main = major < 12 ? 'MasterTrack' : 'MainTrack';
  return `<Ableton MajorVersion="5" MinorVersion="${major}.0_377" Creator="Ableton Live ${major}.1.7"><LiveSet><${main}><DeviceChain><Mixer><Tempo><Manual Value="120"/><AutomationTarget Id="1"/></Tempo></Mixer></DeviceChain><AutomationEnvelopes><Envelopes>${automation}</Envelopes></AutomationEnvelopes></${main}>${sample}</LiveSet></Ableton>`;
}
function legacy(relative = '<RelativePathElement Id="0" Dir=""/><RelativePathElement Id="1" Dir="Audio"/>', data = ''): string {
  return `<SampleRef><FileRef><HasRelativePath Value="true"/><RelativePathType Value="1"/><RelativePath>${relative}</RelativePath><Name Value="kick.wav"/><Type Value="2"/><Data>${data}</Data><RefersToFolder Value="false"/><SearchHint><PathHint><RelativePathElement Dir="Samples"/></PathHint></SearchHint></FileRef></SampleRef>`;
}
function alias(relative = 'Audio/kick.wav', mount = '/'): string {
  const header = Buffer.alloc(150); header.writeUInt16BE(2, 6);
  const tags = [[18, relative], [19, mount]].map(([id, text]) => {
    const body = Buffer.from(String(text)); const tag = Buffer.alloc(4 + body.length + body.length % 2);
    tag.writeUInt16BE(Number(id)); tag.writeUInt16BE(body.length, 2); body.copy(tag, 4); return tag;
  });
  const end = Buffer.from([255, 255, 0, 0]);
  const result = Buffer.concat([header, ...tags, end]); result.writeUInt16BE(result.length, 4);
  return result.toString('hex');
}
it.each([10, 11, 12])('reads and edits recognized Live %i tempo without touching other XML', (version) => {
  const xml = session(version, legacy()); const p = parseAls(gzipSync(xml));
  expect(p.writable).toBe(true);
  expect(gunzipSync(serializeAls(writeAlsTempo(p, 135))).toString()).toBe(xml.replace('Value="120"', 'Value="135"'));
  expect(serializeAls(p)).toEqual(gzipSync(xml));
});
it.each([9, 13])('keeps Live %i read-only', (version) => {
  const p = parseAls(gzipSync(session(version)));
  expect(p.writable).toBe(false); expect(() => writeAlsTempo(p, 130)).toThrow();
});
it('does not enable inconsistent creator/schema headers', () => {
  expect(parseAls(gzipSync(session(10).replace('Creator="Ableton Live 10.', 'Creator="Ableton Live 11.'))).writable).toBe(false);
});
it('reads legacy relative segments and requires an explicit base for type 1', async () => {
  const p = parseAls(gzipSync(session(10, legacy())));
  expect(listSamples(p)[0]).toMatchObject({ layout: 'legacy', path: '../Audio/kick.wav', relativePath: '../Audio/kick.wav', pathHint: 'Samples/kick.wav', supported: true, writable: false });
  expect((await inspectSamples(p))[0]?.status).toBe('unresolved');
  const base = process.platform === 'win32' ? 'C:\\Project\\Sets' : '/Project/Sets';
  expect((await inspectSamples(p, { relativeRoots: { '1': base } }))[0]?.candidates).toHaveLength(1);
  expect(() => rewriteSamplePaths(p, () => '/new/kick.wav')).toThrow('writing');
});
it('reads bounded macOS v2 aliases including boot and external volumes', () => {
  expect(readAliasPath(alias())).toBe('/Audio/kick.wav');
  expect(readAliasPath(alias('/Audio/kick.wav', '/Volumes/Disk'))).toBe('/Volumes/Disk/Audio/kick.wav');
  const p = parseAls(gzipSync(session(10, legacy('', alias()))));
  expect(listSamples(p)[0]).toMatchObject({ absolutePath: '/Audio/kick.wav', hasEmbeddedData: true });
});
it('does not trust malformed, unsupported or mismatched aliases', () => {
  for (const data of ['ZZ', alias().slice(0, -2), alias().replace(/^(.{12})0002/, '$10003'), alias('../kick.wav'), alias('Audio/\u0000kick.wav')]) expect(readAliasPath(data)).toBeNull();
  const p = parseAls(gzipSync(session(10, legacy('', alias('other.wav')))));
  expect(listSamples(p)[0]?.absolutePath).toBeNull();
});
it('keeps filename-only legacy references unresolved even with a project root', async () => {
  const xml = session(10, legacy().replace('HasRelativePath Value="true"', 'HasRelativePath Value="false"'));
  const p = parseAls(gzipSync(xml));
  expect(listSamples(p)[0]?.path).toBe('kick.wav');
  expect((await inspectSamples(p, { projectRoot: process.platform === 'win32' ? 'C:\\Project' : '/Project' }))[0]?.candidates).toEqual([]);
});
it('refuses unknown relative list members and uncertain tempo automation', () => {
  const p = parseAls(gzipSync(session(10, legacy('<Unexpected/>'), '<AutomationEnvelope/>')));
  expect(listSamples(p)[0]?.supported).toBe(false);
  expect(readAlsTempo(p).automation).toBe('unknown');
  expect(() => writeAlsTempo(p, 130)).toThrow('automation');
});
