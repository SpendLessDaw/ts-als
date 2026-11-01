# Release checklist

No push triggers npm publication. `private: true` and `prepublishOnly` block it during bootstrap.

1. Run unit tests, local private corpus tests, typecheck, lint, build and check:package.
2. Record native Ableton opening/playback/save/reopen validation before advertising writer compatibility. Until then keep all writer documentation explicitly experimental.
3. Review staged files and the complete Git history with check:public and manual inspection. Exclude sessions, media, dumps, reports, private paths and credentials.
4. Run check:package: inspect the actual tarball and install it in isolation.
5. Only for an explicitly authorized release, choose a version, document changes, remove private:true and replace the bootstrap publication block with release checks. Recheck npm name availability and account ownership.
6. Publish manually using a separately authenticated npm session, or configure trusted publishing separately. Never commit credentials. Verify the registry artifact and tag the exact released commit.

The name ts-als was available during setup but is not reserved. Private corpus tests require local files and Python 3; public CI and consumers must not need them.
