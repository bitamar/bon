import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { createZip } from '../../src/lib/zip.js';

describe('createZip', () => {
  it('produces a valid ZIP with the given files', async () => {
    const result = await createZip({
      'hello.txt': Buffer.from('Hello'),
      'world.txt': 'World',
    });

    expect(Buffer.isBuffer(result)).toBe(true);
    // ZIP magic bytes: PK\x03\x04
    expect(result[0]).toBe(0x50);
    expect(result[1]).toBe(0x4b);

    const zip = new AdmZip(result);
    const entries = zip
      .getEntries()
      .map((e) => e.entryName)
      .sort();
    expect(entries).toEqual(['hello.txt', 'world.txt']);

    expect(zip.getEntry('hello.txt')!.getData().toString()).toBe('Hello');
    expect(zip.getEntry('world.txt')!.getData().toString()).toBe('World');
  });

  it('produces a valid ZIP with a single file', async () => {
    const result = await createZip({ 'only.txt': Buffer.from('content') });

    const zip = new AdmZip(result);
    expect(zip.getEntries()).toHaveLength(1);
    expect(zip.getEntry('only.txt')!.getData().toString()).toBe('content');
  });

  it('produces a valid ZIP when given an empty file map', async () => {
    const result = await createZip({});

    expect(Buffer.isBuffer(result)).toBe(true);
    const zip = new AdmZip(result);
    expect(zip.getEntries()).toHaveLength(0);
  });
});
