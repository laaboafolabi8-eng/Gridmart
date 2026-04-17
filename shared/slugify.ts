export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80)
    .replace(/-+$/, '');
}

export function productUrl(product: { id: string; name: string }): string {
  const slug = slugify(product.name);
  const shortId = product.id.split('-')[0];
  return `/product/${slug}-${shortId}`;
}

export function extractProductIdPrefix(slugParam: string): string | null {
  const match = slugParam.match(/-([a-f0-9]{8})$/);
  return match ? match[1] : null;
}

export function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
