# Changelog

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
