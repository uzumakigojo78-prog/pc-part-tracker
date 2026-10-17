import type { RetailerAdapter } from './index';
import { parsePrice } from '../price';

const condition = (c: string | undefined) =>
  /refurbished/i.test(c ?? '') ? 'refurbished' : /used/i.test(c ?? '') ? 'used' : c === 'New' ? 'new' : undefined;

export const ebay = (env: NodeJS.ProcessEnv, f: typeof fetch): RetailerAdapter => {
  let token: { value: string; expires: number } | null = null;
  async function getToken(): Promise<string | null> {
    if (token && token.expires > Date.now()) return token.value;
    const res = await f('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64') },
      body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    token = { value: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
    return token.value;
  }
  return {
    id: 'ebay',
    enabled: () => !!env.EBAY_CLIENT_ID && !!env.EBAY_CLIENT_SECRET,
    async fetchOffer(ref) {
      const t = await getToken();
      if (!t) return null;
      const res = await f(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(ref.productId)}`,
        { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) return null;
      const i = (await res.json()) as any;
      const pct = Number(i.seller?.feedbackPercentage);
      const cond = condition(i.condition);
      return { retailer: 'ebay', productId: ref.productId, url: i.itemWebUrl ?? ref.url, price: parsePrice(i.price?.value),
        inStock: true, rating: null, ratingCount: null,
        ...(cond && { condition: cond }), ...(Number.isFinite(pct) && { sellerFeedbackPct: pct }) };
    },
  };
};
