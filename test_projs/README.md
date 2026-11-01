# Private ALS fixtures

Six collaborator-owned ALS files are copied locally as fixture-01.als through
fixture-06.als. The local manifest.private.json records their original names,
SHA-256 hashes and inventory. All of these files are ignored by Git and excluded
from package contents. Never force-add them or share XML dumps, plugin state or
sample paths. Originals on the Desktop are never test output destinations.

Run `bun run test:fixtures` to check all six files. This command deliberately
fails if the private manifest or any fixture is absent. Public tests use only
generated synthetic data and run separately with `bun run test`.

These are session files, not complete sample/plugin collections. Successful
decoding does not prove that Ableton can load or play a rewritten project.
