import { expect, test } from 'vitest';
import { buildIndexEntry, isCredible, toOffer } from '../src/normalize';
import type { CatalogPart, Offer } from '../../shared/types';

const base = { retailer: 'ebay', productId: '1', url: 'u', price: 100, inStock: true, rating: null, ratingCount: null } as const;

test('isCredible', () => {
  expect(isCredible({ ...base, condition: 'new', sellerFeedbackPct: 98 })).toBe(true);
  expect(isCredible({ ...base, condition: 'new', sellerFeedbackPct: 97.9 })).toBe(false);
  expect(isCredible({ ...base, condition: 'used', sellerFeedbackPct: 100 })).toBe(false);
  expect(isCredible({ ...base, condition: 'new' })).toBe(false);
  expect(isCredible({ ...base, retailer: 'newegg' })).toBe(true);
});
test('toOffer', () => {
  expect(toOffer({ ...base, retailer: 'newegg', price: null }, 't')).toBeNull();
  expect(toOffer({ ...base }, 't')).toBeNull();
  expect(toOffer({ ...base, retailer: 'newegg' }, 't')).toEqual(
    { retailer: 'newegg', price: 100, url: 'u', inStock: true, rating: null, ratingCount: null, fetchedAt: 't' });
});

const part: CatalogPart = { id: 'p', category: 'gpu', brand: 'B', model: 'M', specs: {}, refs: [] };
const o = (retailer: Offer['retailer'], price: number, inStock: boolean, rating: number | null = null, ratingCount: number | null = null): Offer =>
  ({ retailer, price, url: 'u', inStock, rating, ratingCount, fetchedAt: 't' });

test('buildIndexEntry', () => {
  expect(buildIndexEntry(part, [], 'T')).toMatchObject({ lowestPrice: null, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: 'T' });
  expect(buildIndexEntry(part, [o('amazon', 50, false), o('newegg', 80, true)], 'T'))
    .toMatchObject({ lowestPrice: 80, lowestRetailer: 'newegg' });
  expect(buildIndexEntry(part, [o('amazon', 50, false), o('newegg', 80, false)], 'T'))
    .toMatchObject({ lowestPrice: 50, lowestRetailer: 'amazon' });
  expect(buildIndexEntry(part, [o('amazon', 5, true, 5, 10), o('newegg', 8, true, 4, 30), o('ebay', 9, true)], 'T'))
    .toMatchObject({ rating: 4.3, ratingCount: 40 });
});
