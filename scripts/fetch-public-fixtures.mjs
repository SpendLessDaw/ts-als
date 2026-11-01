import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sources = JSON.parse(await readFile(new URL('../test-external/sources.json', import.meta.url), 'utf8'));
const directory = new URL('../.cache/public-als/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const source of sources) {
  const response = await globalThis.fetch(source.url, { signal: globalThis.AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed for ${source.id}: ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error('Public fixture download size limit exceeded');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`Hash mismatch for ${source.id}`);
  await writeFile(new URL(source.file, directory), bytes);
  console.log(`${source.id}: ${source.creator}`);
}
