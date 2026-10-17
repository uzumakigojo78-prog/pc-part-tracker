import type { RetailerAdapter } from './index';
import { redact } from '../fetch';
import { parsePrice } from '../price';

export const bestbuy = (env: NodeJS.ProcessEnv, f: typeof fetch): RetailerAdapter => ({
  id: 'bestbuy',
  enabled: () => !!env.BESTBUY_API_KEY,
  async fetchOffer(ref) {
    const url = `https://api.bestbuy.com/v1/products(sku=${encodeURIComponent(ref.productId)})?apiKey=${env.BESTBUY_API_KEY}`
      + '&format=json&show=sku,name,salePrice,onlineAvailability,customerReviewAverage,customerReviewCount,url,image';
    let res: Response;
    try { res = await f(url); } catch (e) { throw new Error(redact(String((e as Error).message))); }
    if (!res.ok) { console.warn(redact(`bestbuy ${res.status} for ${url}`)); return null; }
    const p = ((await res.json()) as any).products?.[0];
    if (!p) return null;
    return { retailer: 'bestbuy', productId: ref.productId, url: p.url ?? ref.url, price: parsePrice(p.salePrice),
      inStock: !!p.onlineAvailability, rating: p.customerReviewAverage ?? null, ratingCount: p.customerReviewCount ?? null };
  },
});
