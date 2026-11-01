import type { ParsedAls } from '../parser/ParsedAls.js';
import { state } from '../internal/state.js';
import { patchValues } from '../internal/patchValues.js';
export function writeAlsTempo(parsed: ParsedAls, bpm: number): ParsedAls {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 999) throw new RangeError('ALS tempo must be between 20 and 999 BPM');
  const current = state(parsed);
  if (current.tempo.automation !== 'none' || current.tempoValues.length === 0) throw new Error('ALS tempo automation is present or uncertain');
  return patchValues(parsed, current.tempoValues.map((element) => ({ element, value: String(bpm) })));
}
