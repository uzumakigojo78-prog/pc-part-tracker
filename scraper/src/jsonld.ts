import * as cheerio from 'cheerio';
import { parsePrice } from './price';

type Node = Record<string, any>;

function findProduct(n: unknown): Node | null {
  if (Array.isArray(n)) {
    for (const x of n) { const p = findProduct(x); if (p) return p; }
    return null;
  }
  if (!n || typeof n !== 'object') return null;
  const node = n as Node;
  const t = node['@type'];
  if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) return node;
  return findProduct(node['@graph']);
}

const num = (v: unknown) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : null; };

export function extractJsonLdProduct(html: string) {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let product: Node | null;
    try { product = findProduct(JSON.parse($(el).text())); } catch { continue; }
    if (!product) continue;
    const offers: Node[] = [product.offers].flat().filter(Boolean);
    const prices = offers.map(o => parsePrice(o.price ?? o.lowPrice)).filter((p): p is number => p !== null);
    const r = product.aggregateRating ?? {};
    return {
      price: prices.length ? Math.min(...prices) : null,
      inStock: offers.some(o => String(o.availability ?? '').includes('InStock')),
      rating: num(r.ratingValue),
      ratingCount: num(r.reviewCount ?? r.ratingCount),
    };
  }
  return null;
}
