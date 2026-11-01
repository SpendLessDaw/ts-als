import path from 'node:path';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import type { ParsedAls } from '../parser/ParsedAls.js';
import type { SampleInspection, SampleInspectionOptions } from '../samples/inspectReferences.js';
import { inspectSamples } from './inspectSamples.js';
import { rewriteSamplePaths, type RewriteSamplePathsOptions } from './rewriteSamplePaths.js';

export interface CopySamplesOptions extends Omit<SampleInspectionOptions, 'mode'>, RewriteSamplePathsOptions {
  destinationDirectory: string;
  /** Explicit caller-approved source file per occurrence; overrides inspection. */
  sources?: Readonly<Record<number, string>>;
  /** Default error: preflight fails before copying if any sample cannot be resolved. */
  onMissing?: 'error' | 'skip';
}
export interface SampleCopy {
  sourcePath: string;
  destinationPath: string;
  referenceIndexes: number[];
}
export interface CopySamplesResult {
  parsed: ParsedAls;
  copies: SampleCopy[];
  skipped: SampleInspection[];
}
function abort(signal?: AbortSignal): void {
  if (signal?.aborted) { const error = new Error('Sample copy aborted'); error.name = 'AbortError'; throw error; }
}
function absolute(p: string): boolean {
  return path.isAbsolute(p) && (process.platform !== 'win32' || /^[A-Za-z]:[\\/]|^\\\\[^\\]+\\[^\\]+/.test(p));
}
function portableName(source: string): string {
  let name = Array.from(path.basename(source), (c) => c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? '_' : c).join('').replace(/[. ]+$/, '');
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  const ext = path.extname(name).slice(0, 24);
  let stem = name.slice(0, name.length - path.extname(name).length);
  while (Buffer.byteLength(stem) > 180) stem = Array.from(stem).slice(0, -1).join('');
  return stem + ext;
}
/** Copy media, never move or overwrite it. Project serialization/saving remains the caller's job.
 * Copies are sequential; cancellation is checked before/after each filesystem copy.
 */
export async function copySamples(parsed: ParsedAls, options: CopySamplesOptions): Promise<CopySamplesResult> {
  if (!absolute(options.destinationDirectory)) throw new TypeError('Copy destination must be a native absolute directory');
  if (options.onMissing !== undefined && options.onMissing !== 'error' && options.onMissing !== 'skip') throw new TypeError('Unknown missing-sample policy');
  abort(options.signal);
  const inspected = await inspectSamples(parsed, { ...options, mode: 'check' });
  for (const index of Object.keys(options.sources ?? {})) {
    if (!/^(0|[1-9]\d*)$/.test(index) || Number(index) >= inspected.length) throw new RangeError('Unknown sample reference index');
  }
  const skipped: SampleInspection[] = [];
  const sources = new Map<string, number[]>();
  for (const sample of inspected) {
    abort(options.signal);
    const override = options.sources?.[sample.referenceIndex];
    const source = override ?? (sample.status === 'found' ? sample.resolvedPath : null);
    if (!source) {
      if (options.onMissing !== 'skip') throw new Error(`Sample ${sample.referenceIndex} requires an explicit source (${sample.status})`);
      skipped.push(sample); continue;
    }
    if (!absolute(source)) throw new TypeError('Copy sources must be native absolute file paths');
    const real = await fs.realpath(source);
    if (!(await fs.stat(real)).isFile()) throw new Error(`Sample ${sample.referenceIndex} is not a regular file`);
    const indexes = sources.get(real) ?? []; indexes.push(sample.referenceIndex); sources.set(real, indexes);
  }
  if (!sources.size) return { parsed, copies: [], skipped };
  const copies: SampleCopy[] = [...sources].map(([sourcePath, referenceIndexes]) => ({ sourcePath, referenceIndexes,
    destinationPath: path.join(options.destinationDirectory, portableName(sourcePath)) }));
  const rewrite = () => {
    const destinations = new Map(copies.flatMap((copy) => copy.referenceIndexes.map((id) => [id, copy.destinationPath] as const)));
    return rewriteSamplePaths(parsed, (old, ref) => destinations.get(ref.referenceIndex) ?? old, options);
  };
  // Validate every reference/alias before any filesystem mutation.
  rewrite(); abort(options.signal);
  await fs.mkdir(options.destinationDirectory, { recursive: true });
  const root = await fs.realpath(options.destinationDirectory);
  const reserved = new Set((await fs.readdir(root)).map((name) => name.normalize('NFC').toLowerCase()));
  const choose = async (copy: SampleCopy): Promise<void> => {
    const name = portableName(copy.sourcePath); const ext = path.extname(name); const stem = name.slice(0, name.length - ext.length);
    for (let n = 1; n <= 10000; n++) {
      abort(options.signal);
      const filename = n === 1 ? name : `${stem}-${n}${ext}`;
      const key = filename.normalize('NFC').toLowerCase();
      if (reserved.has(key)) continue;
      const destination = path.join(root, filename);
      try { await fs.lstat(destination); continue; }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
      copy.destinationPath = destination; reserved.add(key); return;
    }
    throw new Error('Sample destination collision limit exceeded');
  };
  for (const copy of copies) await choose(copy);
  let result = rewrite();
  const staging = await fs.mkdtemp(path.join(root, '.ts-als-copy-'));
  const created: { path: string; ino: bigint; dev: bigint }[] = [];
  try {
    for (const [index, copy] of copies.entries()) {
      abort(options.signal);
      const before = await fs.stat(copy.sourcePath, { bigint: true });
      const temporary = path.join(staging, String(index));
      await fs.copyFile(copy.sourcePath, temporary, constants.COPYFILE_EXCL);
      abort(options.signal);
      const after = await fs.stat(copy.sourcePath, { bigint: true });
      if (!before.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
        throw new Error('Sample source changed during copy');
      for (;;) {
        abort(options.signal);
        try { await fs.copyFile(temporary, copy.destinationPath, constants.COPYFILE_EXCL); break; }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
          await choose(copy); result = rewrite();
        }
      }
      const written = await fs.stat(copy.destinationPath, { bigint: true });
      created.push({ path: copy.destinationPath, ino: written.ino, dev: written.dev });
      await fs.unlink(temporary);
      abort(options.signal);
    }
    return { parsed: result, copies, skipped };
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const file of created) {
      try {
        const current = await fs.lstat(file.path, { bigint: true });
        if (current.ino === file.ino && current.dev === file.dev) await fs.unlink(file.path);
      } catch (cleanup) {
        if (!(cleanup instanceof Error && 'code' in cleanup && cleanup.code === 'ENOENT')) cleanupErrors.push(cleanup);
      }
    }
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], 'Sample copy failed; some created files could not be removed');
    throw error;
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
