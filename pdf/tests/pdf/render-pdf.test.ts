import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBlockedRequest, isBlockedAfterDns } from '../../src/pdf/render-pdf.js';

const { mockLookup } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({
  default: { lookup: mockLookup },
  lookup: mockLookup,
}));

describe('isBlockedRequest', () => {
  it('blocks non-http protocols', () => {
    expect(isBlockedRequest('file:///etc/passwd')).toBe(true);
    expect(isBlockedRequest('ftp://example.com/file')).toBe(true);
  });

  it('blocks private IPv4 ranges', () => {
    expect(isBlockedRequest('http://10.0.0.1/logo.png')).toBe(true);
    expect(isBlockedRequest('http://172.16.0.1/logo.png')).toBe(true);
    expect(isBlockedRequest('http://192.168.1.1/logo.png')).toBe(true);
    expect(isBlockedRequest('http://127.0.0.1/logo.png')).toBe(true);
    expect(isBlockedRequest('http://0.0.0.0/logo.png')).toBe(true);
    expect(isBlockedRequest('http://169.254.1.1/logo.png')).toBe(true);
  });

  it('blocks known hostnames', () => {
    expect(isBlockedRequest('http://localhost/logo.png')).toBe(true);
    expect(isBlockedRequest('http://metadata.google.internal/v1')).toBe(true);
    expect(isBlockedRequest('http://metadata.internal/v1')).toBe(true);
  });

  it('blocks IPv6 loopback and private ranges', () => {
    expect(isBlockedRequest('http://[::1]/logo.png')).toBe(true);
    expect(isBlockedRequest('http://[::]/logo.png')).toBe(true);
    expect(isBlockedRequest('http://[fc00::1]/logo.png')).toBe(true);
    expect(isBlockedRequest('http://[fd00::1]/logo.png')).toBe(true);
    expect(isBlockedRequest('http://[fe80::1]/logo.png')).toBe(true);
  });

  it('allows public URLs', () => {
    expect(isBlockedRequest('https://example.com/logo.png')).toBe(false);
    expect(isBlockedRequest('http://cdn.example.com/image.jpg')).toBe(false);
  });

  it('blocks invalid URLs', () => {
    expect(isBlockedRequest('not-a-url')).toBe(true);
  });

  it('handles trailing dots in hostnames', () => {
    expect(isBlockedRequest('http://localhost./logo.png')).toBe(true);
  });

  it('blocks all 172.16-31.x.x ranges', () => {
    expect(isBlockedRequest('http://172.20.0.1/logo.png')).toBe(true);
    expect(isBlockedRequest('http://172.31.255.255/logo.png')).toBe(true);
  });
});

describe('isBlockedAfterDns', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('blocks URLs already blocked by isBlockedRequest', async () => {
    expect(await isBlockedAfterDns('http://127.0.0.1/logo.png')).toBe(true);
    expect(await isBlockedAfterDns('file:///etc/passwd')).toBe(true);
  });

  it('allows public URLs that resolve to public IPs', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

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
    // Public IP — should be allowed without DNS lookup
    expect(await isBlockedAfterDns('http://93.184.216.34/logo.png')).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });
});
