import type { ParsedAls, AlsTempo, AlsSampleRef, AlsPluginRef } from '../parser/ParsedAls.js';
import type { AlsParseLimits } from '../parser/parseAls.js';
export interface Element {
  name: string;
  attrs: Record<string, string>;
  children: Element[];
  start: number;
  openEnd: number;
  end: number;
}
export interface State {
  bytes: Buffer;
  xml: string;
  limits: AlsParseLimits;
  tempo: AlsTempo;
  tempoValues: Element[];
  samples: { ref: AlsSampleRef; element: Element }[];
  plugins: AlsPluginRef[];
}
export const states = new WeakMap<ParsedAls, State>();
export function state(parsed: ParsedAls): State {
  const value = states.get(parsed);
  if (!value) throw new TypeError('Expected a parsed ALS handle');
  return value;
}
export function children(el: Element | undefined, name: string): Element[] {
  return el?.children.filter((child) => child.name === name) ?? [];
}
export function child(el: Element | undefined, name: string): Element | undefined {
  const found = children(el, name);
  return found.length === 1 ? found[0] : undefined;
}
export function at(el: Element | undefined, path: string): Element | undefined {
  return path.split('/').reduce<Element | undefined>((node, name) => child(node, name), el);
}
export function value(el: Element | undefined): string | null {
  return el?.attrs.Value ?? null;
}
