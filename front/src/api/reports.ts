import { pcn874QuerySchema } from '@bon/types/pcn874';
import { fetchBlob } from '../lib/http';

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
  const disposition = res.headers.get('content-disposition') ?? '';
  const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
  const filename =
    filenameMatch?.[1] ?? `PCN874_${validated.year}${String(validated.month).padStart(2, '0')}.txt`;

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
