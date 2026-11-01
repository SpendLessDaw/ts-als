import type { ParsedAls, AlsTempo } from '../parser/ParsedAls.js';
import { state } from '../internal/state.js';
export function readAlsTempo(parsed: ParsedAls): AlsTempo {
  return { ...state(parsed).tempo };
}
