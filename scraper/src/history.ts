import type { HistoryPoint, Offer } from '../../shared/types';

const RETAIN_DAYS = 730;
const DAY_MS = 86_400_000;

export function appendHistory(existing: HistoryPoint[], offers: Offer[], date: string): HistoryPoint[] {
  const cutoff = new Date(date).getTime() - RETAIN_DAYS * DAY_MS;
  const incoming = new Set(offers.map(o => o.retailer));
  const kept = existing.filter(p => new Date(p.date).getTime() >= cutoff
    && !(p.date === date && incoming.has(p.retailer)));
  return [...kept, ...offers.map(o => ({ date, retailer: o.retailer, price: o.price }))];
}
