import type { CatalogPart, IndexEntry, Offer, RawListing } from '../../shared/types';

// eBay is a marketplace: only new-condition items from sellers with >=98% feedback count.
export function isCredible(l: RawListing): boolean {
  if (l.retailer !== 'ebay') return true;
  return l.condition === 'new' && l.sellerFeedbackPct !== undefined && l.sellerFeedbackPct >= 98;
}

export function toOffer(l: RawListing, fetchedAt: string): Offer | null {
  if (l.price === null || !isCredible(l)) return null;
  return { retailer: l.retailer, price: l.price, url: l.url, inStock: l.inStock,
    rating: l.rating, ratingCount: l.ratingCount, fetchedAt };
}

export function buildIndexEntry(part: CatalogPart, offers: Offer[], updatedAt: string): IndexEntry {
  const pool = offers.some(o => o.inStock) ? offers.filter(o => o.inStock) : offers;
  const best = pool.reduce<Offer | null>((a, o) => (!a || o.price < a.price ? o : a), null);
  const rated = offers.filter(o => o.rating !== null && o.ratingCount !== null);
  const count = rated.reduce((s, o) => s + o.ratingCount!, 0);
  const rating = count > 0
    ? Math.round(rated.reduce((s, o) => s + o.rating! * o.ratingCount!, 0) / count * 10) / 10 : null;
  return { id: part.id, category: part.category, brand: part.brand, model: part.model,
    ...(part.image !== undefined && { image: part.image }),
    lowestPrice: best?.price ?? null, lowestRetailer: best?.retailer ?? null,
    rating, ratingCount: rating === null ? null : count, updatedAt };
}
