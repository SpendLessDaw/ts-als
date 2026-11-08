import { SaxesParser } from 'saxes';
import { readSampleReference } from '../samples/readSampleReference.js';
import { decodeAlsContainer, type AlsDecodeLimits } from '../container/decodeAlsContainer.js';
import type { ParsedAls, AlsPluginRef, AlsTempo } from './ParsedAls.js';
import { at, child, children, states, value, type Element, type State } from '../internal/state.js';

export interface AlsParseLimits extends AlsDecodeLimits {
  maxDepth?: number;
  maxElements?: number;
  maxAttributesPerElement?: number;
}
/** Strict structured XML parsing. No filesystem access or external entity resolution. */
export function parseAls(input: Uint8Array, limits: AlsParseLimits = {}): ParsedAls {
  const maxDepth = limits.maxDepth ?? 256;
  const maxElements = limits.maxElements ?? 2_000_000;
  const maxAttributes = limits.maxAttributesPerElement ?? 128;
  for (const limit of [maxDepth, maxElements, maxAttributes]) {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError('Limits must be positive safe integers');
  }
  const xml = decodeAlsContainer(input, limits);
  const bytes = Buffer.from(input);
  const parser = new SaxesParser({ xmlns: false });
  const stack: Element[] = [];
  let root: Element | undefined;
  let elements = 0;
  let attributes = 0;
  const sampleElements: Element[] = [];
  const sampleContainers: Element[] = [];
  const pluginElements: Element[] = [];
  parser.on('error', () => { throw new Error('Invalid ALS XML'); });
  parser.on('doctype', () => { throw new Error('ALS XML document types are not supported'); });
  parser.on('opentagstart', () => { attributes = 0; });
  parser.on('attribute', () => {
    if (++attributes > maxAttributes) throw new RangeError('ALS XML attribute limit exceeded');
  });
  parser.on('opentag', (tag) => {
    if (stack.length >= maxDepth) throw new RangeError('ALS XML depth limit exceeded');
    if (++elements > maxElements) throw new RangeError('ALS XML element limit exceeded');
    const el: Element = { name: tag.name, attrs: tag.attributes, children: [],
      start: xml.lastIndexOf('<', parser.position - 1), openEnd: parser.position, end: parser.position };
    const parent = stack.at(-1);
    if (parent) parent.children.push(el); else root = el;
    if (stack[1]?.name === 'LiveSet') {
      if (el.name === 'SampleRef') sampleContainers.push(el);
      if (el.name === 'FileRef' && parent?.name === 'SampleRef') sampleElements.push(el);
      if (el.name === 'PluginDevice' && parent?.name === 'Devices') pluginElements.push(el);
    }
    stack.push(el);
  });
  parser.on('closetag', () => { stack.pop()!.end = parser.position; });
  for (let offset = 0; offset < xml.length; offset += 65536) parser.write(xml.slice(offset, offset + 65536));
  parser.close();
  if (!root || root.name !== 'Ableton') throw new Error('Expected an Ableton XML root');
  const live = child(root, 'LiveSet');
  if (!live) throw new Error('Expected exactly one Ableton LiveSet');
  const creator = root.attrs.Creator ?? null;
  const formatVersion = root.attrs.MinorVersion ?? null;
  // Experimental structural support for Live 10–12, not a native validation claim.
  const family = /^(10|11|12)\.0_\d+$/.exec(formatVersion ?? '')?.[1];
  const creatorFamily = /^Ableton Live (10|11|12)\./.exec(creator ?? '')?.[1];
  const writable = root.attrs.MajorVersion === '5' && family !== undefined
    && family === creatorFamily && root.attrs.xmlns === undefined;
  const parsed: ParsedAls = Object.freeze({ creator, formatVersion, writable });
  const mainTracks = [...children(live, 'MainTrack'), ...children(live, 'MasterTrack')];
  const main = mainTracks.length === 1 ? mainTracks[0] : undefined;
  const tempoNode = at(main, 'DeviceChain/Mixer/Tempo');
  const manual = child(tempoNode, 'Manual');
  const rawBpm = value(manual);
  const bpm = rawBpm?.trim() ? Number(rawBpm) : NaN;
  const tempo: AlsTempo = { bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null, automation: 'unknown' };
  const tempoValues: Element[] = manual ? [manual] : [];
  const target = child(tempoNode, 'AutomationTarget')?.attrs.Id;
  const envelopes = at(main, 'AutomationEnvelopes/Envelopes');
  if (target && envelopes && tempo.bpm !== null) {
    const envs = children(envelopes, 'AutomationEnvelope');
    const targetsKnown = envelopes.children.length === envs.length
      && envs.every((e) => value(at(e, 'EnvelopeTarget/PointeeId')) !== null);
    const matches = envs.filter((e) => value(at(e, 'EnvelopeTarget/PointeeId')) === target);
    if (targetsKnown && matches.length === 0) tempo.automation = 'none';
    if (targetsKnown && matches.length === 1) {
      const events = at(matches[0], 'Automation/Events');
      if (events && events.children.length === 0) tempo.automation = 'none';
      else if (events && events.children.every((e) => e.name === 'FloatEvent'
        && e.attrs.Time?.trim() && Number.isFinite(Number(e.attrs.Time))
        && e.attrs.Value?.trim() && Number.isFinite(Number(e.attrs.Value)))) {
        const event = events.children[0]!;
        if (events.children.length === 1 && Number(event.attrs.Time) < 0 && Number(event.attrs.Value) === bpm) {
          tempo.automation = 'none';
          tempoValues.push(event);
        } else tempo.automation = 'present';
      }
    }
  }
  for (const container of sampleContainers) {
    if (children(container, 'FileRef').length === 0) sampleElements.push(container);
  }
  sampleElements.sort((a, b) => a.start - b.start);
  const samples: State['samples'] = sampleElements.map((el, referenceIndex) => ({
    element: el, ref: readSampleReference(el, referenceIndex, writable, xml),
  }));
  const plugins: AlsPluginRef[] = pluginElements.map((el) => {
    const desc = child(el, 'PluginDesc');
    const vst2 = child(desc, 'VstPluginInfo');
    const vst3 = child(desc, 'Vst3PluginInfo');
    return { id: el.attrs.Id ?? null, name: value(child(vst2, 'PlugName')) ?? value(child(vst3, 'Name')),
      vendor: null, format: vst2 && !vst3 ? 'vst2' : vst3 && !vst2 ? 'vst3' : 'unknown' };
  });
  const overwriteProtection = child(live, 'OverwriteProtectionNumber');
  states.set(parsed, { bytes, xml, limits: { ...limits }, tempo, tempoValues, overwriteProtection, samples, plugins });
  return parsed;
}
