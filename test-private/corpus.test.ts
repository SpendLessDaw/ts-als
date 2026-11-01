import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { decodeAlsContainer, parseAls, serializeAls, listSamples, readAlsTempo, writeAlsTempo, rewriteSamplePaths } from '../index.js';
import { spawnSync } from 'node:child_process';

const directory = fileURLToPath(new URL('../test_projs/', import.meta.url));
const manifest: { fixtures: { id: string; sha256: string; xmlBytes: number }[] } =
  JSON.parse(readFileSync(join(directory, 'manifest.private.json'), 'utf8'));

it('has all six reference fixtures', () => expect(manifest.fixtures).toHaveLength(6));
for (const fixture of manifest.fixtures) {
  it(`decodes ${fixture.id} without changing its bytes`, () => {
    if (!/^fixture-\d{2}$/.test(fixture.id)) throw new Error('Invalid fixture identifier');
    const path = join(directory, `${fixture.id}.als`);
    const bytes = readFileSync(path);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
    const xml = decodeAlsContainer(bytes);
    expect(Buffer.byteLength(xml)).toBe(fixture.xmlBytes);
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(fixture.sha256);
  });
}

for (const fixture of manifest.fixtures) {
  it(`semantically reads and conservatively patches ${fixture.id}`, () => {
    if (!/^fixture-\d{2}$/.test(fixture.id)) throw new Error('Invalid fixture identifier');
    const path = join(directory, `${fixture.id}.als`);
    const bytes = readFileSync(path);
    const parsed = parseAls(bytes);
    const refs = listSamples(parsed);
    const oracle = spawnSync('python3', [fileURLToPath(new URL('./oracle.py', import.meta.url))], { input: bytes, maxBuffer: 4096 });
    if (oracle.status !== 0) throw new Error('Independent XML oracle failed');
    const expected = JSON.parse(oracle.stdout.toString()) as { digest: string; tempo: number | null };
    const digest = createHash('sha256').update(JSON.stringify([parsed.creator, parsed.formatVersion,
      refs.map((s) => [s.absolutePath, s.relativePath, s.relativePathType])])).digest('hex');
    expect(digest === expected.digest).toBe(true);
    expect(readAlsTempo(parsed).bpm === expected.tempo).toBe(true);
    expect(serializeAls(parsed).equals(bytes)).toBe(true);
    expect(refs.length > 0).toBe(true);
    if (readAlsTempo(parsed).automation === 'none') {
      const changed = writeAlsTempo(parsed, 123.456);
      expect(readAlsTempo(changed).bpm === 123.456).toBe(true);
      expect(serializeAls(parseAls(serializeAls(changed))).equals(serializeAls(changed))).toBe(true);
    } else {
      expect(() => writeAlsTempo(parsed, 123.456)).toThrow();
    }
    // In-memory only: relocate one supported reference without accessing sample files.
    const target = refs.find((s) => s.writable);
    expect(Boolean(target)).toBe(true);
    const relocated = rewriteSamplePaths(parsed, (old, ref) => ref.referenceIndex === target!.referenceIndex ? '/synthetic-relocation/sample.wav' : old);
    expect(listSamples(relocated)[target!.referenceIndex]?.path === '/synthetic-relocation/sample.wav').toBe(true);
    expect(serializeAls(parsed).equals(bytes)).toBe(true);
    expect(createHash('sha256').update(readFileSync(path)).digest('hex') === fixture.sha256).toBe(true);
  });
}
