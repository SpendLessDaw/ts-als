import type { ParsedAls, AlsPluginRef } from '../parser/ParsedAls.js';
import { state } from '../internal/state.js';
/** External instances, including unknown descriptors. No deduplication or installation check. */
export function listPlugins(parsed: ParsedAls): AlsPluginRef[] {
  return state(parsed).plugins.map((plugin) => ({ ...plugin }));
}
