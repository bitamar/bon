import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { downloadPcn874, downloadUniformFile } from '../../api/reports';
import { HttpError } from '../../lib/http';

const BIZ_ID = '00000000-0000-4000-8000-000000000001';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

function mockBlobResponse(filename: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    blob: vi.fn().mockResolvedValueOnce(new Blob(['data'])),
    headers: new Headers({
      'content-disposition': `attachment; filename="${filename}"`,
    }),
  } as unknown as Response);
}

function mockFailResponse(status: number) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: vi.fn().mockResolvedValueOnce({ message: 'error' }),
  });
}

// Stub DOM APIs used by triggerBlobDownload
const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
const clickMock = vi.fn();
const removeMock = vi.fn();

describe('reports api', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document, 'createElement').mockReturnValue({
      click: clickMock,
      remove: removeMock,
      set href(_v: string) {},
      set download(_v: string) {},
    } as unknown as HTMLAnchorElement);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('downloadPcn874', () => {
    it('fetches the PCN874 blob and triggers a download', async () => {
      mockBlobResponse('PCN874_515036694_202601.txt');

      await downloadPcn874(BIZ_ID, 2026, 1);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/businesses/${BIZ_ID}/reports/pcn874?year=2026&month=1`),
        expect.any(Object)
      );
      expect(clickMock).toHaveBeenCalled();
    });

    it('throws HttpError on failure', async () => {
      mockFailResponse(422);
      await expect(downloadPcn874(BIZ_ID, 2026, 1)).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('downloadUniformFile', () => {
    it('fetches the uniform file blob and triggers a download', async () => {
      mockBlobResponse('BKMV_515036694_2026.zip');

      await downloadUniformFile(BIZ_ID, 2026);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/businesses/${BIZ_ID}/reports/uniform-file?year=2026`),
        expect.any(Object)
      );
      expect(clickMock).toHaveBeenCalled();
    });

    it('throws HttpError on failure', async () => {
      mockFailResponse(400);
      await expect(downloadUniformFile(BIZ_ID, 2026)).rejects.toBeInstanceOf(HttpError);
    });
  });
});
