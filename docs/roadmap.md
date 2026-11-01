# Deferred work

The first scope is ALS reading/targeted writes and optional sample inspection in
both ts-als and ts-flp. Each engine keeps its own API and types. A multi-DAW
facade belongs to a future separate library. SpendLess integration is separate.

Future candidates, not implemented or promised:
- Track names, colors and groups; distinguish FL Playlist/Channel Rack/Mixer.
- Arrangements, markers, time signatures and calculated arrangement duration.
- Clips, patterns, Session scenes and their relationship to Arrangement.
- Plugin location within tracks/racks and native-device inventories.
- Freeze state, Warp, annotations and Max for Live dependencies.
- Broader version coverage and additional conservative editing operations.

Title, artist, genre, tags, status and personal notes are managed by SpendLess;
no new ALS fields are invented. Existing FL metadata APIs remain unchanged.

Scale extraction is excluded: Live's header selector follows selected clips,
not a single global musical key for the whole set. No per-clip scale summary or
FL scale reverse engineering is planned in this scope.
