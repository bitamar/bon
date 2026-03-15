import { fetchBlob } from '../lib/http';

export async function downloadPcn874(
  businessId: string,
  year: number,
  month: number
): Promise<void> {
  const res = await fetchBlob(
    `/businesses/${businessId}/reports/pcn874?year=${year}&month=${month}`
  );
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? `PCN874_${year}${String(month).padStart(2, '0')}.txt`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}
