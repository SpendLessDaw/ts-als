import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { inspectSamples, parseAls } from '../index.js';
it('passes ALS relative reference context to the inspection layer', async () => {
  const parsed = parseAls(gzipSync('<Ableton><LiveSet><SampleRef><FileRef><Path Value=""/><RelativePath Value="Samples/a.wav"/><RelativePathType Value="3"/></FileRef></SampleRef></LiveSet></Ableton>'));
  expect((await inspectSamples(parsed))[0]).toMatchObject({ referenceIndex: 0, relativePath: 'Samples/a.wav', status: 'unresolved' });
});
