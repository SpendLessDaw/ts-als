# Live 10–12 compatibility evidence

Status: experimental, no native Ableton opening/playback/save/reopen validation.
Support means recognizing the structures below, not converting sessions between
versions or emulating Ableton's audio/plugin engine. Future Live major versions
are not automatically enabled for editing.

| Operation | Live 10 | Live 11 | Live 12 |
| --- | --- | --- | --- |
| Gzip/XML, creator, original-byte serialization | Public 10.1.7/10.1.9 files | Public 11.3.13 file | Public and private files |
| Manual tempo and automation detection | MasterTrack | MasterTrack | MainTrack |
| Experimental tempo write, automation absent | Enabled | Enabled | Enabled |
| Modern direct sample paths | Structure-based | Public file | Public/private files |
| Legacy segmented sample paths | Public files, synthetic edge cases | Structure-based if encountered | Structure-based if encountered |
| macOS v2 alias path extraction | Public boot-volume aliases; synthetic external-volume cases | Same recognized structure | Same recognized structure |
| Modern same-file sample relocation | Structure-based if encountered | Enabled for qualified references | Enabled for qualified references |
| Legacy alias/reference rewriting | Refused | Refused | Refused |
| VST2/VST3 descriptors | Structure-based | Public VST3 example | Public/private examples |

Live 10.0, unrepresented minor releases, Windows-created legacy references and AU
plugins have no real-file validation here. Missing or unknown information remains
explicitly unavailable. Neither a header match nor XML roundtripping proves that
Live will load a modified session. Native validation remains pending.

## Public corpus

`test-external/sources.json` pins 15 upstream files by commit URL and SHA-256,
with creator/schema, sample/plugin counts, tempo and an independently calculated
SHA-256 of extracted absolute paths (Python ElementTree). No original paths,
plugin state, media or session XML are redistributed. Sources:

- [dawtool tests](https://github.com/offlinemark/dawtool/tree/master/tests/als):
  12 Live 10/12 files, including automation and intentionally malformed cases.
  The upstream license is BSD-3-Clause except its GPL FL parser; no upstream
  code or fixture is vendored in ts-als.
- [ableton-inspector fixtures](https://github.com/owenbush/ableton-inspector/tree/main/packages/core/test/fixtures):
  3 Live 11/12 projects, repository MIT license. No media is downloaded.

Run `bun run fixtures:fetch`, then `bun run test:external`. The downloader checks
hashes and size limits and writes only ignored `.cache/public-als/` files. Tests
run offline after download. CI remains independent of third-party availability.
Tests never rewrite the source files or print sample paths. They check original
bytes, independent expected reads, tempo writes/rejections and qualified sample
relocation in memory. This corpus does not demonstrate every feature/platform.

## Format references and implementation choices

- [ableton-als file-ref.ts](https://github.com/kevinkirsten/ableton-als/blob/main/src/core/file-ref.ts):
  legacy Name, HasRelativePath, segmented RelativePath and SearchHint/PathHint.
  An empty relative directory denotes a parent step. Search hints are exposed
  separately, without guessing their root or asserting the sample's identity.
- [ableton-als alias.ts](https://github.com/kevinkirsten/ableton-als/blob/main/src/core/alias.ts):
  classic 150-byte v2 alias header and tagged path/mount records 18/19. Our
  independent reader validates record length, kind/version, tag bounds and
  terminator, decodes UTF-8 strictly and rejects mismatched filenames.
  Unknown alias kinds remain opaque. No alias generator is imported or copied.
- [dawtool ableton.py](https://github.com/offlinemark/dawtool/blob/master/dawtool/daw/ableton.py):
  MasterTrack vs MainTrack and automation target routing. Real or uncertain
  automation still prevents manual-tempo writes.

`RelativePathType` bases other than project type 3 still require explicit
`relativeRoots`. In particular, no automatic root is assumed for legacy type 1.
Filename-only references remain unresolved even if a project root is supplied;
basename search suggestions do not establish identity. Alias and search-hint
rewriting is deliberately unsupported until coherent preservation can be shown.

All production implementation is original TypeScript. MIT reference code was
consulted for format observations; no Python dependency or GPL source is used.
