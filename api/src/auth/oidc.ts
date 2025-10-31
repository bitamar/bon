import * as oidc from 'openid-client';
import type { Result } from './types.js';
import { OIDC_SCOPE } from './constants.js';

export type DiscoveredConfig = Parameters<typeof oidc.buildAuthorizationUrl>[0];
export type TokensType = Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;

export async function getGoogleOidcConfig(
  clientId: string,
  clientSecret: string
): Promise<DiscoveredConfig> {
  return oidc.discovery(
    new URL('https://accounts.google.com'),
    clientId,
    undefined,
    oidc.ClientSecretPost(clientSecret)
  );
}

export function generateStateNonce(): { state: string; nonce: string } {
  return { state: oidc.randomState(), nonce: oidc.randomNonce() };
}

export function buildAuthUrl(
  config: DiscoveredConfig,
  params: { state: string; nonce: string },
  opts: { redirectUri: string }
) {
  return oidc.buildAuthorizationUrl(config, {
    scope: OIDC_SCOPE,
    redirect_uri: opts.redirectUri,
    state: params.state,
    nonce: params.nonce,
  });
}

export function buildCallbackVerificationUrl(redirectUri: string, requestUrl: string): URL {
  const currentUrl = new URL(redirectUri);
  const queryIndex = requestUrl.indexOf('?');
  currentUrl.search = queryIndex >= 0 ? requestUrl.slice(queryIndex) : '';
  return currentUrl;
}

type Options = { expectedState: string; expectedNonce: string; redirectUri: string };
export async function exchangeAuthorizationCode(
  config: DiscoveredConfig,
  verificationUrl: URL,
  { expectedState, expectedNonce, redirectUri }: Options
): Promise<Result<TokensType, 'oauth_exchange_failed'>> {
  try {
    const tokens = await oidc.authorizationCodeGrant(
      config,
      verificationUrl,
      { expectedState, expectedNonce, idTokenExpected: true },
      { redirect_uri: redirectUri }
    );
    return { ok: true, data: tokens };
  } catch {
    return { ok: false, error: 'oauth_exchange_failed' };
  }
}
