import aws4 from 'aws4';
import type { RetailerAdapter } from './index';
import { parsePrice } from '../price';

export const amazon = (env: NodeJS.ProcessEnv, f: typeof fetch): RetailerAdapter => ({
  id: 'amazon',
  enabled: () => !!env.AMAZON_PAAPI_ACCESS_KEY && !!env.AMAZON_PAAPI_SECRET_KEY && !!env.AMAZON_PARTNER_TAG,
  async fetchOffer(ref) {
    const body = JSON.stringify({ ItemIds: [ref.productId], PartnerTag: env.AMAZON_PARTNER_TAG, PartnerType: 'Associates',
      Marketplace: 'www.amazon.com',
      Resources: ['Offers.Listings.Price', 'Offers.Listings.Availability.Type', 'CustomerReviews.StarRating', 'CustomerReviews.Count'] });
    const req = aws4.sign({ host: 'webservices.amazon.com', path: '/paapi5/getitems', method: 'POST', service: 'ProductAdvertisingAPI',
      region: 'us-east-1', body, headers: { 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'amz-1.0',
        'x-amz-target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems' } },
      { accessKeyId: env.AMAZON_PAAPI_ACCESS_KEY!, secretAccessKey: env.AMAZON_PAAPI_SECRET_KEY! });
    const res = await f('https://webservices.amazon.com/paapi5/getitems',
      { method: 'POST', headers: req.headers as Record<string, string>, body });
    if (!res.ok) return null;
    const item = ((await res.json()) as any).ItemsResult?.Items?.[0];
    if (!item) return null;
    const listing = item.Offers?.Listings?.[0];
    return { retailer: 'amazon', productId: ref.productId, url: item.DetailPageURL ?? ref.url,
      price: parsePrice(listing?.Price?.Amount), inStock: listing?.Availability?.Type === 'Now',
      rating: item.CustomerReviews?.StarRating?.Value ?? null, ratingCount: item.CustomerReviews?.Count ?? null };
  },
});
