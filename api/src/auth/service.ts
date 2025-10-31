import type { AuthError, DbUser, Result, UserRepository } from './types.js';
import { serializeOidcCookie, parseOidcCookie, verifyStateMatch } from './cookies.js';
import { validateCallbackQuery, validateClaims } from './validation.js';
import {
  buildAuthUrl,
  buildCallbackVerificationUrl,
  exchangeAuthorizationCode,
  generateStateNonce,
} from './oidc.js';
import { OIDC_COOKIE_NAME, OIDC_COOKIE_OPTIONS } from './constants.js';
import type { DiscoveredConfig } from './oidc.js';

export function startGoogleAuth(
  config: DiscoveredConfig,
  opts: { redirectUri: string; appOrigin: string }
) {
  const { state, nonce } = generateStateNonce();
  const authUrl = buildAuthUrl(config, { state, nonce }, { redirectUri: opts.redirectUri });

  const cookie = {
    name: OIDC_COOKIE_NAME,
    value: serializeOidcCookie({ state, nonce, appOrigin: opts.appOrigin }),
    options: OIDC_COOKIE_OPTIONS,
  };

  return { cookie, redirectUrl: authUrl.href };
}

export async function finishGoogleAuth(
  deps: {
    config: DiscoveredConfig;
    repo: UserRepository;
    now: () => Date;
    redirectUri: string;
  },
  input: { requestUrl: string; query: unknown; rawCookie: string | undefined }
): Promise<Result<{ user: DbUser; appOrigin: string }, AuthError>> {
  // validate query
  const query = validateCallbackQuery(input.query);
  if (!query.ok) return { ok: false, error: query.error };

  // parse cookie
  const parsedCookie = parseOidcCookie(input.rawCookie);
  if (!parsedCookie.ok) return { ok: false, error: parsedCookie.error };

  // verify state
  const match = verifyStateMatch(parsedCookie.data.state, query.data.state);
  if (!match.ok) return { ok: false, error: match.error };

  // exchange code -> tokens and claims
  const verificationUrl = buildCallbackVerificationUrl(deps.redirectUri, input.requestUrl);
  const exchanged = await exchangeAuthorizationCode(deps.config, verificationUrl, {
    expectedState: query.data.state,
    expectedNonce: parsedCookie.data.nonce,
    redirectUri: deps.redirectUri,
  });
  if (!exchanged.ok) return { ok: false, error: exchanged.error };

  const rawClaims = exchanged.data.claims?.();
  const claimsRes = validateClaims(rawClaims);
  if (!claimsRes.ok) return { ok: false, error: claimsRes.error };

  const { sub, email, name, picture } = claimsRes.data;
  const user = await deps.repo.upsertByEmail({
    email,
    googleId: sub,
    name: name ?? null,
    avatarUrl: picture ?? null,
    now: deps.now(),
  });

  return { ok: true, data: { user, appOrigin: parsedCookie.data.appOrigin } };
}
