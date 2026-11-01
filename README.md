# ts-als

An experimental TypeScript library for reading Ableton Live `.als` files,
inspecting sample references and making conservative, targeted edits.
Node 24+. ESM and CommonJS. Not published to npm yet (`private: true`).

```ts
import { readFileSync } from 'node:fs';
import {
  parseAls, getAlsVersion, readAlsTempo, listSamples, listPlugins,
  inspectSamples, writeAlsTempo, rewriteSamplePaths, serializeAls,
} from 'ts-als';

const parsed = parseAls(readFileSync('/music/Project/Song.als'));
const version = getAlsVersion(parsed); // Live version, distinct from parsed.formatVersion
const tempo = readAlsTempo(parsed);    // { bpm, automation: 'none' | 'present' | 'unknown' }
const samples = listSamples(parsed);   // synchronous; no filesystem access
const plugins = listPlugins(parsed);   // external instances, including unknown descriptors
const inspected = await inspectSamples(parsed, {
  mode: 'check',
  projectPath: '/music/Project/Song.als',
  projectRoot: '/music/Project',
});

// These calls return new handles; they never write files themselves.
// They throw if this schema/reference/automation cannot be safely interpreted.
const edited = writeAlsTempo(parsed, 125);
const relocated = rewriteSamplePaths(edited, (oldPath) =>
  oldPath === '/old/kick.wav' ? '/new/kick.wav' : oldPath,
);
const bytes = serializeAls(relocated); // caller decides where/when to save
```

## Current compatibility and limits

- Strict gzip/UTF-8/XML parsing with no DTD or external entity support.
- Limits default to 128 MiB compressed, 256 MiB expanded, depth 256,
  2,000,000 elements and 128 attributes per element. Limits are configurable
  in `parseAls(bytes, limits)`. Parsing is synchronous: use a worker for large sets.
- Reading is structure-based. Verified against a private Live 12 corpus with
  XML MajorVersion `5`, MinorVersion `12.0_12120`. Other variants are not a
  compatibility promise; known fields may be read and unknown references retained.
- Writes require that exact schema and a Live 12 creator. This is a conservative
  format gate, not a guarantee for every file sharing its header.
- No native Live opening/playback/save/reopen validation has been performed.
  Writer results are experimental until the user's Ableton tester validates them.
- Parsed handles are opaque and immutable. `serializeAls` returns a defensive
  copy, byte-identical to the input when unmodified. After edits, gzip bytes may
  differ, but XML outside the selected attribute values is preserved exactly.
- Tempo writes accept 20–999 BPM. They update both the manual value and a
  matching single negative-time default event. Real or uncertain automation is
  refused. This does not change scene tempos or evaluate a performance timeline.
- Samples enumerate `SampleRef/FileRef` occurrences without deduplication.
  Modern direct paths are supported. Legacy/unknown layouts have
  `supported: false`; their reference is retained even without a usable path.
  This is not a complete inventory of media hidden inside third-party plugin state.
- Relocation writes absolute paths, clears relative hints and preserves media
  size/CRC: it relocates the **same file**, not replacement audio. Unknown fields,
  legacy aliases and Pack-bound references are refused. No on-disk files are moved.
- VST2/VST3 names are read where available. Other PluginDevice descriptors are
  reported as `unknown`; AU is not validated. Vendor remains unavailable (`null`).
  Native devices, plugin installation detection and plugin-state decoding are out of scope.
- No title/artist/genre/tags/status/personal-note fields, creation/work-time
  fabrication, scale API, track editor or version conversion.

## Optional sample inspection

`inspectSamples(parsed, options)` always returns a Promise. Default `mode` is
`resolve`: compute candidates without accessing disk. `check` additionally tests
for regular files. Neither mode rewrites the project.

Each result contains `referenceIndex`, `recordedPath`, `pathType`, `relativePath`,
`candidates`, `resolvedPath`, `status` and `reason`. Candidate paths carry a
`source` and `confidence` (`exact` or `name-only`). A resolved path is only set
when a single exact candidate is found. Multiple existing candidates remain ambiguous.

| Status | Meaning |
| --- | --- |
| `unchecked` | Candidates exist but have not been checked |
| `found` | One exact candidate is a regular file; audio validity is not checked |
| `missing` | No file at the candidate locations checked; not a machine-wide claim |
| `unresolved` | Missing context, unsupported reference or only a name-based suggestion |
| `ambiguous` | Multiple possible matches; caller must decide |
| `inaccessible` | A candidate or requested search directory could not be inspected |

Context paths must be native absolute paths; no fallback to the process cwd.
`projectRoot` resolves modern type-3 project-relative references. Other relative
bases require explicit `relativeRoots: { '1': '/library', '7': '/other-root' }`
chosen by the caller for the reference's actual location; these numbers are not
interpreted as universally known directories. Foreign Windows paths on POSIX
remain unresolved unless another candidate can be formed.

`searchRoots` defaults to `[]`. In `check` mode only, supplied roots are indexed
recursively (without following nested directory symlinks); basename matches are
suggestions, never proof of identity. `maxSearchEntries` defaults to 100,000 and
throws when exceeded. `concurrency` defaults to 8 (1–64), `signal` supports
cancellation, and duplicate file checks are cached only within one inspection.
Filesystem results are a snapshot, not a guarantee at the time of later copying.

## Development and release

```sh
bun install --frozen-lockfile
bun run test
bun run test:fixtures # local only; requires private fixtures and Python 3
bun run typecheck
bun run lint
bun run build
bun run check:package # audits an actual tarball, installs it and imports ESM/CJS
```

Public CI uses synthetic fixtures only. Private ALS files, extracted XML, media,
original filenames, paths and logs must never enter Git, npm, issues or CI artifacts.
See [contributing](CONTRIBUTING.md), [release checklist](RELEASING.md),
[deferred work](docs/roadmap.md) and [research credits](NOTICE.md).

MIT license.
