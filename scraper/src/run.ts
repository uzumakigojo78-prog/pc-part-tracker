import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CatalogPart, HistoryPoint, Offer, PartDetail } from '../../shared/types';
import { createAdapters, type RetailerAdapter } from './adapters/index';
import { appendHistory } from './history';
import { buildIndexEntry, toOffer } from './normalize';

export interface RunCounts { succeeded: number; failed: number; skipped: number }

const writeJson = async (path: string, data: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
};

async function readHistory(path: string): Promise<HistoryPoint[]> {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
}

export async function run(opts: {
  catalog: CatalogPart[]; adapters: RetailerAdapter[]; dataDir: string; now: Date;
}): Promise<RunCounts> {
  const { catalog, adapters, dataDir, now } = opts;
  const updatedAt = now.toISOString();
  const date = updatedAt.slice(0, 10);
  const counts: RunCounts = { succeeded: 0, failed: 0, skipped: 0 };
  const index = [];

  for (const part of catalog) {
    const offers: Offer[] = [];
    for (const ref of part.refs) {
      const adapter = adapters.find(a => a.id === ref.retailer);
      if (!adapter || !adapter.enabled()) { counts.skipped++; continue; }
      try {
        const listing = await adapter.fetchOffer(ref);
        // A null listing or one toOffer rejects is neither failed nor succeeded: succeeded only when an Offer results.
        const offer = listing ? toOffer(listing, updatedAt) : null;
        if (offer) { offers.push(offer); counts.succeeded++; }
      } catch (err) {
        counts.failed++;
        console.warn(part.id, ref.retailer, (err as Error).message);
      }
    }
    const { refs: _refs, ...rest } = part;
    const detail: PartDetail = { ...rest, offers, updatedAt };
    await writeJson(join(dataDir, 'parts', `${part.id}.json`), detail);
    if (offers.length > 0) {
      const hp = join(dataDir, 'history', `${part.id}.json`);
      await writeJson(hp, appendHistory(await readHistory(hp), offers, date));
    }
    index.push(buildIndexEntry(part, offers, updatedAt));
  }
  index.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  await writeJson(join(dataDir, 'index.json'), index);
  return counts;
}

/** 1 only when something was tried and nothing worked. */
export function exitCode(c: RunCounts): 0 | 1 {
  return c.failed > 0 && c.succeeded === 0 ? 1 : 0;
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const catalog: CatalogPart[] = JSON.parse(await readFile(join(here, '..', 'catalog.json'), 'utf8'));
  const counts = await run({
    catalog, adapters: createAdapters(process.env),
    dataDir: resolve(here, '..', '..', 'data'), now: new Date(),
  });
  console.log(`scrape done: ${counts.succeeded} succeeded, ${counts.failed} failed, ${counts.skipped} skipped`);
  if (counts.succeeded === 0 && counts.failed === 0 && counts.skipped > 0) {
    console.warn('warning: every fetch was skipped (no API keys configured) - nothing fetched');
  } else if (counts.succeeded === 0 && counts.failed === 0) {
    console.warn('warning: no API keys / refs yet - nothing fetched');
  }
  process.exitCode = exitCode(counts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(String((e as Error).message ?? e)); process.exit(1); });
}
