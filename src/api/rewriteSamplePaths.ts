import path from 'node:path';
import { rewriteLegacyReference } from '../samples/rewriteLegacyReference.js';
import type { XmlEdit } from '../internal/patchXml.js';
import type { ParsedAls, AlsSampleRef } from '../parser/ParsedAls.js';
import { state, child, type Element } from '../internal/state.js';
import { patchValues } from '../internal/patchValues.js';
export interface RewriteSamplePathsOptions {
  /** Experimental macOS boot-volume alias label; POSIX path tags are always written. */
  macBootVolumeName?: string;
}
/** Relocate the same media; no audio replacement or filesystem access. Writes absolute references. */
export function rewriteSamplePaths(parsed: ParsedAls, mapper: (oldPath: string, ref: AlsSampleRef) => string, options: RewriteSamplePathsOptions = {}): ParsedAls {
  const edits: XmlEdit[] = [];
  const changes: { element: Element; value: string }[] = [];
  for (const { ref, element } of state(parsed).samples) {
    let mapped = mapper(ref.path, { ...ref });
    if (typeof mapped !== 'string') throw new TypeError('Sample mapper must return a string');
    if (mapped === ref.path) continue;
    if (!ref.writable) throw new Error('ALS sample reference is not enabled for writing');
    if ((!path.posix.isAbsolute(mapped) && !/^[A-Za-z]:[\\/]/.test(mapped) && !/^\\\\[^\\]+\\[^\\]+/.test(mapped))
      || Array.from(mapped).some((c) => c.charCodeAt(0) < 32)) throw new Error('Expected an absolute sample path without control characters');
    const windows = /^[A-Za-z]:[\\/]/.test(mapped) || mapped.startsWith('\\\\');
    const dialect = windows ? path.win32 : path.posix;
    if (/[\\/]$/.test(mapped) || dialect.basename(mapped) === '.' || dialect.basename(mapped) === '..') throw new Error('Expected a sample file path');
    mapped = dialect.normalize(mapped);
    if (ref.layout === 'legacy') {
      const patch = rewriteLegacyReference(element, mapped, state(parsed).xml, options.macBootVolumeName);
      changes.push(...patch.values); edits.push(...patch.edits); continue;
    }
    for (const [name, value] of [['Path', mapped], ['RelativePath', ''], ['RelativePathType', '0'], ['Type', '1'], ['LivePackName', ''], ['LivePackId', '']] as const) {
      const target = child(element, name);
      if (!target && (name === 'LivePackName' || name === 'LivePackId')) continue;
      if (!target) throw new Error('Incomplete ALS sample reference');
      changes.push({ element: target, value });
    }
  }
  return changes.length || edits.length ? patchValues(parsed, changes, edits) : parsed;
}
