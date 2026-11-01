# Format research references

The implementation is original TypeScript code. No source code from the
following projects is included or required at runtime. Their public format
observations helped guide the implementation and tests:

- kevinkirsten/ableton-als (MIT): targeted XML editing, segmented FileRef variants and macOS v2 alias record layout and path-based generation.
  https://github.com/kevinkirsten/ableton-als
- owenbush/ableton-inspector (MIT): reading sample references and externally downloaded public test projects.
  https://github.com/owenbush/ableton-inspector
- offlinemark/dawtool: tempo automation target IDs and default sentinel events.
  Its LICENSE distinguishes BSD-3-Clause code from its GPL-3.0 FL parser.
  https://github.com/offlinemark/dawtool

- dmgbuild/mac_alias (MIT): independent alias layout/encoding reference and
  development-only validation of generated alias records.
  https://github.com/dmgbuild/mac_alias

Ableton and Live are trademarks of their respective owners. This project is
independent and is not affiliated with or endorsed by Ableton.
