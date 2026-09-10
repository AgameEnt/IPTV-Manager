# A-Game Live TV Redirect Design

## Scope
Live TV only. EPG, VOD, Series, playlist management, provider synchronization, authentication, authorization, and existing administration features remain unchanged.

## Current behavior
`getPlaylist()` generates IPTV-Manager `/live/:username/:password/:stream_id.ts|.m3u8` URLs. The `/live/...` routes call `proxyLive`, which authenticates the user, resolves the authorized channel, reserves a session/provider, constructs the upstream provider URL, fetches the upstream stream, and pipes the media through IPTV-Manager.

## Target behavior
Keep the existing authentication, authorization, provider selection, connection-limit checks, and stream statistics. For standard Live TV playback, after the appropriate provider has been selected, return an HTTP 302 response whose `Location` points to the selected upstream provider Live TV URL. The APK has been independently verified to follow HTTP 302 redirects.

## Important implementation consideration
The existing `reserveChannelSession()` records a local/Redis session and is currently paired with a proxied resource. Redirecting means IPTV-Manager no longer owns the media socket, so cleanup of the local stream resource must not break the session record. The implementation should therefore preserve connection accounting without assuming IPTV-Manager has a local media body to destroy.

## HLS
The current `.m3u8` path fetches and rewrites the provider playlist and segment URLs through IPTV-Manager. The first minimum implementation target should be normal `.ts` Live TV redirect behavior. HLS behavior should be explicitly tested before enabling redirect behavior for `.m3u8`, because an HTTP redirect to a provider HLS playlist may cause subsequent segment requests to go directly upstream and may require provider-compatible authorization/headers.

## Success criteria
- Customer requests IPTV-Manager Xtream playlist/API.
- Playlist remains managed by IPTV-Manager.
- EPG remains served by IPTV-Manager.
- User authorization remains enforced.
- Live `.ts` playback returns a 302 to the selected upstream provider URL.
- IPTV-Manager does not proxy the Live TV media bytes.
- VOD, Series, EPG, playlist editing, and provider/catalog management are unaffected.
