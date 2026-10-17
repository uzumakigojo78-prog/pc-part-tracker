const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export function formatPrice(n: number | null): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : fmt.format(n)
}
export const RETAILER_NAMES: Record<string, string> = { bestbuy: 'Best Buy', amazon: 'Amazon', ebay: 'eBay' }
export const CATEGORY_NAMES: Record<string, string> = {
  cpu: 'CPU', cooler: 'Cooler', motherboard: 'Motherboard', ram: 'RAM', gpu: 'GPU',
  storage: 'Storage', psu: 'PSU', case: 'Case', prebuilt: 'Prebuilt',
}
export const SPEC_LABELS: Record<string, string> = {
  cores: 'Cores', threads: 'Threads', baseClock: 'Base clock', boostClock: 'Boost clock', socket: 'Socket',
  tdp: 'TDP', memory: 'Memory', lengthMm: 'Length', capacity: 'Capacity', type: 'Type', speed: 'Speed',
  modules: 'Modules', interface: 'Interface', formFactor: 'Form factor', wattage: 'Wattage',
  efficiency: 'Efficiency', modular: 'Modular', chipset: 'Chipset', maxGpuLengthMm: 'Max GPU length', heightMm: 'Height',
}
export const specLabel = (k: string): string => SPEC_LABELS[k] ?? k
export const specValue = (k: string, v: string): string => (k.endsWith('Mm') ? `${v} mm` : v)
