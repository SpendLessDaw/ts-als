import path from 'node:path';
import * as fs from 'node:fs/promises';

export interface SampleInspectionOptions {
  mode?: 'resolve' | 'check';
  projectPath?: string;
  projectRoot?: string;
  /** Explicit roots for DAW-specific relative reference types. */
  relativeRoots?: Readonly<Record<string, string>>;
  /** Recursive discovery only; basename matches never establish media identity. */
  searchRoots?: readonly string[];
  signal?: AbortSignal;
  concurrency?: number;
  maxSearchEntries?: number;
}
export type SampleStatus = 'unchecked' | 'found' | 'missing' | 'unresolved' | 'ambiguous' | 'inaccessible';
export interface SampleCandidate {
  path: string;
  source: 'declared' | 'relative' | 'search';
  confidence: 'exact' | 'name-only';
}
export interface SampleInspection {
  referenceIndex: number;
  recordedPath: string;
  pathType: 'posix' | 'windows' | 'relative' | 'daw' | 'unknown';
  relativePath: string | null;
  candidates: SampleCandidate[];
  resolvedPath: string | null;
  status: SampleStatus;
  reason: string | null;
}
export interface InspectionReference {
  referenceIndex: number;
  path: string;
  relativePath?: string | null;
  relativeType?: string | null;
  /** FL references resolve beside the project. ALS bases must be explicit. */
  relativeBase: 'project-file' | 'daw';
  supported?: boolean;
}

function pathType(p: string): SampleInspection['pathType'] {
  if (!p || Array.from(p).some((c) => c.charCodeAt(0) < 32)) return 'unknown';
  if (/^[A-Za-z]:/.test(p) || p.startsWith('\\')) return 'windows';
  if (p.startsWith('/')) return 'posix';
  if (/^[A-Za-z][\w+.-]*:/.test(p) || /[%$]/.test(p)) return 'daw';
  return 'relative';
}
function nativeAbsolute(p: string): boolean {
  const kind = pathType(p);
  return process.platform === 'win32'
    ? kind === 'windows' && path.win32.isAbsolute(p) && !/^[\\/][^\\/]/.test(p)
    : kind === 'posix';
}
function localRelative(p: string): boolean {
  return pathType(p) === 'relative';
}
function abort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) { const e = new Error('Sample inspection aborted'); e.name = 'AbortError'; throw e; }
}

/** Internal implementation duplicated deliberately until a future multi-DAW library exists. */
export async function inspectReferences(refs: readonly InspectionReference[], options: SampleInspectionOptions = {}): Promise<SampleInspection[]> {
  const mode = options.mode ?? 'resolve';
  if (mode !== 'resolve' && mode !== 'check') throw new TypeError('Unknown sample inspection mode');
  const concurrency = options.concurrency ?? 8;
  const maxEntries = options.maxSearchEntries ?? 100_000;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new RangeError('Concurrency must be between 1 and 64');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError('Search limit must be a positive safe integer');
  for (const p of [options.projectPath, options.projectRoot, ...Object.values(options.relativeRoots ?? {}), ...(options.searchRoots ?? [])]) {
    if (p !== undefined && !nativeAbsolute(p)) throw new TypeError('Inspection context paths must be native absolute paths');
  }
  abort(options.signal);
  const results: SampleInspection[] = refs.map((ref) => {
    const kind = pathType(ref.path);
    const candidates: SampleCandidate[] = [];
    const add = (p: string, source: SampleCandidate['source']) => {
      const normalized = path.normalize(p);
      if (!candidates.some((c) => c.path === normalized)) candidates.push({ path: normalized, source, confidence: 'exact' });
    };
    if (ref.supported !== false) {
      if (nativeAbsolute(ref.path)) add(ref.path, 'declared');
      const base = ref.relativeBase === 'project-file'
        ? options.projectRoot ?? (options.projectPath ? path.dirname(options.projectPath) : undefined)
        : options.relativeRoots?.[ref.relativeType ?? ''] ?? (ref.relativeType === '3' ? options.projectRoot : undefined);
      const relative = ref.relativePath || (kind === 'relative' ? ref.path : null);
      if (base && relative && localRelative(relative)) add(path.resolve(base, relative.replace(/\\/g, path.sep)), 'relative');
    }
    return { referenceIndex: ref.referenceIndex, recordedPath: ref.path, pathType: ref.supported === false ? 'unknown' : kind,
      relativePath: ref.relativePath ?? (kind === 'relative' ? ref.path : null), candidates, resolvedPath: null,
      status: candidates.length ? 'unchecked' : 'unresolved', reason: candidates.length ? null : 'No interpretable path in the supplied context' };
  });
  if (mode === 'resolve') return results;

  const checks = new Map<string, Promise<'file' | 'absent' | 'inaccessible'>>();
  const check = (p: string) => {
    let pending = checks.get(p);
    if (!pending) {
      pending = fs.stat(p).then((s) => s.isFile() ? 'file' as const : 'absent' as const, (e: { code?: string }) =>
        e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 'absent' as const : 'inaccessible' as const);
      checks.set(p, pending);
    }
    return pending;
  };
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, results.length) }, async () => {
    while (index < results.length) {
      abort(options.signal);
      const result = results[index++]!;
      const found: string[] = [];
      let inaccessible = false;
      for (const candidate of result.candidates) {
        abort(options.signal);
        const status = await check(candidate.path);
        if (status === 'file') found.push(candidate.path);
        if (status === 'inaccessible') inaccessible = true;
      }
      result.status = found.length > 1 ? 'ambiguous' : found.length === 1 ? 'found'
        : inaccessible ? 'inaccessible' : result.candidates.length ? 'missing' : 'unresolved';
      result.resolvedPath = result.status === 'found' ? found[0]! : null;
      if (result.status === 'inaccessible') result.reason = 'A candidate could not be checked';
    }
  }));
  abort(options.signal);
  // Index requested roots once. No symlink-directory traversal and no implicit broad search.
  const unresolved = results.filter((r) => r.status !== 'found');
  if (unresolved.length && options.searchRoots?.length) {
    const names = new Map<string, string[]>();
    const needed = new Set(unresolved.map((r) => path.posix.basename(r.recordedPath.replace(/\\/g, '/')).normalize('NFC').toLowerCase()));
    const queue = [...new Set(options.searchRoots.map((r) => path.normalize(r)))];
    const visited = new Set<string>();
    let entries = 0;
    let incomplete = false;
    while (queue.length) {
      abort(options.signal);
      const directory = queue.pop()!;
      if (visited.has(directory)) continue;
      visited.add(directory);
      try {
        const handle = await fs.opendir(directory);
        for await (const entry of handle) {
          abort(options.signal);
          if (++entries > maxEntries) throw new RangeError('Sample search entry limit exceeded');
          const p = path.join(directory, entry.name);
          if (entry.isDirectory()) queue.push(p);
          else if (entry.isFile()) {
            const name = entry.name.normalize('NFC').toLowerCase();
            if (needed.has(name)) names.set(name, [...(names.get(name) ?? []), p]);
          }
        }
      } catch (e) {
        if (e instanceof RangeError || (e instanceof Error && e.name === 'AbortError')) throw e;
        incomplete = true;
      }
    }
    for (const result of unresolved) {
      const name = path.posix.basename(result.recordedPath.replace(/\\/g, '/')).normalize('NFC').toLowerCase();
      const matches = names.get(name) ?? [];
      for (const p of matches) if (!result.candidates.some((c) => c.path === p)) result.candidates.push({ path: p, source: 'search', confidence: 'name-only' });
      if (result.status === 'ambiguous') continue;
      if (matches.length) {
        result.status = matches.length > 1 ? 'ambiguous' : 'unresolved';
        result.reason = 'Name-only candidates require caller confirmation';
      } else if (incomplete && result.status !== 'inaccessible') {
        result.status = 'inaccessible'; result.reason = 'Search could not inspect every requested directory';
      }
    }
  }
  abort(options.signal);
  return results;
}
