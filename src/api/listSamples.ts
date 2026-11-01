import type { ParsedAls, AlsSampleRef } from '../parser/ParsedAls.js';
import { state } from '../internal/state.js';
export function listSamples(parsed: ParsedAls): AlsSampleRef[] {
  return state(parsed).samples.map(({ ref }) => ({ ...ref }));
}
