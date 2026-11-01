# TS-ALS

Independent library, not part of the SpendLess app workspace. Follow the
one-action/one-file convention, with matching exported function names. Use
ts-flp as an API/testing reference, not as a binary format specification.

Private fixtures and derived dumps must never enter Git, npm, logs or public
issues. Do not modify originals or write into test_projs. Use temporary output
directories for future writer tests. No remote, commit, push or publication
without explicit authorization. Prereleases publish under the alpha tag; native validation remains pending.

Public API includes structured reading and experimental targeted writing. Do not
claim broad Live compatibility or native Ableton validation without evidence.
Implement XML handling with a structured parser, explicit resource limits and
no external entity resolution. Preserve unknown data and plugin state before
adding any writer. Never reconstruct a whole session casually.

Run validation sequentially: test, test:fixtures, typecheck, lint, build and
ESM/CJS smoke checks. No automated visual tests. Native Ableton testing will be
performed by the user's tester after SpendLess integration.
