import { gzipSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseAls, serializeAls, getAlsVersion, readAlsTempo, writeAlsTempo, listSamples, listPlugins, rewriteSamplePaths } from '../index.js';

function session(content = '', events = '<FloatEvent Id="0" Time="-63072000" Value="120"/>', version = '12.0_12120'): string {
  return `<?xml version="1.0"?><!--😀--><Ableton MajorVersion="5" MinorVersion="${version}" Creator="Ableton Live 12.1"><LiveSet><MainTrack><DeviceChain><Mixer><Tempo><Manual Value='120'/><AutomationTarget Id="42"/></Tempo></Mixer></DeviceChain><AutomationEnvelopes><Envelopes><AutomationEnvelope><EnvelopeTarget><PointeeId Value="42"/></EnvelopeTarget><Automation><Events>${events}</Events></Automation></AutomationEnvelope></Envelopes></AutomationEnvelopes></MainTrack>${content}<Unknown State="&amp;">DEADBEEF</Unknown></LiveSet></Ableton>`;
}
function sample(p = '/audio/a&amp;b.wav'): string {
  return `<SampleRef><FileRef><RelativePathType Value="3"/><RelativePath Value="Samples/a&amp;b.wav"/><Path Value="${p}"/><Type Value="1"/><LivePackName Value=""/><LivePackId Value=""/><OriginalFileSize Value="123"/><OriginalCrc Value="456"/></FileRef></SampleRef>`;
}
const parsed = (s: string) => parseAls(gzipSync(s));

describe('ALS container, semantic reads and immutable handles', () => {
  it('reads version and tempo, and preserves gzip metadata and original XML exactly', () => {
    const bytes = gzipSync(session(), { level: 1 });
    const p = parseAls(bytes);
    expect(getAlsVersion(p)).toBe('12.1');
    expect(p.formatVersion).toBe('12.0_12120');
    expect(readAlsTempo(p)).toEqual({ bpm: 120, automation: 'none' });
    expect(serializeAls(p)).toEqual(bytes);
    bytes.fill(0);
    const copy = serializeAls(p); copy.fill(0);
    expect(gunzipSync(serializeAls(p)).toString()).toBe(session());
    expect(() => serializeAls({ ...p })).toThrow('handle');
  });
  it('retains occurrences, decodes entities and reports unknown references', () => {
    const p = parsed(session(sample() + sample() + '<SampleRef><FileRef><Name Value="legacy.wav"/><Data>ABCD</Data></FileRef></SampleRef>'));
    const refs = listSamples(p);
    expect(refs).toHaveLength(3);
    expect(refs[0]?.path).toBe('/audio/a&b.wav');
    expect(refs[1]?.referenceIndex).toBe(1);
    expect(refs[2]?.supported).toBe(false);
    refs[0]!.path = 'changed';
    expect(listSamples(p)[0]?.path).toBe('/audio/a&b.wav');
  });
  it('lists nested external devices, retaining unknown plugin descriptors', () => {
    const p = parsed(session('<Tracks><MidiTrack><DeviceChain><Devices><Rack><Chains><Chain><Devices><PluginDevice Id="7"><PluginDesc><VstPluginInfo><PlugName Value="Test &amp; synth"/></VstPluginInfo></PluginDesc></PluginDevice><PluginDevice Id="8"><PluginDesc><Vst3PluginInfo><Name Value="Test 3"/></Vst3PluginInfo></PluginDesc></PluginDevice><PluginDevice Id="9"><PluginDesc><Unknown/></PluginDesc></PluginDevice></Devices></Chain></Chains></Rack></Devices></DeviceChain></MidiTrack></Tracks>'));
    expect(listPlugins(p).map((x) => [x.format, x.name])).toEqual([['vst2', 'Test & synth'], ['vst3', 'Test 3'], ['unknown', null]]);
  });
  it.each(['<Ableton/>', '<Other><LiveSet/></Other>', '<Ableton><LiveSet/><LiveSet/></Ableton>', '<Ableton><LiveSet></Ableton>', '<!DOCTYPE Ableton [<!ENTITY secret SYSTEM "file:///private">]><Ableton><LiveSet/></Ableton>', '<Ableton><LiveSet>&undefined;</LiveSet></Ableton>'])('rejects invalid or unsupported XML safely', (xml) => {
    expect(() => parsed(xml)).toThrow();
    try { parsed(xml); } catch (e) { expect(String(e)).not.toContain('file:///private'); }
  });
  it('enforces element, depth and attribute limits', () => {
    const bytes = gzipSync(session());
    for (const limits of [{ maxDepth: 2 }, { maxElements: 3 }, { maxAttributesPerElement: 1 }]) expect(() => parseAls(bytes, limits)).toThrow('limit');
    expect(() => parseAls(bytes, { maxDepth: 0 })).toThrow(RangeError);
  });
  it('keeps absent tempo unavailable and unknown versions read-only', () => {
    expect(readAlsTempo(parsed('<Ableton><LiveSet/></Ableton>'))).toEqual({ bpm: null, automation: 'unknown' });
    const p = parsed(session(sample(), '', '99.0'));
    expect(p.writable).toBe(false);
    expect(() => writeAlsTempo(p, 130)).toThrow('schema');
    expect(() => rewriteSamplePaths(p, () => '/other.wav')).toThrow('writing');
  });
});

describe('conservative writers', () => {
  it('changes manual tempo and the default event only, including Unicode before the edit', () => {
    const xml = session(sample());
    const original = parsed(xml);
    const edited = writeAlsTempo(original, 137.25);
    const expected = xml.replace("Value='120'", "Value='137.25'").replace('Value="120"', 'Value="137.25"');
    expect(gunzipSync(serializeAls(edited)).toString()).toBe(expected);
    expect(readAlsTempo(edited)).toEqual({ bpm: 137.25, automation: 'none' });
    expect(gunzipSync(serializeAls(original)).toString()).toBe(xml);
    expect(writeAlsTempo(original, 120)).toBe(original);
  });
  it.each([NaN, Infinity, 19, 1000])('rejects invalid BPM %s', (bpm) => {
    expect(() => writeAlsTempo(parsed(session()), bpm)).toThrow(RangeError);
  });
  it.each([
    '<FloatEvent Time="-1" Value="120"/><FloatEvent Time="4" Value="130"/>',
    '<FloatEvent Time="0" Value="120"/>',
    '<FloatEvent Time="-1" Value="121"/>',
    '<Unknown/>',
  ])('refuses automated or uncertain tempo', (events) => {
    expect(() => writeAlsTempo(parsed(session('', events)), 130)).toThrow('automation');
  });
  it('refuses missing or duplicated automation targets and containers', () => {
    const xml = session();
    expect(() => writeAlsTempo(parsed(xml.replace('<AutomationTarget Id="42"/>', '')), 130)).toThrow();
    expect(() => writeAlsTempo(parsed(xml.replace('<Manual Value=\'120\'/>', '<Manual Value="120"/><Manual Value="120"/>')), 130)).toThrow();
  });
  it('relocates all occurrences and clears stale relative hints without changing other data', () => {
    const xml = session(sample() + sample());
    const original = parsed(xml);
    const edited = rewriteSamplePaths(original, () => '/new/é & "x".wav');
    const expected = xml.replaceAll('RelativePathType Value="3"', 'RelativePathType Value="0"')
      .replaceAll('RelativePath Value="Samples/a&amp;b.wav"', 'RelativePath Value=""')
      .replaceAll('Path Value="/audio/a&amp;b.wav"', 'Path Value="/new/é &amp; &quot;x&quot;.wav"');
    expect(gunzipSync(serializeAls(edited)).toString()).toBe(expected);
    expect(listSamples(edited).every((x) => x.path === '/new/é & "x".wav')).toBe(true);
    expect(serializeAls(original)).toEqual(serializeAls(parsed(xml)));
    expect(rewriteSamplePaths(original, (p) => p)).toBe(original);
  });
  it('rejects unsafe or unknown reference writes atomically', () => {
    for (const content of [sample().replace('</FileRef>', '<Alias>FF</Alias></FileRef>'), '<SampleRef><FileRef><Name Value="a.wav"/></FileRef></SampleRef>']) {
      const p = parsed(session(sample() + content));
      const before = serializeAls(p);
      expect(() => rewriteSamplePaths(p, () => '/new.wav')).toThrow();
      expect(serializeAls(p)).toEqual(before);
    }
    for (const destination of ['relative.wav', 'C:relative.wav', '/nul\0.wav']) expect(() => rewriteSamplePaths(parsed(session(sample())), () => destination)).toThrow();
  });
  it('handles a Value-looking string in another attribute and chunked large text', () => {
    const xml = session().replace("<Manual Value='120'/>", '<Manual Other=" Value=\'bogus\'" Value="120"/>').replace('DEADBEEF', '😀'.repeat(70000));
    const result = writeAlsTempo(parsed(xml), 130);
    expect(gunzipSync(serializeAls(result)).toString()).toBe(xml.replaceAll('Value="120"', 'Value="130"'));
  });
});

it('retains empty SampleRef occurrences as unsupported and preserves a UTF-8 BOM', () => {
  const xml = '\ufeff' + session('<SampleRef/>');
  const p = parsed(xml);
  expect(listSamples(p)).toHaveLength(1);
  expect(listSamples(p)[0]?.supported).toBe(false);
  expect(gunzipSync(serializeAls(writeAlsTempo(p, 140))).toString().startsWith('\ufeff')).toBe(true);
});
