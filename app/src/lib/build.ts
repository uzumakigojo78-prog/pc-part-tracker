export const SLOTS = ['cpu', 'cooler', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'case'] as const
export type Slot = (typeof SLOTS)[number]
