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
  let absolutePath = modern ? value(child(el, 'Path')) || null
    : alias && alias.split('/').at(-1) === fileName ? alias : null;
  const relativePath = modern ? value(child(el, 'RelativePath')) || null
    : legacy && value(child(el, 'HasRelativePath')) === 'true'
      ? [...dirs.map((p) => p || '..'), fileName].join('/') : null;
  const hints = legacy ? segments(at(el, 'SearchHint/PathHint')) : null;
  // Unrooted hints are deliberately not guessed to be POSIX absolute paths.
  const pathHint = hints?.length ? [...hints, fileName].join('/') : null;
  const known = new Set(['Path', 'RelativePath', 'RelativePathType', 'Type', 'LivePackName', 'LivePackId', 'OriginalFileSize', 'OriginalCrc']);
  const unique = new Set(el.children.map((n) => n.name)).size === el.children.length;
  const scalar = (name: string) => { const node = child(el, name); return node && node.children.length === 0 && node.attrs.Value !== undefined; };
  // Live 12.4 adds an empty SourceHint; a filled one is not understood yet.
  const emptySourceHint = (n: Element) => n.name === 'SourceHint' && n.children.length === 0 && n.attrs.Value === '';
  const modernWritable = modern && el.children.every((n) => emptySourceHint(n)
    || (known.has(n.name) && n.children.length === 0 && n.attrs.Value !== undefined))
    && ['Path', 'RelativePath', 'RelativePathType', 'Type'].every(scalar);
  const legacyWritable = legacy && ['Name', 'HasRelativePath', 'RelativePathType', 'Type', 'RefersToFolder'].every(scalar)
    && !!data && !data.children.length && !!at(el, 'SearchHint/PathHint')
    && ['LivePackName', 'LivePackId'].every((name) => !child(el, name) || scalar(name));
  const writable = schemaWritable && ['1', '2'].includes(value(child(el, 'Type')) ?? '') && unique && (modernWritable || legacyWritable);
  // Rooted Windows hints are explicit in absolute legacy records without a macOS alias.
  if (legacy && !absolutePath && !hasEmbeddedData && value(child(el, 'HasRelativePath')) === 'false'
    && pathHint && (/^[A-Za-z]:\//.test(pathHint) || pathHint.startsWith('//'))) absolutePath = pathHint.replace(/\//g, '\\');
  return { referenceIndex, path: absolutePath ?? relativePath ?? fileName ?? '', absolutePath, relativePath,
    relativePathType, supported: modern || legacy, writable,
    layout: modern ? 'modern' : legacy ? 'legacy' : 'unknown', fileName,
    pathHint, hasEmbeddedData };
}
