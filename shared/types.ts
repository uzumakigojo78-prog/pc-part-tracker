export type Category = 'cpu'|'cooler'|'motherboard'|'ram'|'gpu'|'storage'|'psu'|'case'|'prebuilt';
export type RetailerId = 'newegg'|'amazon'|'ebay';
export interface RetailerRef { retailer: RetailerId; productId: string; url: string }
export interface CatalogPart { id: string; category: Category; brand: string; model: string;
  specs: Record<string, string>; image?: string; refs: RetailerRef[] }
export interface RawListing { retailer: RetailerId; productId: string; url: string;
  price: number | null; inStock: boolean; rating: number | null; ratingCount: number | null;
  condition?: 'new'|'used'|'refurbished'; sellerFeedbackPct?: number }
export interface Offer { retailer: RetailerId; price: number; url: string; inStock: boolean;
  rating: number | null; ratingCount: number | null; fetchedAt: string }
export interface IndexEntry { id: string; category: Category; brand: string; model: string;
  image?: string; lowestPrice: number | null; lowestRetailer: RetailerId | null;
  rating: number | null; ratingCount: number | null; updatedAt: string }
export interface PartDetail extends Omit<CatalogPart, 'refs'> { offers: Offer[]; updatedAt: string }
export interface HistoryPoint { date: string; retailer: RetailerId; price: number }
