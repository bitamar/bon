import { API_BASE_URL } from '../config';

export class HttpError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body !== undefined && init.body !== null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message =
      (body && (body as { error?: string; message?: string }).error) ||
      (body && (body as { message?: string }).message) ||
      `Request failed: ${response.status}`;
    throw new HttpError(response.status, message, body);
  }

  return (await response.json()) as T;
}
