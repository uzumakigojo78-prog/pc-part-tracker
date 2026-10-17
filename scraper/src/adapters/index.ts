import type { RawListing, RetailerId, RetailerRef } from '../../../shared/types';
import { politeFetch } from '../fetch';
import { bestbuy } from './bestbuy';
import { ebay } from './ebay';
import { amazon } from './amazon';

export interface RetailerAdapter {
  id: RetailerId;
  enabled(): boolean;
  fetchOffer(ref: RetailerRef): Promise<RawListing | null>;
}

export function createAdapters(env: NodeJS.ProcessEnv, f: typeof politeFetch = politeFetch): RetailerAdapter[] {
  const g = ((url: string, init?: RequestInit) => f(url, init)) as typeof fetch;
  return [bestbuy(env, g), ebay(env, g), amazon(env, g)];
}
