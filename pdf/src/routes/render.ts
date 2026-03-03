import type { FastifyInstance } from 'fastify';
import { renderPdf } from '../pdf/render-pdf.js';
import { renderInvoiceHtml } from '../pdf/render-html.js';
import { pdfRenderInputSchema } from '@bon/types/pdf';

function hasStatusCode(err: unknown): err is { statusCode: number } {
  return (
    err != null &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
  );
}

export async function renderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/render', async (req, reply) => {
    const parsed = pdfRenderInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input', details: parsed.error.issues });
    }

    try {
      const pdfBuffer = await renderPdf(parsed.data);
      return reply
        .type('application/pdf')
        .header('Content-Length', pdfBuffer.length)
        .send(pdfBuffer);
    } catch (err: unknown) {
      if (hasStatusCode(err) && err.statusCode === 503) {
        return reply.status(503).send({ error: 'too_many_concurrent_renders' });
      }
      req.log.error(err, 'PDF render failed');
      return reply.status(500).send({ error: 'render_failed' });
    }
  });

  app.post('/render-html', async (req, reply) => {
    const parsed = pdfRenderInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_input', details: parsed.error.issues });
    }
    const html = renderInvoiceHtml(parsed.data);
    return reply.type('text/html').send(html);
  });

  app.get('/health', async () => ({ ok: true }));
}
