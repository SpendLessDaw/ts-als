import { patchXml, type XmlEdit } from './patchXml.js';
import type { ParsedAls } from '../parser/ParsedAls.js';
import { state, type Element } from './state.js';

/** Patch only known Value attribute spans; never serialize a DOM. */
export function patchValues(parsed: ParsedAls, changes: { element: Element; value: string }[], extra: readonly XmlEdit[] = []): ParsedAls {
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
  return patchXml(parsed, [...edits, ...extra]);
}
