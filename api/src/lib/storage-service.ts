import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './app-error.js';
import { env } from '../env.js';

export interface StorageService {
  get(key: string): Promise<Buffer | null>;
  put(key: string, data: Buffer): Promise<void>;
  del(key: string): Promise<void>;
}

const PDF_DIR = path.resolve(env.PDF_STORAGE_DIR);

async function ensureDir(): Promise<void> {
  await mkdir(PDF_DIR, { recursive: true });
}

function isEnoent(err: unknown): boolean {
  return (
    err != null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}

function filePath(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex');
  const ext = path.extname(key);
  return path.join(PDF_DIR, `${hash}${ext}`);
}

export const localStorageService: StorageService = {
  async get(key) {
    try {
      return await readFile(filePath(key));
    } catch (err: unknown) {
      if (isEnoent(err)) return null;
      throw new AppError({
        statusCode: 500,
        code: 'storage_read_error',
        message: 'Failed to read storage file',
        cause: err,
      });
    }
  },

  async put(key, data) {
    try {
      await ensureDir();
      await writeFile(filePath(key), data);
    } catch (err: unknown) {
      throw new AppError({
        statusCode: 500,
        code: 'storage_write_error',
        message: 'Failed to write storage file',
        cause: err,
      });
    }
  },

  async del(key) {
    try {
      await unlink(filePath(key));
    } catch (err: unknown) {
      if (isEnoent(err)) return;
      throw new AppError({
        statusCode: 500,
        code: 'storage_delete_error',
        message: 'Failed to delete storage file',
        cause: err,
      });
    }
  },
};
