import type { ParsedAls } from '../parser/ParsedAls.js';
import { state } from '../internal/state.js';
import { patchValues } from '../internal/patchValues.js';
/**
 * Sets LiveSet/OverwriteProtectionNumber. Live asks for "Save As" instead of
 * saving in place when this number is lower than its own; a set derived from
 * an older template can be raised so Live saves it where it is.
 */
export function writeAlsOverwriteProtection(parsed: ParsedAls, value: number): ParsedAls {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('ALS overwrite protection must be a non-negative safe integer');
  const element = state(parsed).overwriteProtection;
  if (!element) throw new Error('ALS overwrite protection number is missing or duplicated');
  if (element.attrs.Value === String(value)) return parsed;
  return patchValues(parsed, [{ element, value: String(value) }]);
}
