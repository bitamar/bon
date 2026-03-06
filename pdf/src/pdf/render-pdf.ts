import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { Browser, Page, HTTPRequest } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import { renderInvoiceHtml } from './render-html.js';
import type { PdfRenderInput } from '@bon/types/pdf';

const BLOCKED_IPV4_PREFIXES = [
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  '127.',
  '0.',
  '169.254.',
];

const BLOCKED_IPV6_PREFIXES = ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb', 'ff'];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata.internal']);

function isBlockedIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const mappedPrefix = '::ffff:';
  if (lower.startsWith(mappedPrefix)) {
    const embedded = lower.slice(mappedPrefix.length);
    if (BLOCKED_IPV4_PREFIXES.some((prefix) => embedded.startsWith(prefix))) return true;
  }

  return BLOCKED_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isBlockedIp(addr: string): boolean {
  if (net.isIPv4(addr)) {
    return BLOCKED_IPV4_PREFIXES.some((prefix) => addr.startsWith(prefix));
  }
  if (net.isIPv6(addr)) {
    return isBlockedIpv6(addr);
  }
  return false;
}

function isBlockedRequest(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return true;

    // Strip brackets from IPv6 hostnames (e.g. [::1] -> ::1) and trailing dots
    const raw = parsed.hostname;
    const stripped = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
    const hostname = stripped.replace(/\.+$/, '').toLowerCase();

    if (BLOCKED_HOSTNAMES.has(hostname)) return true;

    return isBlockedIp(stripped);
  } catch {
    return true;
  }
}

async function isBlockedAfterDns(urlStr: string): Promise<boolean> {
  if (isBlockedRequest(urlStr)) return true;

  try {
    const parsed = new URL(urlStr);
    const raw = parsed.hostname;
    const stripped = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
    const hostname = stripped.replace(/\.+$/, '').toLowerCase();

    if (BLOCKED_HOSTNAMES.has(hostname)) return true;

    // Skip DNS for literal IPs — already checked by isBlockedRequest
    if (net.isIPv4(hostname) || net.isIPv6(hostname)) return false;

    const addresses = await dns.lookup(hostname, { all: true });
    return addresses.some((entry) => isBlockedIp(entry.address));
  } catch {
    // DNS resolution failure → block to be safe
    return true;
  }
}

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

export { isBlockedRequest, isBlockedAfterDns };

export async function renderPdf(input: PdfRenderInput): Promise<Buffer> {
  if (!browser) {
    throw Object.assign(new Error('Browser not launched. Call launchBrowser() first.'), {
      statusCode: 503,
    });
  }

  if (activePagesCount >= MAX_CONCURRENT_PAGES) {
    throw Object.assign(new Error('Too many concurrent PDF renders'), { statusCode: 503 });
  }

  activePagesCount++;
  let page: Page | null = null;

  try {
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req: HTTPRequest) => {
      if (isBlockedRequest(req.url())) {
        req.abort('blockedbyclient').catch(() => {});
      } else {
        // Puppeteer request interception is synchronous — DNS check runs async
        // so we continue the request but rely on the synchronous blocklist for
        // immediate protection. For comprehensive DNS-based SSRF protection,
        // logoUrl is pre-validated before rendering.
        req.continue().catch(() => {});
      }
    });

    // Pre-validate logoUrl with DNS resolution before rendering
    if (input.business.logoUrl) {
      const blocked = await isBlockedAfterDns(input.business.logoUrl);
      if (blocked) {
        input = { ...input, business: { ...input.business, logoUrl: null } };
      }
    }

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
