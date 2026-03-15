import archiver from 'archiver';
import { Buffer } from 'node:buffer';
import { Writable } from 'node:stream';

export async function createZip(files: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk: Buffer, _encoding, cb) {
        chunks.push(chunk);
        cb();
      },
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', reject);
    writable.on('finish', () => resolve(Buffer.concat(chunks)));

    archive.pipe(writable);
    for (const [name, content] of Object.entries(files)) {
      archive.append(content, { name });
    }
    void archive.finalize();
  });
}
