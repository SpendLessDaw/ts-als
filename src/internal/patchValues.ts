import { gzipSync } from 'node:zlib';
import { parseAls } from '../parser/parseAls.js';
import type { ParsedAls } from '../parser/ParsedAls.js';
import { state, type Element } from './state.js';

/** Patch only known Value attribute spans; never serialize a DOM. */
export function patchValues(parsed: ParsedAls, changes: { element: Element; value: string }[]): ParsedAls {
  const original = state(parsed);
  if (!parsed.writable) throw new Error('ALS schema is not enabled for writing');
  const edits = changes.map(({ element, value }) => {
    const opening = original.xml.slice(element.start, element.openEnd);
    // Consume complete attribute tokens so text inside another attribute cannot match.
    const tokens = [...opening.matchAll(/\s+([^\s=<>]+)\s*=\s*(["'])([\s\S]*?)\2/g)];
    const attr = tokens.find((m) => m[1] === 'Value');
    if (!attr) throw new Error('Unsupported ALS attribute layout');
    const start = element.start + attr.index! + attr[0].indexOf(attr[2]!) + 1;
    const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
    return { start, end: start + attr[3]!.length, value: escaped };
  }).sort((a, b) => a.start - b.start);
  let cursor = 0;
  const parts: string[] = [];
  for (const edit of edits) {
    if (edit.start < cursor) throw new Error('Overlapping ALS edits');
    parts.push(original.xml.slice(cursor, edit.start), edit.value);
    cursor = edit.end;
  }
  parts.push(original.xml.slice(cursor));
  const xml = parts.join('');
  if (xml === original.xml) return parsed;
  const result = parseAls(gzipSync(xml), original.limits);
  // Verify every untouched segment against the actual reparsed document.
  const output = state(result).xml;
  let before = 0;
  let after = 0;
  for (const edit of edits) {
    const unchanged = original.xml.slice(before, edit.start);
    if (output.slice(after, after + unchanged.length) !== unchanged) throw new Error('ALS preservation check failed');
    after += unchanged.length + edit.value.length;
    before = edit.end;
  }
  if (output.slice(after) !== original.xml.slice(before)) throw new Error('ALS preservation check failed');
  return result;
}
