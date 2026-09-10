import { describe, it, expect, vi, beforeEach } from 'vitest';
import { heartbeatLive } from '../../src/controllers/liveHeartbeatController.js';
import * as authService from '../../src/services/authService.js';
import * as helpers from '../../src/controllers/streamControllerHelpers.js';
import streamManager from '../../src/services/streamManager.js';

vi.mock('../../src/services/authService.js');
vi.mock('../../src/controllers/streamControllerHelpers.js', () => ({
  getChannel: vi.fn(() => ({
    user_channel_id: 7,
    name: 'Test Channel',
  })),
  shareGuestAllowed: vi.fn(() => true),
}));
vi.mock('../../src/services/streamManager.js', () => ({
  default: {
    touchSession: vi.fn().mockResolvedValue(1),
  },
}));

describe('Live TV redirect heartbeat controller', () => {
  let req;
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    authService.getXtreamUser.mockResolvedValue({
      id: 1,
      username: 'customer',
    });

    req = {
      params: { stream_id: '1234', username: 'customer', password: 'customer-pass' },
      ip: '192.0.2.10',
    };

    res = {
      headersSent: false,
      sendStatus: vi.fn(),
      status: vi.fn(() => res),
      send: vi.fn(),
    };
  });

  it('authenticates the customer and refreshes the redirected stream session', async () => {
    await heartbeatLive(req, res);

    expect(authService.getXtreamUser).toHaveBeenCalledWith(req);
    expect(helpers.getChannel).toHaveBeenCalledWith(1234, 1);
    expect(helpers.shareGuestAllowed).toHaveBeenCalled();
    expect(streamManager.touchSession).toHaveBeenCalledWith(1, '192.0.2.10', 'Test Channel');
    expect(res.sendStatus).toHaveBeenCalledWith(204);
  });

  it('rejects an unauthenticated heartbeat', async () => {
    authService.getXtreamUser.mockResolvedValue(null);

    await heartbeatLive(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(streamManager.touchSession).not.toHaveBeenCalled();
  });

  it('returns 404 when the redirected session is no longer active', async () => {
    streamManager.touchSession.mockResolvedValue(0);

    await heartbeatLive(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(404);
  });
});
