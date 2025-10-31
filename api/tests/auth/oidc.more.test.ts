import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    discovery: vi.fn(),
    authorizationCodeGrant: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    randomState: vi.fn(),
    randomNonce: vi.fn(),
    ClientSecretPost: vi.fn((secret: string) => ({ authMethod: 'client_secret_post', secret })),
  };
});

vi.mock('openid-client', () => ({
  __esModule: true,
  discovery: mocks.discovery,
  authorizationCodeGrant: mocks.authorizationCodeGrant,
  buildAuthorizationUrl: mocks.buildAuthorizationUrl,
  randomState: mocks.randomState,
  randomNonce: mocks.randomNonce,
  ClientSecretPost: mocks.ClientSecretPost,
}));

import {
  buildCallbackVerificationUrl,
  exchangeAuthorizationCode,
  generateStateNonce,
  getGoogleOidcConfig,
  type DiscoveredConfig,
  type TokensType,
} from '../../src/auth/oidc.js';

const fakeConfig = {} as unknown as DiscoveredConfig;

describe('oidc helpers – extended', () => {
  beforeEach(() => {
    mocks.discovery.mockReset();
    mocks.authorizationCodeGrant.mockReset();
    mocks.buildAuthorizationUrl.mockReset();
    mocks.randomState.mockReset();
    mocks.randomNonce.mockReset();
  });

  it('generateStateNonce returns values from openid-client randomizers', () => {
    mocks.randomState.mockReturnValue('state-123');
    mocks.randomNonce.mockReturnValue('nonce-456');
    const res = generateStateNonce();
    expect(res).toEqual({ state: 'state-123', nonce: 'nonce-456' });
  });

  it('buildCallbackVerificationUrl picks only query string', () => {
    const url = buildCallbackVerificationUrl('https://app.example.com/cb', '/cb?x=1&y=2');
    expect(url.href).toBe('https://app.example.com/cb?x=1&y=2');
  });

  it('buildCallbackVerificationUrl keeps no query when none present', () => {
    const url = buildCallbackVerificationUrl('https://app.example.com/cb', '/cb');
    expect(url.href).toBe('https://app.example.com/cb');
  });

  it('exchangeAuthorizationCode resolves on success', async () => {
    const tokens = {
      id_token: 'id',
      access_token: 'at',
      claims: () => ({ sub: '1' }),
    } as unknown as TokensType;
    mocks.authorizationCodeGrant.mockResolvedValue(tokens);
    const res = await exchangeAuthorizationCode(
      fakeConfig,
      new URL('https://app.example.com/cb?code=abc&state=s'),
      { expectedState: 's', expectedNonce: 'n', redirectUri: 'https://app.example.com/cb' }
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBe(tokens);
  });

  it('exchangeAuthorizationCode returns oauth_exchange_failed on error', async () => {
    mocks.authorizationCodeGrant.mockRejectedValue(new Error('boom'));
    const res = await exchangeAuthorizationCode(
      fakeConfig,
      new URL('https://app.example.com/cb?code=abc&state=s'),
      { expectedState: 's', expectedNonce: 'n', redirectUri: 'https://app.example.com/cb' }
    );
    expect(res).toEqual({ ok: false, error: 'oauth_exchange_failed' });
  });

  it('getGoogleOidcConfig calls discovery with proper arguments', async () => {
    const resolved = { issuer: 'https://issuer' } as unknown as DiscoveredConfig;
    mocks.discovery.mockResolvedValue(resolved);
    const config = await getGoogleOidcConfig('client-id', 'client-secret');
    expect(mocks.discovery).toHaveBeenCalledTimes(1);
    const [issuerUrl, clientId, undef, authMethod] = mocks.discovery.mock.calls[0];
    expect(String(issuerUrl)).toBe('https://accounts.google.com/');
    expect(clientId).toBe('client-id');
    expect(undef).toBeUndefined();
    expect(authMethod).toEqual({ authMethod: 'client_secret_post', secret: 'client-secret' });
    expect(config).toBe(resolved);
  });
});
