import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import sources from './sources.json' with { type: 'json' };
import { parseAls, serializeAls, listSamples, listPlugins, readAlsTempo, writeAlsTempo, rewriteSamplePaths } from '../index.js';
for (const fixture of sources) {
  it(`${fixture.id}: ${fixture.creator} reads, roundtrips and patches recognized fields`, () => {
    const bytes = readFileSync(new URL(`../.cache/public-als/${fixture.file}`, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
    const p = parseAls(bytes); const refs = listSamples(p);
    expect(p.creator).toBe(fixture.creator); expect(p.formatVersion).toBe(fixture.format);
    expect(refs.length).toBe(fixture.samples); expect(listPlugins(p).length).toBe(fixture.plugins);
    // Compare to Python ElementTree extraction; assertions never print sample paths.
    expect(createHash('sha256').update(JSON.stringify(refs.map((r) => r.absolutePath))).digest('hex')).toBe(fixture.absolutePathsSha256);
    expect(readAlsTempo(p).bpm).toBe(fixture.bpm);
    expect(serializeAls(p).equals(bytes)).toBe(true);
    if (readAlsTempo(p).automation === 'none') expect(readAlsTempo(writeAlsTempo(p, 123.456)).bpm).toBe(123.456);
    else expect(() => writeAlsTempo(p, 123.456)).toThrow('automation');
    const writable = refs.find((r) => r.writable);
    if (writable) {
      const edited = rewriteSamplePaths(p, (old, ref) => ref.referenceIndex === writable.referenceIndex ? '/synthetic/sample.wav' : old);
      expect(listSamples(edited)[writable.referenceIndex]?.path === '/synthetic/sample.wav').toBe(true);
    }
    expect(serializeAls(p).equals(bytes)).toBe(true);
  });
}
