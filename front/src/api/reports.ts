import { pcn874QuerySchema } from '@bon/types/pcn874';
import { uniformFileQuerySchema } from '@bon/types/reports';
import { fetchBlob } from '../lib/http';

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

function extractFilename(res: Response, fallback: string): string {
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  return match?.[1] ?? fallback;
}

export async function downloadPcn874(
  businessId: string,
  year: number,
  month: number
): Promise<void> {
  const validated = pcn874QuerySchema.parse({ year, month });
  const res = await fetchBlob(
    `/businesses/${businessId}/reports/pcn874?year=${validated.year}&month=${validated.month}`
  );
  const blob = await res.blob();
  const fallback = `PCN874_${validated.year}${String(validated.month).padStart(2, '0')}.txt`;
  triggerBlobDownload(blob, extractFilename(res, fallback));
}

export async function downloadUniformFile(businessId: string, year: number): Promise<void> {
  const validated = uniformFileQuerySchema.parse({ year });
  const res = await fetchBlob(
    `/businesses/${businessId}/reports/uniform-file?year=${validated.year}`
  );
  const blob = await res.blob();
  triggerBlobDownload(blob, extractFilename(res, `BKMV_${year}.zip`));
}
