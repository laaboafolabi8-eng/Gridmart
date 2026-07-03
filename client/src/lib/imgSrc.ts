/**
 * Routes any image URL through the appropriate resize/WebP pipeline.
 *
 * - /api/...   → appends ?w= (served by object-storage or base64 routes)
 * - http(s)... → /api/image-proxy?url=...&w= (fetches + resizes + WebP)
 * - data:...   → returned as-is (can't resize a data URI client-side)
 * - other      → returned as-is
 */
export function imgSrc(url: string | undefined | null, width: number): string {
  if (!url) return '';
  if (url.startsWith('/api/')) return `${url}?w=${width}`;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}&w=${width}`;
  }
  return url;
}

export function imgSrcSet(
  url: string | undefined | null,
  widths: number[]
): string | undefined {
  if (!url) return undefined;
  if (
    !url.startsWith('/api/') &&
    !url.startsWith('http://') &&
    !url.startsWith('https://')
  ) return undefined;
  return widths.map(w => `${imgSrc(url, w)} ${w}w`).join(', ');
}
