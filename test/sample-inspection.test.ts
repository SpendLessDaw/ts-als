import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectReferences } from '../src/samples/inspectReferences.js';
vi.mock('node:fs/promises', async (original) => ({ ...await original<typeof import('node:fs/promises')>() }));
const dirs: string[] = [];
async function directory() { const dir = await mkdtemp(path.join(os.tmpdir(), 'sample-inspection-')); dirs.push(dir); return dir; }
const ref = (p: string, index = 0) => ({ referenceIndex: index, path: p, relativeBase: 'project-file' as const });
afterEach(async () => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

describe('sample inspection contract', () => {
  it('resolves paths without disk access and preserves recorded references', async () => {
    const stat = vi.spyOn(fs, 'stat'); const opendir = vi.spyOn(fs, 'opendir');
    const base = path.resolve(os.tmpdir(), 'project');
    const results = await inspectReferences([ref('Samples\\kick.wav'), ref('relative.wav', 1)], { mode: 'resolve', projectPath: path.join(base, 'song.flp'), searchRoots: [base] });
    expect(results[0]?.candidates[0]?.path).toBe(path.join(base, 'Samples', 'kick.wav'));
    expect(results[0]?.recordedPath).toBe('Samples\\kick.wav');
    expect(results.every((r) => r.status === 'unchecked' && r.resolvedPath === null)).toBe(true);
    expect(stat).not.toHaveBeenCalled(); expect(opendir).not.toHaveBeenCalled();
  });
  it('requires context and never resolves from cwd', async () => {
    expect((await inspectReferences([ref('a.wav')]))[0]?.status).toBe('unresolved');
    await expect(inspectReferences([], { projectPath: 'relative.flp' })).rejects.toThrow('absolute');
  });
  it('does not stat a foreign Windows path on POSIX', async () => {
    if (process.platform === 'win32') return;
    const stat = vi.spyOn(fs, 'stat');
    const results = await inspectReferences([ref('C:\\Samples\\a.wav'), ref('\\\\host\\share\\a.wav')], { mode: 'check' });
    expect(results.map((r) => r.status)).toEqual(['unresolved', 'unresolved']);
    expect(stat).not.toHaveBeenCalled();
  });
  it('checks files, preserves occurrences and caches only within one call', async () => {
    const dir = await directory(); const file = path.join(dir, 'a.wav'); await writeFile(file, 'synthetic');
    const stat = vi.spyOn(fs, 'stat');
    const results = await inspectReferences([ref(file), ref(file, 1), ref(path.join(dir, 'absent.wav'), 2), ref(dir, 3)], { mode: 'check' });
    expect(results.map((r) => r.status)).toEqual(['found', 'found', 'missing', 'missing']);
    expect(stat).toHaveBeenCalledTimes(3);
    await rm(file);
    expect((await inspectReferences([ref(file)], { mode: 'check' }))[0]?.status).toBe('missing');
  });
  it('reports inaccessible separately from missing', async () => {
    vi.spyOn(fs, 'stat').mockRejectedValue(Object.assign(new Error('private path'), { code: 'EACCES' }));
    const result = await inspectReferences([ref(path.join(os.tmpdir(), 'denied.wav'))], { mode: 'check' });
    expect(result[0]?.status).toBe('inaccessible');
    expect(JSON.stringify(result)).not.toContain('private path');
  });
  it('does not choose between existing absolute and relative candidates', async () => {
    const dir = await directory(); const file = path.join(dir, 'a.wav'); const alternate = path.join(dir, 'b.wav');
    await writeFile(file, 'a'); await writeFile(alternate, 'b');
    const result = await inspectReferences([{ ...ref(file), relativePath: 'b.wav' }], { mode: 'check', projectRoot: dir });
    expect(result[0]?.status).toBe('ambiguous'); expect(result[0]?.resolvedPath).toBeNull();
  });
  it('indexes explicit roots only, without equating name-only matches with the original', async () => {
    const dir = await directory(); await mkdir(path.join(dir, 'nested')); await writeFile(path.join(dir, 'nested', 'a.wav'), 'a');
    const [result] = await inspectReferences([ref(path.join(dir, 'old', 'a.wav'))], { mode: 'check', searchRoots: [dir] });
    expect(result?.status).toBe('unresolved'); expect(result?.candidates.at(-1)?.confidence).toBe('name-only');
    await writeFile(path.join(dir, 'a.wav'), 'b');
    expect((await inspectReferences([ref('a.wav')], { mode: 'check', searchRoots: [dir] }))[0]?.status).toBe('ambiguous');
    await expect(inspectReferences([ref('a.wav')], { mode: 'check', searchRoots: [dir], maxSearchEntries: 1 })).rejects.toThrow('limit');
  });
  it('uses explicit DAW roots and keeps unknown bases unresolved', async () => {
    const base = path.resolve(os.tmpdir());
    const r = { ...ref(''), relativeBase: 'daw' as const, relativePath: 'sample.wav', relativeType: '7' };
    expect((await inspectReferences([r], { projectRoot: base }))[0]?.status).toBe('unresolved');
    expect((await inspectReferences([r], { relativeRoots: { '7': base } }))[0]?.candidates[0]?.path).toBe(path.join(base, 'sample.wav'));
    expect((await inspectReferences([{ ...r, supported: false }], { relativeRoots: { '7': base } }))[0]?.status).toBe('unresolved');
  });
  it('supports preflight and in-flight cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(inspectReferences([], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const live = new AbortController();
    vi.spyOn(fs, 'stat').mockImplementation(async () => { live.abort(); throw Object.assign(new Error(), { code: 'ENOENT' }); });
    await expect(inspectReferences([ref(path.join(os.tmpdir(), 'a.wav'))], { mode: 'check', signal: live.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

it('bounds filesystem concurrency even across many different references', async () => {
  let active = 0; let maximum = 0;
  vi.spyOn(fs, 'stat').mockImplementation(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2)); active--;
    throw Object.assign(new Error(), { code: 'ENOENT' });
  });
  await inspectReferences(Array.from({ length: 10 }, (_, i) => ref(path.join(os.tmpdir(), `${i}.wav`), i)), { mode: 'check', concurrency: 2 });
  expect(maximum).toBe(2); expect(active).toBe(0);
});
