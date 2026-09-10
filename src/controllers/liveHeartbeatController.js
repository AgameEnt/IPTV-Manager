import { getXtreamUser } from '../services/authService.js';
import streamManager from '../services/streamManager.js';
import { getChannel, shareGuestAllowed } from './streamControllerHelpers.js';

/**
 * Refresh the IPTV-Manager session for a Live TV stream that was redirected
 * to the upstream provider. No media is proxied by this endpoint.
 */
export const heartbeatLive = async (req, res) => {
  try {
    const streamId = Number(req.params.stream_id || 0);
    if (!streamId) return res.sendStatus(404);

    const user = await getXtreamUser(req);
    if (!user) return res.sendStatus(401);

    const channel = getChannel(streamId, user.id);
    if (!channel) return res.sendStatus(404);

    if (!shareGuestAllowed(user, channel)) return res.status(403).send('Forbidden');

    const touched = await streamManager.touchSession(
      user.id,
      req.ip,
      channel.name
    );

    if (!touched) return res.sendStatus(404);
    return res.sendStatus(204);
  } catch (e) {
    console.error('Live heartbeat error:', e.message);
    if (!res.headersSent) return res.sendStatus(500);
  }
};
