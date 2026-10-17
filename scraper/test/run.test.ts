import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, exitCode } from '../src/run';
import type { RetailerAdapter } from '../src/adapters/index';
import type { CatalogPart, RawListing, RetailerId } from '../../shared/types';

const part = (id: string, refs: { retailer: RetailerId; productId: string }[]): CatalogPart => ({
  id, category: 'cpu', brand: 'B', model: id, specs: {},
  refs: refs.map(r => ({ ...r, url: `https://x.test/${r.productId}` })),
});
const listing = (retailer: RetailerId, price: number | null): RawListing =>
  ({ retailer, productId: 'p', url: 'https://x.test/p', price, inStock: true, rating: null, ratingCount: null });
const adapter = (id: RetailerId, enabled: boolean, fn: () => Promise<RawListing | null>): RetailerAdapter =>
  ({ id, enabled: () => enabled, fetchOffer: fn });
const now = new Date('2026-10-16T12:00:00Z');
const rj = async (p: string) => JSON.parse(await readFile(p, 'utf8'));

describe('run', () => {
  it('one adapter throws, one succeeds', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    const catalog = [part('a', [{ retailer: 'bestbuy', productId: '1' }, { retailer: 'amazon', productId: '2' }])];
    const adapters = [
      adapter('bestbuy', true, async () => listing('bestbuy', 100)),
      adapter('amazon', true, async () => { throw new Error('boom'); }),
    ];
    const r = await run({ catalog, adapters, dataDir, now });
    expect(r).toEqual({ succeeded: 1, failed: 1, skipped: 0 });
    const detail = await rj(join(dataDir, 'parts/a.json'));
    expect(detail.offers).toHaveLength(1);
    expect(detail.offers[0].price).toBe(100);
    expect(detail.refs).toBeUndefined();
    const hist = await rj(join(dataDir, 'history/a.json'));
    expect(hist).toEqual([{ date: '2026-10-16', retailer: 'bestbuy', price: 100 }]);
    const raw = await readFile(join(dataDir, 'parts/a.json'), 'utf8');
    expect(raw.endsWith('}\n')).toBe(true);
  });
  it('disabled adapter ref is skipped, not failed', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    const r = await run({ catalog: [part('a', [{ retailer: 'ebay', productId: '1' }])],
      adapters: [adapter('ebay', false, async () => { throw new Error('never'); })], dataDir, now });
    expect(r).toEqual({ succeeded: 0, failed: 0, skipped: 1 });
  });
  it('part with zero offers has offers [] and history untouched', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    await mkdir(join(dataDir, 'history'), { recursive: true });
    const before = '[{"date":"2026-10-01","retailer":"bestbuy","price":5}]\n';
    await writeFile(join(dataDir, 'history/a.json'), before);
    await run({ catalog: [part('a', [])], adapters: [], dataDir, now });
    expect((await rj(join(dataDir, 'parts/a.json'))).offers).toEqual([]);
    expect(await readFile(join(dataDir, 'history/a.json'), 'utf8')).toBe(before);
  });
  it('null / rejected listings are neither succeeded nor failed', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    const r = await run({ catalog: [part('a', [{ retailer: 'bestbuy', productId: '1' }, { retailer: 'amazon', productId: '2' }])],
      adapters: [adapter('bestbuy', true, async () => null), adapter('amazon', true, async () => listing('amazon', null))],
      dataDir, now });
    expect(r).toEqual({ succeeded: 0, failed: 0, skipped: 0 });
  });
  it('index.json has every part sorted by id', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    await run({ catalog: [part('b', []), part('a', [])], adapters: [], dataDir, now });
    const idx = await rj(join(dataDir, 'index.json'));
    expect(idx.map((e: { id: string }) => e.id)).toEqual(['a', 'b']);
    expect(idx[0].lowestPrice).toBeNull();
  });
  it('all fetches fail -> succeeded 0', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    const r = await run({ catalog: [part('a', [{ retailer: 'bestbuy', productId: '1' }])],
      adapters: [adapter('bestbuy', true, async () => { throw new Error('x'); })], dataDir, now });
    expect(r.succeeded).toBe(0);
    expect(r.failed).toBe(1);
  });
});

describe('run robustness', () => {
  it('corrupt history for one part does not abort the others', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    await mkdir(join(dataDir, 'history'), { recursive: true });
    await writeFile(join(dataDir, 'history/a.json'), '{not json');
    const ad = [adapter('bestbuy', true, async () => listing('bestbuy', 10))];
    const r = await run({ catalog: [part('a', [{ retailer: 'bestbuy', productId: '1' }]), part('b', [{ retailer: 'bestbuy', productId: '2' }])], adapters: ad, dataDir, now });
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(2);
    expect((await rj(join(dataDir, 'parts/b.json'))).offers).toHaveLength(1);
    expect(await rj(join(dataDir, 'history/b.json'))).toHaveLength(1);
    expect((await rj(join(dataDir, 'index.json'))).map((e: { id: string }) => e.id)).toEqual(['a', 'b']);
  });
  it('all fetches throw -> existing part file kept unchanged', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    await mkdir(join(dataDir, 'parts'), { recursive: true });
    const before = JSON.stringify({ id: 'a', offers: [{ retailer: 'bestbuy', price: 7, url: 'u', inStock: true, rating: null, ratingCount: null, fetchedAt: 'o' }], updatedAt: 'old' });
    await writeFile(join(dataDir, 'parts/a.json'), before);
    await run({ catalog: [part('a', [{ retailer: 'bestbuy', productId: '1' }])],
      adapters: [adapter('bestbuy', true, async () => { throw new Error('x'); })], dataDir, now });
    expect(await readFile(join(dataDir, 'parts/a.json'), 'utf8')).toBe(before);
  });
  it('null result still writes offers: []', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    await run({ catalog: [part('a', [{ retailer: 'bestbuy', productId: '1' }])],
      adapters: [adapter('bestbuy', true, async () => null)], dataDir, now });
    expect((await rj(join(dataDir, 'parts/a.json'))).offers).toEqual([]);
  });
});

describe('run keep-previous edge cases', () => {
  const thrower = adapter('bestbuy', true, async () => { throw new Error('x'); });
  const ref1 = [{ retailer: 'bestbuy' as const, productId: '1' }];
  it('first run with a throwing adapter still writes offers: []', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    await run({ catalog: [part('a', ref1)], adapters: [thrower], dataDir, now });
    expect((await rj(join(dataDir, 'parts/a.json'))).offers).toEqual([]);
  });
  it('corrupt previous parts file is rewritten with offers: []', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    await mkdir(join(dataDir, 'parts'), { recursive: true });
    await writeFile(join(dataDir, 'parts/a.json'), '{broken');
    await run({ catalog: [part('a', ref1)], adapters: [thrower], dataDir, now });
    expect((await rj(join(dataDir, 'parts/a.json'))).offers).toEqual([]);
  });
  it('mixed throw + null with no offers keeps the previous file', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'run-'));
    await mkdir(join(dataDir, 'parts'), { recursive: true });
    const before = JSON.stringify({ id: 'a', offers: [], updatedAt: 'old' });
    await writeFile(join(dataDir, 'parts/a.json'), before);
    await run({ catalog: [part('a', [...ref1, { retailer: 'amazon', productId: '2' }])],
      adapters: [thrower, adapter('amazon', true, async () => null)], dataDir, now });
    expect(await readFile(join(dataDir, 'parts/a.json'), 'utf8')).toBe(before);
  });
});

describe('exitCode', () => {
  it('applies the rule', () => {
    expect(exitCode({ succeeded: 0, failed: 1, skipped: 0 })).toBe(1);
    expect(exitCode({ succeeded: 0, failed: 0, skipped: 5 })).toBe(0);
    expect(exitCode({ succeeded: 1, failed: 3, skipped: 0 })).toBe(0);
  });
});
