import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

export interface StorageService {
  get(key: string): Promise<Buffer | null>;
  put(key: string, data: Buffer): Promise<void>;
  del(key: string): Promise<void>;
}

const PDF_DIR = path.resolve('.data', 'pdfs');

async function ensureDir(): Promise<void> {
  await mkdir(PDF_DIR, { recursive: true });
}

function filePath(key: string): string {
  // Sanitize: only allow alphanumeric, hyphens, and dots
  const safe = key.replaceAll(/[^a-zA-Z0-9\-.]/g, '_');
  return path.join(PDF_DIR, safe);
}

export const localStorageService: StorageService = {
  async get(key) {
    try {
      return await readFile(filePath(key));
    } catch {
      return null;
    }
  },

  async put(key, data) {
    await ensureDir();
    await writeFile(filePath(key), data);
  },

  async del(key) {
    try {
      await unlink(filePath(key));
    } catch {
      // File may not exist — that's fine
    }
  },
};
