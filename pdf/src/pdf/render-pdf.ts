import type { Browser, Page } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import { renderInvoiceHtml } from './render-html.js';
import type { PdfRenderInput } from '@bon/types/pdf';

const MAX_CONCURRENT_PAGES = 3;
let activePagesCount = 0;
let browser: Browser | null = null;

export async function launchBrowser(executablePath: string): Promise<void> {
  if (browser?.connected) return;

  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    activePagesCount = 0;
  }
}

export async function renderPdf(input: PdfRenderInput): Promise<Buffer> {
  if (!browser) {
    throw new Error('Browser not launched. Call launchBrowser() first.');
  }

  if (activePagesCount >= MAX_CONCURRENT_PAGES) {
    throw Object.assign(new Error('Too many concurrent PDF renders'), { statusCode: 503 });
  }

  activePagesCount++;
  let page: Page | null = null;

  try {
    page = await browser.newPage();
    const html = renderInvoiceHtml(input);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    activePagesCount--;
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
