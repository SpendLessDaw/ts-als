import type { ParsedAls } from './ParsedAls.js';
import { state } from '../internal/state.js';
export function serializeAls(parsed: ParsedAls): Buffer {
  return Buffer.from(state(parsed).bytes);
}
