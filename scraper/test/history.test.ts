import { describe, it, expect } from 'vitest';
import { appendHistory } from '../src/history';
import type { Offer } from '../../shared/types';

const offer = (retailer: Offer['retailer'], price: number): Offer =>
  ({ retailer, price, url: 'u', inStock: true, rating: null, ratingCount: null, fetchedAt: 'x' });

describe('appendHistory', () => {
  it('adds one point per offer at the date', () => {
    const out = appendHistory([], [offer('bestbuy', 10), offer('ebay', 12)], '2026-10-16');
    expect(out).toEqual([
      { date: '2026-10-16', retailer: 'bestbuy', price: 10 },
      { date: '2026-10-16', retailer: 'ebay', price: 12 },
    ]);
  });
  it('drops points older than 730 days before the date', () => {
    const existing = [
      { date: '2024-10-15', retailer: 'bestbuy' as const, price: 1 }, // 731 days before
      { date: '2024-10-16', retailer: 'bestbuy' as const, price: 2 }, // exactly 730 days
    ];
    const out = appendHistory(existing, [], '2026-10-16');
    expect(out).toEqual([existing[1]]);
  });
  it('replaces a point with the same date+retailer', () => {
    const existing = [{ date: '2026-10-16', retailer: 'bestbuy' as const, price: 99 }];
    const out = appendHistory(existing, [offer('bestbuy', 50)], '2026-10-16');
    expect(out).toEqual([{ date: '2026-10-16', retailer: 'bestbuy', price: 50 }]);
  });
});
