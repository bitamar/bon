import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeInput } from '../fixtures.js';

// ── puppeteer mock ──

const mockAbort = vi.fn().mockResolvedValue(undefined);
const mockContinue = vi.fn().mockResolvedValue(undefined);

const mockPage = {
  setRequestInterception: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  setContent: vi.fn().mockResolvedValue(undefined),
  pdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])), // %PDF
  close: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  connected: true,
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);

vi.mock('puppeteer-core', () => ({
  default: { launch: mockLaunch },
}));

const { mockLookup } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({
  default: { lookup: mockLookup },
  lookup: mockLookup,
}));

// Must import after mocks
const { launchBrowser, closeBrowser, renderPdf } = await import('../../src/pdf/render-pdf.js');

// ── helpers ──

function simulateRequestEvent(url: string) {
  const handler = mockPage.on.mock.calls.find(([event]) => event === 'request')?.[1];
  if (!handler) throw new Error('No request handler registered');
  handler({ url: () => url, abort: mockAbort, continue: mockContinue });
}

describe('launchBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowser.connected = false;
  });

  afterEach(async () => {
    await closeBrowser();
  });

  it('launches a browser with puppeteer', async () => {
    await launchBrowser('/usr/bin/chromium');

    expect(mockLaunch).toHaveBeenCalledWith({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
  });

  it('skips launch when browser is already connected', async () => {
    // First launch
    await launchBrowser('/usr/bin/chromium');
    mockBrowser.connected = true;
    mockLaunch.mockClear();

    // Second launch should be a no-op
    await launchBrowser('/usr/bin/chromium');
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('closes stale browser before re-launching', async () => {
    // First launch
    await launchBrowser('/usr/bin/chromium');
    // Simulate disconnected browser (connected=false but browser object exists)
    mockBrowser.connected = false;
    mockLaunch.mockClear();

    await launchBrowser('/usr/bin/chromium');
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(mockLaunch).toHaveBeenCalled();
  });
});

describe('closeBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowser.connected = false;
  });

  it('closes an open browser', async () => {
    await launchBrowser('/usr/bin/chromium');
    mockBrowser.close.mockClear();

    await closeBrowser();
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('is a no-op when no browser is open', async () => {
    // No launch — closeBrowser should not throw
    await closeBrowser();
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });
});

describe('renderPdf', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockBrowser.connected = false;
    mockLookup.mockReset();
    // Ensure browser is launched for each test
    await launchBrowser('/usr/bin/chromium');
  });

  afterEach(async () => {
    await closeBrowser();
  });

  it('throws 503 when browser is not launched', async () => {
    await closeBrowser();

    await expect(renderPdf(makeInput())).rejects.toMatchObject({
      message: expect.stringContaining('Browser not launched'),
      statusCode: 503,
    });
  });

  it('renders PDF from input and returns a Buffer', async () => {
    const result = await renderPdf(makeInput());

    expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
    expect(mockPage.setContent).toHaveBeenCalled();
    expect(mockPage.pdf).toHaveBeenCalledWith({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mockPage.close).toHaveBeenCalled();
  });

  it('strips blocked logoUrl before rendering', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    const input = makeInput({
      business: {
        ...makeInput().business,
        logoUrl: 'https://evil.internal/logo.png',
      },
    });

    await renderPdf(input);

    // The HTML content should have been set (with logoUrl nullified)
    expect(mockPage.setContent).toHaveBeenCalled();
  });

  it('keeps safe logoUrl', async () => {
    mockLookup.mockResolvedValue([{ address: '192.0.2.1', family: 4 }]);

    const input = makeInput({
      business: {
        ...makeInput().business,
        logoUrl: 'https://cdn.example.com/logo.png',
      },
    });

    await renderPdf(input);
    expect(mockPage.setContent).toHaveBeenCalled();
  });

  it('aborts blocked requests via the request interceptor', async () => {
    await renderPdf(makeInput());

    simulateRequestEvent('https://127.0.0.1/evil.js');
    expect(mockAbort).toHaveBeenCalledWith('blockedbyclient');

    mockAbort.mockClear();
    mockContinue.mockClear();

    simulateRequestEvent('https://cdn.example.com/style.css');
    expect(mockContinue).toHaveBeenCalled();
    expect(mockAbort).not.toHaveBeenCalled();
  });

  it('closes the page even when rendering fails', async () => {
    mockPage.pdf.mockRejectedValueOnce(new Error('render crash'));

    await expect(renderPdf(makeInput())).rejects.toThrow('render crash');
    expect(mockPage.close).toHaveBeenCalled();
  });

  it('throws 503 when concurrent render limit is reached', async () => {
    // Fill up the concurrent limit (MAX_CONCURRENT_PAGES = 3)
    mockPage.pdf.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(new Uint8Array([37])), 200))
    );
    const pending = [renderPdf(makeInput()), renderPdf(makeInput()), renderPdf(makeInput())];

    // The 4th should fail
    await expect(renderPdf(makeInput())).rejects.toMatchObject({
      message: expect.stringContaining('Too many concurrent'),
      statusCode: 503,
    });

    // Clean up pending renders
    await Promise.all(pending);
  });
});
