import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createToolRegistry } from '../services/whatsapp/types.js';
import type { ToolRegistry } from '../services/whatsapp/types.js';
import { registerBusinessTools } from '../services/whatsapp/tools/business-tools.js';
import { registerInvoiceTools } from '../services/whatsapp/tools/invoice-tools.js';

declare module 'fastify' {
  interface FastifyInstance {
    toolRegistry: ToolRegistry;
  }
}

async function toolRegistryPlugin(app: FastifyInstance): Promise<void> {
  const registry = createToolRegistry();
  registerBusinessTools(registry);
  registerInvoiceTools(registry);
  app.decorate('toolRegistry', registry);
  app.log.info({ toolCount: registry.size }, 'tool registry initialized');
}

export const toolRegistryPluginExport = fp(toolRegistryPlugin, {
  name: 'tool-registry',
});
