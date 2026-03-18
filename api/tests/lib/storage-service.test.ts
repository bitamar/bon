import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../src/lib/app-error.js';

const PDF_STORAGE_DIR = '/tmp/test-pdfs';

vi.mock('../../src/env.js', () => ({
  env: {
    PDF_STORAGE_DIR,
  },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}));

// Import after mocks are registered
const { mkdir, readFile, writeFile, unlink } = await import('node:fs/promises');
const { localStorageService } = await import('../../src/lib/storage-service.js');

// ── helpers ──

function expectedFilePath(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex');
  const ext = path.extname(key);
  return path.join(path.resolve(PDF_STORAGE_DIR), `${hash}${ext}`);
}

function makeEnoentError(): NodeJS.ErrnoException {
  const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

function makeEaccesError(): NodeJS.ErrnoException {
  const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
  err.code = 'EACCES';
  return err;
}

describe('localStorageService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('get', () => {
    it('returns file content when file exists', async () => {
      const content = Buffer.from('hello pdf');
      vi.mocked(readFile).mockResolvedValue(content as never);

      const result = await localStorageService.get('invoice.pdf');

      expect(result).toEqual(content);
      expect(readFile).toHaveBeenCalledWith(expectedFilePath('invoice.pdf'));
    });

    it('returns null when file does not exist (ENOENT)', async () => {
      vi.mocked(readFile).mockRejectedValue(makeEnoentError());

      const result = await localStorageService.get('missing.pdf');

      expect(result).toBeNull();
    });

    it('throws AppError with code storage_read_error on non-ENOENT errors', async () => {
      vi.mocked(readFile).mockRejectedValue(makeEaccesError());

      await expect(localStorageService.get('restricted.pdf')).rejects.toMatchObject({
        code: 'storage_read_error',
        statusCode: 500,
      });
      await expect(localStorageService.get('restricted.pdf')).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('put', () => {
    it('writes file successfully after ensuring directory exists', async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockResolvedValue(undefined);
      const data = Buffer.from('pdf content');

      await localStorageService.put('invoice.pdf', data);

      expect(mkdir).toHaveBeenCalledWith(path.resolve(PDF_STORAGE_DIR), { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(expectedFilePath('invoice.pdf'), data);
    });

    it('throws AppError with code storage_write_error on error', async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockRejectedValue(makeEaccesError());
      const data = Buffer.from('pdf content');

      await expect(localStorageService.put('invoice.pdf', data)).rejects.toMatchObject({
        code: 'storage_write_error',
        statusCode: 500,
      });
      await expect(localStorageService.put('invoice.pdf', data)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('del', () => {
    it('deletes file successfully', async () => {
      vi.mocked(unlink).mockResolvedValue(undefined);

      await localStorageService.del('invoice.pdf');

      expect(unlink).toHaveBeenCalledWith(expectedFilePath('invoice.pdf'));
    });

    it('does not throw when file does not exist (ENOENT)', async () => {
      vi.mocked(unlink).mockRejectedValue(makeEnoentError());

      await expect(localStorageService.del('missing.pdf')).resolves.toBeUndefined();
    });

    it('throws AppError with code storage_delete_error on non-ENOENT errors', async () => {
      vi.mocked(unlink).mockRejectedValue(makeEaccesError());

      await expect(localStorageService.del('restricted.pdf')).rejects.toMatchObject({
        code: 'storage_delete_error',
        statusCode: 500,
      });
      await expect(localStorageService.del('restricted.pdf')).rejects.toBeInstanceOf(AppError);
    });
  });
});
