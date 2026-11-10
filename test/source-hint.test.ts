import { gzipSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { listSamples, parseAls, rewriteSamplePaths, serializeAls } from '../index.js';

// Live 12.4 writes an empty SourceHint in every modern FileRef.
function session(hint: string): string {
  return `<?xml version="1.0"?><Ableton MajorVersion="5" MinorVersion="12.0_12402" Creator="Ableton Live 12.4.16"><LiveSet><SampleRef><FileRef><RelativePathType Value="1"/><RelativePath Value="../a.wav"/><Path Value="/audio/a.wav"/><Type Value="2"/><LivePackName Value=""/><LivePackId Value=""/><OriginalFileSize Value="1"/><OriginalCrc Value="2"/>${hint}</FileRef></SampleRef></LiveSet></Ableton>`;
}

describe('Live 12.4 SourceHint', () => {
  it('keeps references with an empty SourceHint writable and preserves it', () => {
    const xml = session('<SourceHint Value=""/>');
    const parsed = parseAls(gzipSync(xml));
    expect(listSamples(parsed)[0]?.writable).toBe(true);
    const edited = rewriteSamplePaths(parsed, () => '/new/a.wav');
    const out = gunzipSync(serializeAls(edited)).toString();
    expect(out).toContain('<Path Value="/new/a.wav"/>');
    expect(out).toContain('<SourceHint Value=""/>');
  });
  it('keeps references with an unknown filled SourceHint read-only', () => {
    const parsed = parseAls(gzipSync(session('<SourceHint Value="splice://x"/>')));
    expect(listSamples(parsed)[0]?.writable).toBe(false);
  });
});
