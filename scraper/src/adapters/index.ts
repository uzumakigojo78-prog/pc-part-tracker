import type { RawListing, RetailerId, RetailerRef } from '../../../shared/types';
import { politeFetch } from '../fetch';
import { bestbuy } from './bestbuy';
import { ebay } from './ebay';
import { amazon } from './amazon';

export interface RetailerAdapter {
  id: RetailerId;
  enabled(): boolean;
  /**
   * Resolves null for "no data" (HTTP 404/503/other non-OK, or an empty result).
   * May throw on transport or parse errors; the caller catches per fetch and counts it as failed.
   * Anything thrown must not leak secrets (Best Buy redacts apiKey= in its errors).
   */
  fetchOffer(ref: RetailerRef): Promise<RawListing | null>;
}

export function createAdapters(env: NodeJS.ProcessEnv, f: typeof politeFetch = politeFetch): RetailerAdapter[] {
  const g = ((url: string, init?: RequestInit) => f(url, init)) as typeof fetch;
  return [bestbuy(env, g), ebay(env, g), amazon(env, g)];
}
