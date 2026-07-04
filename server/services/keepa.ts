const KEEPA_BASE = 'https://api.keepa.com';
const DOMAIN = 6; // amazon.ca

export interface KeepaProduct {
  asin: string;
  title: string;
  bsr: number;       // -1 = unavailable
  price: number;     // cents CAD, -1 = unavailable
  rating: number;    // 0–5, 0 = unknown
  reviewCount: number;
  imageUrl?: string;
}

async function keepaGet(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env.KEEPA_API_KEY;
  if (!key) throw new Error('KEEPA_API_KEY not configured');

  const url = new URL(`${KEEPA_BASE}${path}`);
  url.searchParams.set('key', key);
  url.searchParams.set('domain', String(DOMAIN));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keepa ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function parseProduct(p: any): KeepaProduct {
  const cur = p.stats?.current ?? [];
  // Keepa price types: 0=Amazon, 1=Marketplace New, 3=Sales Rank, 16=Rating(*10), 17=Reviews
  const bsr = cur[3] > 0 ? cur[3] : -1;
  const price = cur[1] > 0 ? cur[1] : cur[0] > 0 ? cur[0] : -1;
  const rating = cur[16] > 0 ? cur[16] / 10 : 0;
  const reviewCount = cur[17] > 0 ? cur[17] : 0;
  const imageCode = p.images?.[0];

  return {
    asin: p.asin,
    title: p.title || '(no title)',
    bsr,
    price,
    rating,
    reviewCount,
    imageUrl: imageCode
      ? `https://images-na.ssl-images-amazon.com/images/I/${imageCode}._SL75_.jpg`
      : undefined,
  };
}

export async function searchProducts(term: string, maxResults = 20): Promise<KeepaProduct[]> {
  const searchData = await keepaGet('/search', { type: 'product', term });
  const asins: string[] = (searchData.products || []).slice(0, maxResults);
  if (!asins.length) return [];
  return fetchProductDetails(asins);
}

export async function fetchProductDetails(asins: string[]): Promise<KeepaProduct[]> {
  const data = await keepaGet('/product', {
    asin: asins.slice(0, 20).join(','),
    stats: '90',
  });
  return (data.products || []).map(parseProduct);
}
