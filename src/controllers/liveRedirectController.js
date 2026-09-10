import crypto from 'crypto';
import streamManager from '../services/streamManager.js';
import { getXtreamUser } from '../services/authService.js';
import { decrypt } from '../utils/crypto.js';
import {
  getChannel,
  recordStreamStat,
  reserveChannelSession,
  shareGuestAllowed
} from './streamControllerHelpers.js';

/**
 * Live TV redirect mode.
 *
 * Authentication, channel authorization, provider selection and existing
 * connection checks are performed by IPTV-Manager. The media bytes are not
 * proxied by IPTV-Manager; the client is redirected to the selected provider.
 *
 * Intentionally limited to the normal .ts Live TV endpoint. HLS (.m3u8),
 * transcoding, VOD, Series, Timeshift and DASH remain on their existing paths.
 */
export const redirectLive = async (req, res) => {
  const connectionId = crypto.randomUUID();

  try {
    const streamId = Number(req.params.stream_id || 0);
    if (!streamId) return res.sendStatus(404);

    const user = await getXtreamUser(req);
    if (!user) return res.sendStatus(401);

    const channel = getChannel(streamId, user.id);
    if (!channel) return res.sendStatus(404);

    if (!shareGuestAllowed(user, channel)) return res.sendStatus(403);

    // Preserve the existing provider selection and user connection checks.
    // No local response resource is registered because IPTV-Manager will not
    // own the downstream media socket after the redirect.
    if (!await reserveChannelSession(connectionId, user, channel, req, res, channel.name, {
      cleanupUser: true,
      delayMs: 100
    })) return;

    recordStreamStat(channel.provider_channel_id, 'Live Redirect');

    const providerPass = decrypt(channel.provider_pass);
    const base = channel.provider_url.replace(/\/+$/, '');
    const remoteUrl = `${base}/live/${encodeURIComponent(channel.provider_user)}/${encodeURIComponent(providerPass)}/${channel.remote_stream_id}.ts`;

    // The session is intentionally retained in StreamManager for its normal
    // stale-session cleanup/connection accounting. There is no local media
    // resource to destroy because playback continues at the provider.
    res.redirect(302, remoteUrl);
  } catch (e) {
    console.error('Live redirect error:', e.message);
    streamManager.localStreams.delete(connectionId);
    await streamManager.remove(connectionId);
    if (!res.headersSent) return res.sendStatus(500);
  }
};
