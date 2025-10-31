export const SESSION_TTL = 60 * 60 * 24 * 7;

export const OIDC_COOKIE_NAME = 'oidc' as const;
export const OIDC_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 300,
};

export const SESSION_COOKIE_NAME = 'session' as const;
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  path: '/',
  maxAge: SESSION_TTL,
};

export const OIDC_SCOPE = 'openid email profile' as const;
