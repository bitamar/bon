import Fastify from 'fastify';
import { env } from './env.js';
import { renderRoutes } from './routes/render.js';
import { launchBrowser, closeBrowser } from './pdf/render-pdf.js';

const app = Fastify({ logger: true });

await app.register(renderRoutes);

await launchBrowser(env.CHROMIUM_PATH);

let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    await app.close();
  } catch {
    // Best-effort close
  }
  try {
    await closeBrowser();
  } catch {
    // Best-effort close
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
