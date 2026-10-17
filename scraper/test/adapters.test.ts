import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createAdapters } from '../src/adapters/index';
import type { RetailerId, RetailerRef } from '../../shared/types';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const json = (body: string, status = 200) => new Response(body, { status });
const env = { BESTBUY_API_KEY: 'SECRETKEY', EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 's',
  AMAZON_PAAPI_ACCESS_KEY: 'ak', AMAZON_PAAPI_SECRET_KEY: 'sk', AMAZON_PARTNER_TAG: 'tracker-20' };
const get = (id: RetailerId, e: NodeJS.ProcessEnv, f: any) => createAdapters(e, f).find(a => a.id === id)!;
const ref = (retailer: RetailerId): RetailerRef => ({ retailer, productId: '123', url: 'https://x.test/p' });
const respond = (res: () => Response) => async () => res();
// eBay does a token call first, then the item call.
const ebayFetch = (item: () => Response) => async (url: string) =>
  url.includes('oauth2/token') ? json('{"access_token":"t","expires_in":7200}') : item();

describe('adapters', () => {
  it('bestbuy maps the products fixture', async () => {
    const l = await get('bestbuy', env, respond(() => json(fx('bestbuy-products.json')))).fetchOffer(ref('bestbuy'));
    expect(l).toMatchObject({ retailer: 'bestbuy', productId: '123', price: 549.99, inStock: true, rating: 4.6,
      ratingCount: 312, url: 'https://api.bestbuy.com/click/-/6568588/pdp' });
  });
  it('bestbuy returns null for empty products', async () => {
    expect(await get('bestbuy', env, respond(() => json('{"products":[],"total":0}'))).fetchOffer(ref('bestbuy'))).toBeNull();
  });
  it('ebay maps the getItem fixture', async () => {
    const l = await get('ebay', env, ebayFetch(() => json(fx('ebay-item.json')))).fetchOffer(ref('ebay'));
    expect(l).toMatchObject({ retailer: 'ebay', price: 529, condition: 'new', sellerFeedbackPct: 99.1,
      url: 'https://www.ebay.com/itm/123456789012', inStock: true });
  });
  it('ebay maps used/refurbished conditions', async () => {
    for (const [c, want] of [['Used', 'used'], ['Seller refurbished', 'refurbished'], ['Certified - Refurbished', 'refurbished']]) {
      const body = JSON.stringify({ ...JSON.parse(fx('ebay-item.json')), condition: c });
      expect((await get('ebay', env, ebayFetch(() => json(body))).fetchOffer(ref('ebay')))!.condition).toBe(want);
    }
  });
  it('amazon maps the GetItems fixture', async () => {
    const l = await get('amazon', env, respond(() => json(fx('amazon-getitems.json')))).fetchOffer(ref('amazon'));
    expect(l).toMatchObject({ retailer: 'amazon', price: 539, inStock: true, rating: 4.7, ratingCount: 1204,
      url: 'https://www.amazon.com/dp/B0BTZB7F88?tag=tracker-20' });
  });
  it('amazon not in stock when Availability.Type is not Now', async () => {
    const b = JSON.parse(fx('amazon-getitems.json'));
    b.ItemsResult.Items[0].Offers.Listings[0].Availability.Type = 'Backorder';
    expect((await get('amazon', env, respond(() => json(JSON.stringify(b)))).fetchOffer(ref('amazon')))!.inStock).toBe(false);
  });
  it('non-positive prices become null, never 0', async () => {
    const b = JSON.parse(fx('bestbuy-products.json')); b.products[0].salePrice = 0;
    expect((await get('bestbuy', env, respond(() => json(JSON.stringify(b)))).fetchOffer(ref('bestbuy')))!.price).toBeNull();
  });
  it('enabled() follows env vars', () => {
    expect(createAdapters({}).map(a => a.enabled())).toEqual([false, false, false]);
    expect(createAdapters(env).map(a => a.enabled())).toEqual([true, true, true]);
    expect(createAdapters({ ...env, BESTBUY_API_KEY: '' }).find(a => a.id === 'bestbuy')!.enabled()).toBe(false);
  });
  for (const status of [404, 503]) {
    it(`every adapter returns null on HTTP ${status}`, async () => {
      for (const id of ['bestbuy', 'ebay', 'amazon'] as const) {
        const f = id === 'ebay' ? ebayFetch(() => json('', status)) : respond(() => json('', status));
        expect(await get(id, env, f).fetchOffer(ref(id))).toBeNull();
      }
    });
  }
  it('redacts the Best Buy API key in thrown errors and logs', async () => {
    const f = async (url: string) => { throw new Error(`connect failed for ${url}`); };
    const logs: string[] = [];
    const orig = console.warn; console.warn = (...a) => logs.push(a.join(' '));
    try {
      const err = await get('bestbuy', env, f).fetchOffer(ref('bestbuy')).catch(e => e as Error);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('apiKey=REDACTED');
      expect((err as Error).message).not.toContain('SECRETKEY');
      const bad = await get('bestbuy', env, respond(() => json('', 500))).fetchOffer(ref('bestbuy'));
      expect(bad).toBeNull();
    } finally { console.warn = orig; }
    expect(logs.join('\n')).not.toContain('SECRETKEY');
  });
});
