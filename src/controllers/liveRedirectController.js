import crypto from 'crypto';
import streamManager from '../services/streamManager.js';
import { getXtreamUser } from '../services/authService.js';
import { decrypt } from '../utils/crypto.js';
import {
  applyProviderToChannel,
  ensureUserConnectionAvailable,
  findAvailableProvider,
  getChannel,
  recordStreamStat,
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

    // Keep the same cleanup behavior used by the normal Live path for a
    // repeated request from the same user/IP.
    await streamManager.cleanupUser(user.id, req.ip);

    if (!await ensureUserConnectionAvailable(user, req.ip, channel.name, channel.provider_id)) {
      return res.status(403).send('Max connections reached');
    }

    const availableProvider = await findAvailableProvider(user.id, channel, req.ip, channel.name);
    if (!availableProvider) {
      return res.status(403).send('Provider max connections reached across all accounts');
    }

    applyProviderToChannel(channel, availableProvider);

    // Register the session without a local HTTP response resource. After the
    // redirect, the actual media connection belongs to the upstream provider.
    await streamManager.add(connectionId, user, channel.name, req.ip, null, channel.provider_id);

    recordStreamStat(channel.provider_channel_id, 'Live Redirect');

    const providerPass = decrypt(channel.provider_pass);
    const base = channel.provider_url.replace(/\/+$/, '');
    const remoteUrl = `${base}/live/${encodeURIComponent(channel.provider_user)}/${encodeURIComponent(providerPass)}/${channel.remote_stream_id}.ts`;

    res.redirect(302, remoteUrl);
  } catch (e) {
    console.error('Live redirect error:', e.message);
    await streamManager.remove(connectionId);
    if (!res.headersSent) return res.sendStatus(500);
  }
};
