import type { ParsedAls } from '../parser/ParsedAls.js';
import { listSamples } from './listSamples.js';
import { inspectReferences, type SampleInspection, type SampleInspectionOptions } from '../samples/inspectReferences.js';
export function inspectSamples(parsed: ParsedAls, options: SampleInspectionOptions = {}): Promise<SampleInspection[]> {
  return inspectReferences(listSamples(parsed).map((s) => ({ referenceIndex: s.referenceIndex, path: s.path,
    relativePath: s.relativePath, relativeType: s.relativePathType, relativeBase: 'daw', supported: s.supported && !!(s.absolutePath || s.relativePath) })), options);
}
