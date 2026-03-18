import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';
import { renderRoutes } from '../../src/routes/render.js';
import { renderPdf } from '../../src/pdf/render-pdf.js';
import { renderInvoiceHtml } from '../../src/pdf/render-html.js';
import type { FastifyInstance } from 'fastify';
import { makeInput } from '../fixtures.js';

vi.mock('../../src/pdf/render-pdf.js', () => ({
  renderPdf: vi.fn(),
}));
vi.mock('../../src/pdf/render-html.js', () => ({
  renderInvoiceHtml: vi.fn(),
}));

const VALID_INPUT = makeInput();

// ── helpers ──

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(renderRoutes);
  await app.ready();
  return app;
}

describe('renderRoutes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET /health returns 200 with { ok: true }', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  describe('POST /render', () => {
    it('returns 200 with application/pdf content type on happy path', async () => {
      const pdfBuffer = Buffer.from('fake-pdf-content');
      vi.mocked(renderPdf).mockResolvedValue(pdfBuffer);

      const res = await app.inject({
        method: 'POST',
        url: '/render',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.rawPayload).toEqual(pdfBuffer);
    });

    it('returns 400 for invalid input', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/render',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_input' });
    });

    it('returns 503 when renderPdf throws with statusCode 503', async () => {
      const err = Object.assign(new Error('too many renders'), { statusCode: 503 });
      vi.mocked(renderPdf).mockRejectedValue(err);

      const res = await app.inject({
        method: 'POST',
        url: '/render',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: 'too_many_concurrent_renders' });
    });

    it('returns 500 when renderPdf throws a generic error', async () => {
      vi.mocked(renderPdf).mockRejectedValue(new Error('unexpected failure'));

      const res = await app.inject({
        method: 'POST',
        url: '/render',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'render_failed' });
    });
  });

  describe('POST /render-html', () => {
    it('returns 200 with text/html content type on happy path', async () => {
      const html = '<!DOCTYPE html><html><body>invoice</body></html>';
      vi.mocked(renderInvoiceHtml).mockReturnValue(html);

      const res = await app.inject({
        method: 'POST',
        url: '/render-html',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toBe(html);
    });

    it('returns 400 for invalid input', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/render-html',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_input' });
    });

    it('returns 500 when renderInvoiceHtml throws', async () => {
      vi.mocked(renderInvoiceHtml).mockImplementation(() => {
        throw new Error('template error');
      });

      const res = await app.inject({
        method: 'POST',
        url: '/render-html',
        payload: VALID_INPUT,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'render_failed' });
    });
  });
});
