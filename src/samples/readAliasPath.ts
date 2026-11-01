/** Read only the UTF-8 POSIX path/mount tags of a bounded macOS v2 file alias.
 * Layout reference: kevinkirsten/ableton-als src/core/alias.ts (MIT).
 * Unknown records remain opaque; never synthesize filesystem IDs or alias data.
 */
export function readAliasPath(hex: string): string | null {
  const compact = hex.replace(/\s/g, '');
  if (compact.length < 308 || compact.length > 131070 || compact.length % 2 || !/^[\da-f]+$/i.test(compact)) return null;
  const bytes = Buffer.from(compact, 'hex');
  if (bytes.readUInt16BE(4) !== bytes.length || bytes.readUInt16BE(6) !== 2 || bytes.readUInt16BE(8) !== 0) return null;
  const tags = new Map<number, Buffer>();
  let ended = false;
  for (let offset = 150; offset + 4 <= bytes.length;) {
    const tag = bytes.readUInt16BE(offset);
    const length = bytes.readUInt16BE(offset + 2);
    offset += 4;
    if (tag === 65535) { ended = length === 0 && offset === bytes.length; break; }
    if (offset + length + length % 2 > bytes.length || tags.has(tag)) return null;
    tags.set(tag, bytes.subarray(offset, offset + length));
    offset += length + length % 2;
  }
  if (!ended || !tags.has(18) || !tags.has(19)) return null;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const relative = decoder.decode(tags.get(18));
    const mount = decoder.decode(tags.get(19));
    if (!mount.startsWith('/') || !relative || Array.from(mount + relative).some((c) => c.charCodeAt(0) < 32)
      || [...mount.split('/'), ...relative.split('/')].some((p) => p === '..' || p === '.')) return null;
    return mount.replace(/\/+$/, '') + '/' + relative.replace(/^\/+/, '');
  } catch { return null; }
}
