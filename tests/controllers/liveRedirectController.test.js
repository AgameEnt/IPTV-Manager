import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirectLive } from '../../src/controllers/liveRedirectController.js';
import * as authService from '../../src/services/authService.js';
import * as helpers from '../../src/controllers/streamControllerHelpers.js';
import streamManager from '../../src/services/streamManager.js';

vi.mock('../../src/services/authService.js');
vi.mock('../../src/controllers/streamControllerHelpers.js', () => ({
  applyProviderToChannel: vi.fn((channel, provider) => {
    channel.provider_id = provider.id;
    channel.provider_url = provider.url;
    channel.provider_user = provider.username;
    channel.provider_pass = provider.password;
    channel.provider_max_connections = provider.max_connections;
  }),
  ensureUserConnectionAvailable: vi.fn().mockResolvedValue(true),
  findAvailableProvider: vi.fn().mockResolvedValue({
    id: 20,
    url: 'http://provider.example:8080',
    username: 'provider-user',
    password: 'provider-pass',
    max_connections: 10,
  }),
  getChannel: vi.fn(() => ({
    user_channel_id: 7,
    provider_channel_id: 70,
    provider_id: 10,
    provider_url: 'http://old-provider.example',
    provider_user: 'old-user',
    provider_pass: 'encrypted-pass',
    remote_stream_id: 1234,
    name: 'Test Channel',
  })),
  recordStreamStat: vi.fn(),
  shareGuestAllowed: vi.fn(() => true),
}));
vi.mock('../../src/services/streamManager.js', () => ({
  default: {
    cleanupUser: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../src/utils/crypto.js', () => ({
  decrypt: vi.fn((value) => value === 'encrypted-pass' ? 'provider-pass' : value),
}));

describe('Live TV redirect controller', () => {
  let req;
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    authService.getXtreamUser.mockResolvedValue({
      id: 1,
      username: 'customer',
      max_connections: 2,
      allowed_channels: [7],
    });

    req = {
      params: { stream_id: '1234', username: 'customer', password: 'customer-pass' },
      ip: '192.0.2.10',
    };

    res = {
      headersSent: false,
      redirect: vi.fn(),
      sendStatus: vi.fn(),
      status: vi.fn(() => res),
      send: vi.fn(),
    };
  });

  it('authenticates, authorizes, selects the provider, and returns a 302 upstream URL', async () => {
    await redirectLive(req, res);

    expect(authService.getXtreamUser).toHaveBeenCalledWith(req);
    expect(helpers.getChannel).toHaveBeenCalledWith(1234, 1);
    expect(helpers.shareGuestAllowed).toHaveBeenCalled();
    expect(helpers.ensureUserConnectionAvailable).toHaveBeenCalled();
    expect(helpers.findAvailableProvider).toHaveBeenCalled();
    expect(helpers.applyProviderToChannel).toHaveBeenCalled();
    expect(streamManager.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 1 }),
      'Test Channel',
      '192.0.2.10',
      null,
      20
    );
    expect(helpers.recordStreamStat).toHaveBeenCalledWith(70, 'Live Redirect');
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'http://provider.example:8080/live/provider-user/provider-pass/1234.ts'
    );
  });

  it('does not redirect an unauthenticated request', async () => {
    authService.getXtreamUser.mockResolvedValue(null);

    await redirectLive(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(streamManager.add).not.toHaveBeenCalled();
  });

  it('does not redirect an unauthorized channel', async () => {
    helpers.shareGuestAllowed.mockReturnValue(false);

    await redirectLive(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(streamManager.add).not.toHaveBeenCalled();
  });

  it('does not register a local response resource', async () => {
    await redirectLive(req, res);

    expect(streamManager.add.mock.calls[0][4]).toBeNull();
  });
});
