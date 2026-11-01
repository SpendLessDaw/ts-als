import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { copySamples, parseAls, serializeAls, rewriteSamplePaths, listSamples } from '../index.js';
import { buildAliasRecord } from '../src/samples/buildAliasRecord.js';
import { readAliasPath } from '../src/samples/readAliasPath.js';
vi.mock('node:fs/promises', async (original) => ({ ...await original<typeof import('node:fs/promises')>() }));
const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function ref(source: string, legacy = false): string {
  return legacy
    ? `<SampleRef><FileRef Id="5"><HasRelativePath Value="false"/><RelativePathType Value="0"/><RelativePath/><Name Value="${escape(path.basename(source))}"/><Type Value="2"/><Data>${source.startsWith('/') ? buildAliasRecord(source) : ''}</Data><RefersToFolder Value="false"/><SearchHint><PathHint/><FileSize Value="8"/><Crc Value="456"/></SearchHint><LivePackName Value="Pack"/><LivePackId Value="12"/><Unknown Keep="yes"/></FileRef></SampleRef>`
    : `<SampleRef><FileRef><Path Value="${escape(source)}"/><RelativePathType Value="6"/><RelativePath Value="Samples/kick.wav"/><Type Value="2"/><LivePackName Value="Pack"/><LivePackId Value="12"/><OriginalFileSize Value="8"/><OriginalCrc Value="456"/></FileRef></SampleRef>`;
}
function session(content: string, version = 10): string {
  return `<Ableton MajorVersion="5" MinorVersion="${version}.0_377" Creator="Ableton Live ${version}.1"><LiveSet><Unknown>PLUGINSTATE</Unknown>${content}</LiveSet></Ableton>`;
}
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'als-copy-')); directories.push(root);
  const source = path.join(root, 'original', 'kick.wav'); await mkdir(path.dirname(source)); await writeFile(source, 'audio123');
  return { root, source, destinationDirectory: path.join(root, 'copies') };
}
it.each(['/Audio/é & 🎵.wav', '/Volumes/Media/Samples/é & 🎵.wav', 'D:\\Samples\\kick.wav', '\\\\server\\share\\kick.wav'])('rewrites legacy references coherently to %s', (destination) => {
  const xml = session(ref('/Audio/kick.wav', true)); const p = parseAls(gzipSync(xml));
  const changed = rewriteSamplePaths(p, () => destination);
  const sample = listSamples(changed)[0]!;
  expect(sample.absolutePath).toBe(destination); expect(sample.relativePath).toBeNull();
  const output = gunzipSync(serializeAls(changed)).toString();
  expect(output).toContain('<Unknown>PLUGINSTATE</Unknown>');
  expect(output).toContain('<Unknown Keep="yes"/>');
  expect(output).toContain('<FileSize Value="8"/><Crc Value="456"/>');
  expect(output).toContain('<LivePackName Value=""/>');
  expect(output).not.toContain('Pack"');
  expect(serializeAls(p)).toEqual(gzipSync(xml));
});
it('encodes Unicode alias names including surrogate pairs in UTF-16BE', () => {
  const bytes = Buffer.from(buildAliasRecord('/Audio/🎵.wav'), 'hex');
  expect(readAliasPath(bytes.toString('hex'))).toBe('/Audio/🎵.wav');
  let offset = 150;
  while (bytes.readUInt16BE(offset) !== 14) offset += 4 + bytes.readUInt16BE(offset + 2) + bytes.readUInt16BE(offset + 2) % 2;
  const length = bytes.readUInt16BE(offset + 2);
  expect(bytes.readUInt16BE(offset + 4)).toBe('🎵.wav'.length);
  expect(Buffer.from(bytes.subarray(offset + 6, offset + 4 + length)).swap16().toString('utf16le')).toBe('🎵.wav');
});
it.each([10, 11, 12])('copies media for Live %i and deduplicates occurrences without moving originals', async (version) => {
  const f = await fixture(); const legacy = version === 10;
  const p = parseAls(gzipSync(session(ref(f.source, legacy) + ref(f.source, legacy), version)));
  const before = serializeAls(p);
  const result = await copySamples(p, { destinationDirectory: f.destinationDirectory, sources: { 0: f.source, 1: f.source } });
  expect(result.copies).toHaveLength(1); expect(result.copies[0]?.referenceIndexes).toEqual([0, 1]);
  expect(await readFile(f.source, 'utf8')).toBe('audio123');
  expect(await readFile(result.copies[0]!.destinationPath, 'utf8')).toBe('audio123');
  expect(listSamples(result.parsed).every((s) => s.absolutePath === result.copies[0]!.destinationPath)).toBe(true);
  expect(serializeAls(p)).toEqual(before);
  expect(await readdir(f.destinationDirectory)).toHaveLength(1);
});
it('does not overwrite existing files or conflate homonymous source files', async () => {
  const f = await fixture(); const other = path.join(f.root, 'other', 'kick.wav');
  await mkdir(path.dirname(other)); await writeFile(other, 'different');
  await mkdir(f.destinationDirectory); await writeFile(path.join(f.destinationDirectory, 'kick.wav'), 'keep');
  const p = parseAls(gzipSync(session(ref(f.source) + ref(other), 12)));
  const result = await copySamples(p, { destinationDirectory: f.destinationDirectory });
  expect(new Set(result.copies.map((c) => c.destinationPath)).size).toBe(2);
  expect(await readFile(path.join(f.destinationDirectory, 'kick.wav'), 'utf8')).toBe('keep');
  expect(await Promise.all(result.copies.map((c) => readFile(c.destinationPath, 'utf8')))).toEqual(['audio123', 'different']);
});
it('refuses unresolved samples before copying, or explicitly skips them', async () => {
  const f = await fixture(); const missing = path.join(f.root, 'missing.wav');
  const p = parseAls(gzipSync(session(ref(f.source) + ref(missing), 12)));
  await expect(copySamples(p, { destinationDirectory: f.destinationDirectory })).rejects.toThrow('explicit source');
  await expect(fs.stat(f.destinationDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  const result = await copySamples(p, { destinationDirectory: f.destinationDirectory, onMissing: 'skip' });
  expect(result.copies).toHaveLength(1); expect(result.skipped).toHaveLength(1);
  expect(listSamples(result.parsed)[1]?.absolutePath).toBe(missing);
});
it('preflights unwritable references before creating the destination', async () => {
  const f = await fixture(); const p = parseAls(gzipSync(session(ref(f.source)).replace('MajorVersion="5"', 'MajorVersion="99"')));
  await expect(copySamples(p, { destinationDirectory: f.destinationDirectory })).rejects.toThrow('writing');
  await expect(fs.stat(f.destinationDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('cancels and cleans up only files created by this call', async () => {
  const f = await fixture(); await mkdir(f.destinationDirectory); await writeFile(path.join(f.destinationDirectory, 'keep.wav'), 'keep');
  const controller = new AbortController(); const actual = fs.copyFile;
  const spy = vi.spyOn(fs, 'copyFile').mockImplementation(async (...args) => {
    await actual(...args); if (spy.mock.calls.length === 2) controller.abort();
  });
  const p = parseAls(gzipSync(session(ref(f.source), 12)));
  await expect(copySamples(p, { destinationDirectory: f.destinationDirectory, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(await readdir(f.destinationDirectory)).toEqual(['keep.wav']);
  expect(await readFile(f.source, 'utf8')).toBe('audio123');
});
it('retries a destination race without overwriting the competing file', async () => {
  const f = await fixture(); const actual = fs.copyFile; let raced = false;
  vi.spyOn(fs, 'copyFile').mockImplementation(async (...args) => {
    if (path.basename(String(args[1])) === 'kick.wav' && !raced) { raced = true; await writeFile(args[1], 'competitor'); }
    return actual(...args);
  });
  const result = await copySamples(parseAls(gzipSync(session(ref(f.source), 12))), { destinationDirectory: f.destinationDirectory });
  expect(await readFile(path.join(f.destinationDirectory, 'kick.wav'), 'utf8')).toBe('competitor');
  expect(await readFile(result.copies[0]!.destinationPath, 'utf8')).toBe('audio123');
  expect(listSamples(result.parsed)[0]?.absolutePath).toBe(result.copies[0]!.destinationPath);
});
it('rejects relative destinations and already aborted calls without mutation', async () => {
  const f = await fixture(); const p = parseAls(gzipSync(session(ref(f.source), 12)));
  await expect(copySamples(p, { destinationDirectory: 'relative' })).rejects.toThrow('absolute');
  await expect(copySamples(p, { destinationDirectory: f.destinationDirectory, signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
  await expect(fs.stat(f.destinationDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('cleans previously copied files if a later source changes during the operation', async () => {
  const f = await fixture(); const other = path.join(f.root, 'second.wav'); await writeFile(other, 'second');
  const actual = fs.copyFile;
  vi.spyOn(fs, 'copyFile').mockImplementation(async (...args) => {
    await actual(...args);
    if (String(args[0]).endsWith('second.wav')) await writeFile(other, 'changed source');
  });
  const p = parseAls(gzipSync(session(ref(f.source) + ref(other), 12)));
  await expect(copySamples(p, { destinationDirectory: f.destinationDirectory })).rejects.toThrow('source changed');
  expect(await readdir(f.destinationDirectory)).toEqual([]);
  expect(await readFile(f.source, 'utf8')).toBe('audio123');
});
it('requires caller confirmation for basename-only search matches', async () => {
  const f = await fixture(); const p = parseAls(gzipSync(session(ref(path.join(f.root, 'absent', 'kick.wav')), 12)));
  await expect(copySamples(p, { destinationDirectory: f.destinationDirectory, searchRoots: [path.dirname(f.source)] })).rejects.toThrow('explicit source');
  const result = await copySamples(p, { destinationDirectory: f.destinationDirectory, sources: { 0: f.source } });
  expect(await readFile(result.copies[0]!.destinationPath, 'utf8')).toBe('audio123');
});
it('preserves all XML outside path-bearing legacy fields', () => {
  const xml = session(ref('/Audio/kick.wav', true));
  const changed = gunzipSync(serializeAls(rewriteSamplePaths(parseAls(gzipSync(xml)), () => '/Volumes/Media/new.wav'))).toString();
  const mask = (text: string) => text.replace(/<(Name|HasRelativePath|RelativePathType|Type|RefersToFolder|LivePackName|LivePackId)\b[^>]*\/>|<(RelativePath|Data|PathHint)\b[^>]*\/>|<(RelativePath|Data|PathHint)\b[^>]*>[\s\S]*?<\/\3>/g, (match: string) => '<' + /^<(\w+)/.exec(match)![1] + '>MASK</>');
  expect(mask(changed)).toBe(mask(xml));
});
