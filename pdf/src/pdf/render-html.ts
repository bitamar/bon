import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoiceTemplate } from './InvoiceTemplate.js';
import type { PdfRenderInput } from '@bon/types/pdf';

export function renderInvoiceHtml(input: PdfRenderInput): string {
  const element = createElement(InvoiceTemplate, input);
  return `<!DOCTYPE html>${renderToStaticMarkup(element)}`;
}
