import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { extractJsonLdProduct } from '../src/jsonld';

const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

test('fixture', () => {
  const html = readFileSync(new URL('./fixtures/newegg-product.html', import.meta.url), 'utf8');
  expect(extractJsonLdProduct(html)).toEqual({ price: 549.99, inStock: true, rating: 4.6, ratingCount: 128 });
});
test('none / bad json', () => {
  expect(extractJsonLdProduct('<html></html>')).toBeNull();
  expect(extractJsonLdProduct('<script type="application/ld+json">{bad json</script>')).toBeNull();
});
test('@graph, offer arrays, AggregateOffer', () => {
  const graph = ld({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'Product', offers: [
    { price: 20, availability: 'OutOfStock' }, { price: 10, availability: 'InStock' }] }] });
  expect(extractJsonLdProduct(graph)).toEqual({ price: 10, inStock: true, rating: null, ratingCount: null });
  const agg = ld({ '@type': 'Product', offers: { '@type': 'AggregateOffer', lowPrice: '99.5' },
    aggregateRating: { ratingValue: 4, ratingCount: 7 } });
  expect(extractJsonLdProduct(agg)).toEqual({ price: 99.5, inStock: false, rating: 4, ratingCount: 7 });
});
