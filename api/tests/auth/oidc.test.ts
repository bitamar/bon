import { describe, it, expect, vi } from 'vitest';
import { buildAuthUrl } from '../../src/auth/oidc.js';

vi.mock('openid-client', () => ({
  buildAuthorizationUrl: (
    _config: unknown,
    params: { state: string; nonce: string; redirect_uri: string; scope: string }
  ) => {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    url.searchParams.set('redirect_uri', params.redirect_uri);
    url.searchParams.set('scope', params.scope);
    return url;
  },
}));

const fakeConfig = {} as unknown as import('../../src/auth/oidc.js').DiscoveredConfig;

describe('oidc helpers', () => {
  it('buildAuthUrl includes params', () => {
    const url = buildAuthUrl(
      fakeConfig,
      { state: 's', nonce: 'n' },
      { redirectUri: 'https://app/cb' }
    );
    const { searchParams } = new URL(url.href);
    expect(searchParams.get('state')).toBe('s');
    expect(searchParams.get('nonce')).toBe('n');
    expect(searchParams.get('redirect_uri')).toBe('https://app/cb');
    expect(searchParams.get('scope')).toContain('openid');
  });
});
