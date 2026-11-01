import { gzipSync } from 'node:zlib';
import { parseAls } from '../parser/parseAls.js';
import type { ParsedAls } from '../parser/ParsedAls.js';
import { state } from './state.js';
export interface XmlEdit { start: number; end: number; value: string }
/** Apply explicit non-overlapping spans and verify everything outside them. */
export function patchXml(parsed: ParsedAls, changes: readonly XmlEdit[]): ParsedAls {
  const original = state(parsed);
  if (!parsed.writable) throw new Error('ALS schema is not enabled for writing');
  const edits = [...changes].sort((a, b) => a.start - b.start);
  for (const e of edits) {
    if (!Number.isSafeInteger(e.start) || !Number.isSafeInteger(e.end) || e.start < 0 || e.end < e.start || e.end > original.xml.length) throw new Error('Invalid ALS edit range');
  }
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
