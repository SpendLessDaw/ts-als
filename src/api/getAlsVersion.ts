import type { ParsedAls } from '../parser/ParsedAls.js';
export function getAlsVersion(parsed: ParsedAls): string | null {
  return parsed.creator?.match(/^Ableton Live (.+)$/)?.[1] ?? null;
}
