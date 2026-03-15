import { fetchBlob } from '../lib/http';

export async function downloadUniformFile(businessId: string, year: number): Promise<void> {
  const response = await fetchBlob(`/businesses/${businessId}/reports/uniform-file?year=${year}`);
  const blob = await response.blob();

  const disposition = response.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="(.+)"/);
  const filename = filenameMatch?.[1] ?? `BKMV_${year}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
