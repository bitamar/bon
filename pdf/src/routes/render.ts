import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { renderPdf } from '../pdf/render-pdf.js';
import { renderInvoiceHtml } from '../pdf/render-html.js';
import { pdfRenderInputSchema } from '@bon/types/pdf';
import type { PdfRenderInput } from '@bon/types/pdf';

function hasStatusCode(err: unknown): err is { statusCode: number } {
  return (
    err != null &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
  );
}

function parseRenderInput(req: FastifyRequest, reply: FastifyReply): PdfRenderInput | null {
  const parsed = pdfRenderInputSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.status(400).send({ error: 'invalid_input', details: parsed.error.issues });
    return null;
  }
  return parsed.data;
}

export async function renderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/render', async (req, reply) => {
    const input = parseRenderInput(req, reply);
    if (!input) return reply;

    try {
      const pdfBuffer = await renderPdf(input);
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
    const input = parseRenderInput(req, reply);
    if (!input) return reply;

    const html = renderInvoiceHtml(input);
    return reply.type('text/html').send(html);
  });

  app.get('/health', async () => ({ ok: true }));
}
