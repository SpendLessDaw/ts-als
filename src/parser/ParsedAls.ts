/** Opaque immutable handle. Create only through parseAls or a writer. */
export interface ParsedAls {
  readonly creator: string | null;
  readonly formatVersion: string | null;
  readonly writable: boolean;
}
export interface AlsTempo {
  bpm: number | null;
  automation: 'none' | 'present' | 'unknown';
}
export interface AlsSampleRef {
  referenceIndex: number;
  path: string;
  absolutePath: string | null;
  relativePath: string | null;
  relativePathType: string | null;
  supported: boolean;
  writable: boolean;
}
export interface AlsPluginRef {
  id: string | null;
  name: string | null;
  vendor: string | null;
  format: 'vst2' | 'vst3' | 'unknown';
}
