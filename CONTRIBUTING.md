# Contributing

Use synthetic sessions generated in tests. Never attach real user sessions,
plugin state, media, extracted XML or local filesystem paths to public issues,
pull requests or logs. Describe a problem with an anonymized synthetic example.

Keep one public action per file. Changes must preserve unknown content and
must not overwrite source projects. Test behavior and byte preservation, not
source structure. Run the validation sequence in README before proposing a change.

A successful parse is not proof of safe editing. New writer variants require
format evidence, preservation tests and separate native Ableton validation.

Before committing or pushing, stage explicit files and run `bun run check:public`.
This audits the index and reachable Git history. Review the diff manually as well:
pattern checks are a guardrail, not a guarantee against every kind of sensitive data.
