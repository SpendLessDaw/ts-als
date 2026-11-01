import path from 'node:path';
import type { ParsedAls, AlsSampleRef } from '../parser/ParsedAls.js';
import { state, child, type Element } from '../internal/state.js';
import { patchValues } from '../internal/patchValues.js';
/** Relocate the same media; no audio replacement or filesystem access. Writes absolute references. */
export function rewriteSamplePaths(parsed: ParsedAls, mapper: (oldPath: string, ref: AlsSampleRef) => string): ParsedAls {
  const changes: { element: Element; value: string }[] = [];
  for (const { ref, element } of state(parsed).samples) {
    const mapped = mapper(ref.path, { ...ref });
    if (typeof mapped !== 'string') throw new TypeError('Sample mapper must return a string');
    if (mapped === ref.path) continue;
    if (!ref.writable) throw new Error('ALS sample reference is not enabled for writing');
    if ((!path.posix.isAbsolute(mapped) && !/^[A-Za-z]:[\\/]/.test(mapped) && !/^\\\\[^\\]+\\[^\\]+/.test(mapped))
      || Array.from(mapped).some((c) => c.charCodeAt(0) < 32)) throw new Error('Expected an absolute sample path without control characters');
    for (const [name, value] of [['Path', mapped], ['RelativePath', ''], ['RelativePathType', '0']] as const) {
      const target = child(element, name);
      if (!target) throw new Error('Incomplete ALS sample reference');
      changes.push({ element: target, value });
    }
  }
  return changes.length ? patchValues(parsed, changes) : parsed;
}
