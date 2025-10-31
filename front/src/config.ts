export const API_BASE_URL: string = (() => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) throw new Error('Missing VITE_API_BASE_URL');
  return baseUrl;
})();
