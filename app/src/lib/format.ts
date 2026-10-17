const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export function formatPrice(n: number | null): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : fmt.format(n)
}
export const RETAILER_NAMES: Record<string, string> = { bestbuy: 'Best Buy', amazon: 'Amazon', ebay: 'eBay' }
export const CATEGORY_NAMES: Record<string, string> = {
  cpu: 'CPU', cooler: 'Cooler', motherboard: 'Motherboard', ram: 'RAM', gpu: 'GPU',
  storage: 'Storage', psu: 'PSU', case: 'Case', prebuilt: 'Prebuilt',
}
