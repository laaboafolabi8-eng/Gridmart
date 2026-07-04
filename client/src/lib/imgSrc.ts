/**
 * Routes /api/ images through the resize pipeline (?w=).
 * External URLs are returned as-is — proxying them through the server
 * adds a round-trip that's slower than the source CDN.
 */
export function imgSrc(url: string | undefined | null, width: number): string {
  if (!url) return '';
  if (url.startsWith('/api/')) return `${url}?w=${width}`;
  return url;
}

export function imgSrcSet(
  url: string | undefined | null,
  widths: number[]
): string | undefined {
  if (!url || !url.startsWith('/api/')) return undefined;
  return widths.map(w => `${url}?w=${w} ${w}w`).join(', ');
}
