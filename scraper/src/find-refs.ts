import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CatalogPart } from '../../shared/types';
import { politeFetch, redact } from './fetch';

export interface Candidate { sku: string; name: string; url: string }

/** Writes candidates for a human to confirm. Never edits catalog.json. */
export async function findRefs(opts: {
  catalog: CatalogPart[]; env: NodeJS.ProcessEnv; fetch?: typeof fetch; outPath: string;
}): Promise<void> {
  const { catalog, env, outPath } = opts;
  const f = opts.fetch ?? ((url: string, init?: RequestInit) => politeFetch(url, init)) as typeof fetch;
  if (!env.BESTBUY_API_KEY) { console.log('BESTBUY_API_KEY is not set - nothing to look up.'); return; }
  const candidates: Record<string, Candidate[]> = {};
  for (const part of catalog) {
    if (part.refs.some(r => r.retailer === 'bestbuy')) continue;
    const words = `${part.brand} ${part.model}`.split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (words.length === 0) { console.warn(part.id, 'no searchable words, skipped'); continue; }
    const search = words.map(w => `search=${encodeURIComponent(w)}`).join('&');
    const url = `https://api.bestbuy.com/v1/products((${search}))?apiKey=${env.BESTBUY_API_KEY}`
      + '&format=json&show=sku,name,url&pageSize=3';
    try {
      const res = await f(url);
      if (!res.ok) { console.warn(redact(`bestbuy ${res.status} for ${url}`)); continue; }
      const products = ((await res.json()) as any).products ?? [];
      candidates[part.id] = products.map((p: any) => ({ sku: String(p.sku), name: p.name, url: p.url }));
    } catch (e) {
      console.warn(part.id, redact(String((e as Error).message)));
    }
  }
  await writeFile(outPath, JSON.stringify(candidates, null, 2) + '\n');
  console.log(`wrote candidates for ${Object.keys(candidates).length} parts to ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = dirname(fileURLToPath(import.meta.url));
  const catalog: CatalogPart[] = JSON.parse(await readFile(join(here, '..', 'catalog.json'), 'utf8'));
  await findRefs({ catalog, env: process.env, outPath: join(here, '..', 'catalog.candidates.json') });
}
