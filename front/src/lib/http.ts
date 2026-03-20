import { API_BASE_URL } from '../config';

export class HttpError extends Error {
  status: number;
  code: string | undefined;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.code = (body as { error?: string } | undefined)?.error;
  }
}

/**
 * Detects raw Fastify/Zod validation messages (e.g. "body/phone Too big; expected...")
 * and replaces them with a user-friendly Hebrew message.
 */
function sanitizeValidationMessage(status: number, message: string): string {
  if (status === 400 && /^(body|querystring|params)\//.test(message)) {
    return 'הנתונים שהוזנו אינם תקינים';
  }
  return message;
}

export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body != null;
  const { headers: initHeaders, ...rest } = init;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...rest,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(initHeaders as Record<string, string>),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const typed = body as { error?: string; message?: string } | undefined;
    const raw = typed?.message || typed?.error || `Request failed: ${response.status}`;
    const message = sanitizeValidationMessage(response.status, raw);
    throw new HttpError(response.status, message, body);
  }

  return (await response.json()) as T;
}

export async function fetchBlob(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const typed = body as { error?: string; message?: string } | undefined;
    const raw = typed?.message || typed?.error || `Request failed: ${response.status}`;
    const message = sanitizeValidationMessage(response.status, raw);
    throw new HttpError(response.status, message, body);
  }

  return response;
}
