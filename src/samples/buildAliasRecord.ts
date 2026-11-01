import path from 'node:path';
/** Experimental path-based macOS v2 file alias; no filesystem identity is invented.
 * Format observations: ableton-als (MIT) and dmgbuild/mac_alias (MIT).
 * UTF-8 POSIX tags and UTF-16BE names are authoritative; legacy names use fallback.
 */
export function buildAliasRecord(destination: string, bootVolumeName = 'Macintosh HD'): string {
  const parts = destination.split('/').filter(Boolean);
  const external = parts[0] === 'Volumes' && parts.length >= 3;
  const mount = external ? `/Volumes/${parts[1]}` : '/';
  const volume = external ? parts[1]! : bootVolumeName;
  const name = path.posix.basename(destination);
  const relative = external ? '/' + parts.slice(2).join('/') : destination;
  const ascii = (text: string) => Buffer.from(Array.from(text, (c) => c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63));
  const header = Buffer.alloc(150);
  const pascal = (text: string, offset: number, width: number) => {
    const bytes = ascii(text).subarray(0, width - 1); header[offset] = bytes.length; bytes.copy(header, offset + 1);
  };
  header.writeUInt16BE(2, 6);
  pascal(volume, 10, 28);
  header.write('BD', 42, 'ascii'); header.writeUInt16BE(1, 44);
  header.writeUInt32BE(0xffffffff, 46);
  const ext = path.posix.extname(name);
  const shortName = name.length <= 31 ? name : name.slice(0, Math.max(1, 21 - ext.length)) + '#FFFFFFFF' + ext;
  pascal(shortName, 50, 64);
  header.writeUInt32BE(0xffffffff, 114);
  header.writeUInt32BE(3061152000, 118); // Synthetic date; path-based lookup, no birthtime claim.
  header.fill(255, 122, 134); // File type/creator and CNID traversal disabled.
  header.writeUInt32BE(external ? 0xa00 : 0xa20, 134);
  header.writeUInt16BE(external ? 0x7846 : 0x6375, 138);
  const unicode = (text: string) => {
    const bytes = Buffer.from(text, 'utf16le').swap16();
    const length = Buffer.alloc(2); length.writeUInt16BE(text.length);
    return Buffer.concat([length, bytes]);
  };
  const tag = (id: number, bytes: Buffer) => {
    if (bytes.length > 65535) throw new RangeError('ALS alias path is too long');
    const prefix = Buffer.alloc(4); prefix.writeUInt16BE(id); prefix.writeUInt16BE(bytes.length, 2);
    return Buffer.concat([prefix, bytes, Buffer.alloc(bytes.length % 2)]);
  };
  if (name.length > 32760 || volume.length > 32760) throw new RangeError('ALS alias name is too long');
  const bytes = Buffer.concat([header,
    tag(0, ascii(path.posix.basename(path.posix.dirname(destination)))),
    tag(2, ascii('/:' + parts.join(':'))), tag(14, unicode(name)), tag(15, unicode(volume)),
    tag(18, Buffer.from(relative, 'utf8')), tag(19, Buffer.from(mount, 'utf8')),
    Buffer.from([255, 255, 0, 0]),
  ]);
  if (bytes.length > 65535) throw new RangeError('ALS alias record is too long');
  bytes.writeUInt16BE(bytes.length, 4);
  return bytes.toString('hex').toUpperCase();
}
