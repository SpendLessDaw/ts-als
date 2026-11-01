import path from 'node:path';
import { at, child, type Element } from '../internal/state.js';
import type { XmlEdit } from '../internal/patchXml.js';
import { buildAliasRecord } from './buildAliasRecord.js';

/** Replace only path-bearing fields, retaining search CRC/size and unknown siblings. */
export function rewriteLegacyReference(element: Element, destination: string, xml: string, bootVolumeName?: string): { values: { element: Element; value: string }[]; edits: XmlEdit[] } {
  const windows = /^[A-Za-z]:[\\/]/.test(destination) || destination.startsWith('\\\\');
  const dialect = windows ? path.win32 : path.posix;
  const name = dialect.basename(destination);
  const directory = dialect.dirname(destination);
  const dirs = windows ? directory.replace(/\\/g, '/').replace(/\/+$/, '').split('/') : directory.split('/').filter(Boolean);
  const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const values: { element: Element; value: string }[] = [];
  const edits: XmlEdit[] = [];
  for (const [tag, value] of [['Name', name], ['HasRelativePath', 'false'], ['RelativePathType', '0'], ['Type', windows ? '1' : '2'], ['RefersToFolder', 'false'], ['LivePackName', ''], ['LivePackId', '']] as const) {
    const node = child(element, tag);
    if (node) values.push({ element: node, value });
  }
  const replaceContent = (node: Element | undefined, content: string) => {
    if (!node) throw new Error('Incomplete legacy ALS sample reference');
    const opening = xml.slice(node.start, node.openEnd).replace(/\/\s*>$/, '>');
    edits.push({ start: node.start, end: node.end, value: `${opening}${content}</${node.name}>` });
  };
  replaceContent(child(element, 'RelativePath'), '');
  // Windows uses the rooted PathHint; do not leave an obsolete macOS alias behind.
  replaceContent(child(element, 'Data'), windows ? '' : buildAliasRecord(destination, bootVolumeName));
  replaceContent(at(element, 'SearchHint/PathHint'), dirs.map((dir, id) => `<RelativePathElement Id="${id}" Dir="${escape(dir)}"/>`).join(''));
  return { values, edits };
}
