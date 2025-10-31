export function isHostAllowed(host: string, allowedHost: string): boolean {
  return host.toLowerCase() === allowedHost.toLowerCase();
}

export function parseOriginHeader(value: string): { origin: string; host: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const normalizedOrigin = `${url.protocol}//${url.host}`;
    return { origin: normalizedOrigin, host: url.host };
  } catch {
    return null;
  }
}
