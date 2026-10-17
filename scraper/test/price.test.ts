import { expect, test } from 'vitest';
import { parsePrice } from '../src/price';

test('parsePrice', () => {
  expect(parsePrice('$1,299.99')).toBe(1299.99);
  expect(parsePrice('1299')).toBe(1299);
  expect(parsePrice(349.5)).toBe(349.5);
  expect(parsePrice('')).toBeNull();
  expect(parsePrice('Out of stock')).toBeNull();
  expect(parsePrice(undefined)).toBeNull();
  expect(parsePrice(null)).toBeNull();
  expect(parsePrice('-5')).toBeNull();
  expect(parsePrice(0)).toBeNull();
  expect(parsePrice(NaN)).toBeNull();
  expect(parsePrice('1.2.3')).toBeNull();
});
