import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRefs } from '../src/find-refs';
import type { CatalogPart } from '../../shared/types';

const p = (id: string, brand: string, model: string, refs: CatalogPart['refs'] = []): CatalogPart =>
  ({ id, category: 'cpu', brand, model, specs: {}, refs });

describe('findRefs', () => {
  it('queries parts lacking a bestbuy ref and writes candidates only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fr-'));
    const out = join(dir, 'catalog.candidates.json');
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ products: [{ sku: 123, name: 'N', url: 'https://bb.test/x' }] }));
    }) as unknown as typeof fetch;
    const catalog = [
      p('amd-ryzen-7-9800x3d', 'AMD', 'Ryzen 7 9800X3D'),
      p('has-ref', 'X', 'Y', [{ retailer: 'bestbuy', productId: '1', url: 'u' }]),
    ];
    await findRefs({ catalog, env: { BESTBUY_API_KEY: 'sekret' }, fetch: f, outPath: out });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('search=AMD&search=Ryzen&search=7&search=9800X3D');
    expect(urls[0]).toContain('pageSize=3');
    const res = JSON.parse(await readFile(out, 'utf8'));
    expect(Object.keys(res)).toEqual(['amd-ryzen-7-9800x3d']);
    expect(res['amd-ryzen-7-9800x3d']).toEqual([{ sku: '123', name: 'N', url: 'https://bb.test/x' }]);
    expect(await readdir(dir)).toEqual(['catalog.candidates.json']);
  });
  it('does nothing without BESTBUY_API_KEY', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fr-'));
    const f = (async () => { throw new Error('no network'); }) as unknown as typeof fetch;
    await findRefs({ catalog: [p('a', 'A', 'B')], env: {}, fetch: f, outPath: join(dir, 'c.json') });
    expect(await readdir(dir)).toEqual([]);
  });
  it('never leaks the api key in logged errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fr-'));
    const logs: string[] = [];
    const orig = console.warn; console.warn = (...a: unknown[]) => { logs.push(a.join(' ')); };
    const f = (async (url: string) => { throw new Error(`fail ${url}`); }) as unknown as typeof fetch;
    try { await findRefs({ catalog: [p('a', 'A', 'B')], env: { BESTBUY_API_KEY: 'sekret' }, fetch: f, outPath: join(dir, 'c.json') }); }
    finally { console.warn = orig; }
    expect(logs.join('\n')).not.toContain('sekret');
    expect(logs.join('\n')).toContain('apiKey=REDACTED');
  });
});

describe('findRefs query words', () => {
  it('strips punctuation so Best Buy grouping syntax is not broken', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fr-'));
    const urls: string[] = [];
    const f = (async (url: string) => { urls.push(url); return new Response('{"products":[]}'); }) as unknown as typeof fetch;
    await findRefs({ catalog: [p('x', 'be quiet!', 'Vengeance (2x16GB) Mac mini (M4)')], env: { BESTBUY_API_KEY: 'k' }, fetch: f, outPath: join(dir, 'c.json') });
    const terms = urls[0].slice(urls[0].indexOf('((') + 2, urls[0].indexOf('))?'));
    expect(terms).toBe('search=be&search=quiet&search=Vengeance&search=2x16GB&search=Mac&search=mini&search=M4');
    expect(terms).not.toMatch(/[()!]/);
  });
});

describe('findRefs empty words', () => {
  it('skips a part with no alphanumeric tokens', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fr-'));
    const urls: string[] = [];
    const f = (async (url: string) => { urls.push(url); return new Response('{"products":[]}'); }) as unknown as typeof fetch;
    await findRefs({ catalog: [p('x', '!!', '()')], env: { BESTBUY_API_KEY: 'k' }, fetch: f, outPath: join(dir, 'c.json') });
    expect(urls).toEqual([]);
  });
});
