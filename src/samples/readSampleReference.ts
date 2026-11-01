import { at, child, value, type Element } from '../internal/state.js';
import type { AlsSampleRef } from '../parser/ParsedAls.js';
import { readAliasPath } from './readAliasPath.js';

function segments(element: Element | undefined): string[] | null {
  if (!element || element.attrs.Value !== undefined) return null;
  const result: string[] = [];
  for (const entry of element.children) {
    const dir = entry.attrs.Dir;
    if (entry.name !== 'RelativePathElement' || dir === undefined || entry.children.length
      || Array.from(dir).some((c) => c.charCodeAt(0) < 32)) return null;
    result.push(dir);
  }
  return result;
}
/** Recognize modern paths and legacy segmented FileRefs without any disk access. */
export function readSampleReference(el: Element, referenceIndex: number, schemaWritable: boolean, xml: string): AlsSampleRef {
  const relativePathType = value(child(el, 'RelativePathType'));
  const modern = el.name === 'FileRef' && child(el, 'Path') !== undefined && child(el, 'RelativePath')?.attrs.Value !== undefined;
  const fileName = value(child(el, 'Name'));
  const dirs = segments(child(el, 'RelativePath'));
  const legacy = el.name === 'FileRef' && !child(el, 'Path') && fileName !== null
    && !!fileName && !/[\\/]/.test(fileName) && !Array.from(fileName).some((c) => c.charCodeAt(0) < 32) && dirs !== null
    && value(child(el, 'RefersToFolder')) !== 'true';
  const data = child(el, 'Data');
  const dataEnd = data && data.end > data.openEnd ? xml.lastIndexOf('</', data.end - 1) : -1;
  const hasEmbeddedData = !!data && dataEnd >= data.openEnd && /\S/.test(xml.slice(data.openEnd, dataEnd));
  const alias = legacy && data && !data.children.length && dataEnd >= data.openEnd && dataEnd - data.openEnd <= 262140
    ? readAliasPath(xml.slice(data.openEnd, dataEnd)) : null;
  // A mismatched alias must never identify another file as this sample.
  const absolutePath = modern ? value(child(el, 'Path')) || null
    : alias && alias.split('/').at(-1) === fileName ? alias : null;
  const relativePath = modern ? value(child(el, 'RelativePath')) || null
    : legacy && value(child(el, 'HasRelativePath')) === 'true'
      ? [...dirs.map((p) => p || '..'), fileName].join('/') : null;
  const hints = legacy ? segments(at(el, 'SearchHint/PathHint')) : null;
  // Unrooted hints are deliberately not guessed to be POSIX absolute paths.
  const pathHint = hints?.length ? [...hints, fileName].join('/') : null;
  const known = new Set(['Path', 'RelativePath', 'RelativePathType', 'Type', 'LivePackName', 'LivePackId', 'OriginalFileSize', 'OriginalCrc']);
  const writable = schemaWritable && modern && ['0', '1', '3', '7'].includes(relativePathType ?? '')
    && el.children.every((n) => known.has(n.name) && n.children.length === 0 && n.attrs.Value !== undefined)
    && new Set(el.children.map((n) => n.name)).size === el.children.length
    && value(child(el, 'Type')) === '1'
    && !value(child(el, 'LivePackName')) && !value(child(el, 'LivePackId'));
  return { referenceIndex, path: absolutePath ?? relativePath ?? fileName ?? '', absolutePath, relativePath,
    relativePathType, supported: modern || legacy, writable,
    layout: modern ? 'modern' : legacy ? 'legacy' : 'unknown', fileName,
    pathHint, hasEmbeddedData };
}
