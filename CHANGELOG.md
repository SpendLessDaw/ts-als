# Changelog

## 0.1.0-alpha.5

- Sample references saved by Live 12.4 stay writable: Live 12.4 adds an empty
  `SourceHint` to every modern `FileRef`, which made `listSamples` mark them
  read-only. An empty `SourceHint` is accepted and preserved; a filled one keeps
  the reference read-only until its meaning is known.

## 0.1.0-alpha.4

- `writeAlsOverwriteProtection(parsed, value)` sets the LiveSet
  `OverwriteProtectionNumber`. Live asks for "Save As" instead of saving in
  place when this number is lower than its own (sets from older templates).
  Observed on Live 12.4.16 Lite: raising it lets Live save in place, and Live
  writes its own value back on save. Other Live versions are not validated.

## 0.1.0-alpha.1

Initial experimental release:
- Strict gzip/UTF-8/XML parsing with explicit resource limits.
- Live version, manual tempo, sample references and external plugin inspection.
- Optional asynchronous sample resolution and filesystem checks, with cancellation and bounded concurrency.
- Byte-identical unchanged serialization and targeted tempo/sample-path edits.
- ESM/CommonJS modules and TypeScript declarations.

Writes are limited to the verified Live 12 XML schema (5 / 12.0_12120).
Tempo automation and unsupported sample references are refused. Native Ableton
opening, playback, save and reopen validation is pending. No private sessions,
media, paths or dumps are distributed. No SpendLess integration is included.
