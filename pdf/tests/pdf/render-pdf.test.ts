import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBlockedRequest, isBlockedAfterDns } from '../../src/pdf/render-pdf.js';

const { mockLookup } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({
  default: { lookup: mockLookup },
  lookup: mockLookup,
}));

// ── helpers ──

function expectBlocked(urls: string[]) {
  for (const url of urls) {
    expect(isBlockedRequest(url), `expected blocked: ${url}`).toBe(true);
  }
}

function expectAllowed(urls: string[]) {
  for (const url of urls) {
    expect(isBlockedRequest(url), `expected allowed: ${url}`).toBe(false);
  }
}

describe('isBlockedRequest', () => {
  it('blocks non-http protocols', () => {
    expectBlocked(['file:///etc/passwd', 'ftp://example.com/file']);
  });

  it('blocks private IPv4 ranges', () => {
    expectBlocked([
      'https://10.0.0.1/logo.png',
      'https://172.16.0.1/logo.png',
      'https://192.168.1.1/logo.png',
      'https://127.0.0.1/logo.png',
      'https://0.0.0.0/logo.png',
      'https://169.254.1.1/logo.png',
    ]);
  });

  it('blocks known hostnames', () => {
    expectBlocked([
      'https://localhost/logo.png',
      'https://metadata.google.internal/v1',
      'https://metadata.internal/v1',
    ]);
  });

  it('blocks IPv6 loopback and private ranges', () => {
    expectBlocked([
      'https://[::1]/logo.png',
      'https://[::]/logo.png',
      'https://[fc00::1]/logo.png',
      'https://[fd00::1]/logo.png',
      'https://[fe80::1]/logo.png',
    ]);
  });

  it('blocks IPv6 multicast (ff prefix)', () => {
    expectBlocked(['https://[ff02::1]/logo.png']);
  });

  it('allows public URLs', () => {
    expectAllowed(['https://example.com/logo.png', 'https://cdn.example.com/image.jpg']);
  });

  it('blocks invalid URLs', () => {
    expectBlocked(['not-a-url']);
  });

  it('handles trailing dots in hostnames', () => {
    expectBlocked(['https://localhost./logo.png']);
  });

  it('blocks all 172.16-31.x.x ranges', () => {
    expectBlocked(['https://172.20.0.1/logo.png', 'https://172.31.255.255/logo.png']);
  });
});

describe('isBlockedAfterDns', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('blocks URLs already blocked by isBlockedRequest without invoking DNS', async () => {
    expect(await isBlockedAfterDns('https://127.0.0.1/logo.png')).toBe(true);
    expect(mockLookup).not.toHaveBeenCalled();

    expect(await isBlockedAfterDns('file:///etc/passwd')).toBe(true);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('allows public URLs that resolve to public IPs', async () => {
    mockLookup.mockResolvedValue([{ address: '192.0.2.1', family: 4 }]);

    expect(await isBlockedAfterDns('https://example.com/logo.png')).toBe(false);
  });

  it('blocks hostnames that resolve to private IPs', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    expect(await isBlockedAfterDns('https://evil.com/logo.png')).toBe(true);
  });

  it('blocks when DNS resolution fails', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));

    expect(await isBlockedAfterDns('https://nonexistent.example.com/logo.png')).toBe(true);
  });

  it('skips DNS for literal IP addresses', async () => {
    expect(await isBlockedAfterDns('https://93.184.216.34/logo.png')).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks IPv4-mapped IPv6 DNS results with private IPs', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);

    expect(await isBlockedAfterDns('https://evil.com/logo.png')).toBe(true);
  });

  it('allows IPv4-mapped IPv6 DNS results with public IPs', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:93.184.216.34', family: 6 }]);

    expect(await isBlockedAfterDns('https://example.com/logo.png')).toBe(false);
  });
});
