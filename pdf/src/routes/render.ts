import type { FastifyInstance } from 'fastify';
import { renderPdf } from '../pdf/render-pdf.js';
import { renderInvoiceHtml } from '../pdf/render-html.js';
import type { PdfRenderInput } from '@bon/types/pdf';

export async function renderRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: PdfRenderInput }>('/render', async (req, reply) => {
    const input = req.body;

    try {
      const pdfBuffer = await renderPdf(input);
      return reply
        .type('application/pdf')
        .header('Content-Length', pdfBuffer.length)
        .send(pdfBuffer);
    } catch (err: unknown) {
      const error = err as { statusCode?: number; message?: string };
      if (error.statusCode === 503) {
        return reply.status(503).send({ error: 'too_many_concurrent_renders' });
      }
      req.log.error(err, 'PDF render failed');
      return reply.status(500).send({ error: 'render_failed' });
    }
  });

  app.post<{ Body: PdfRenderInput }>('/render-html', async (req, reply) => {
    const html = renderInvoiceHtml(req.body);
    return reply.type('text/html').send(html);
  });

  app.get('/health', async () => ({ ok: true }));
}
