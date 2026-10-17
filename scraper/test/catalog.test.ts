import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CatalogPart, Category } from '../../shared/types';

const catalog: CatalogPart[] = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const ALLOWED: Record<Category, string[]> = {
  cpu: ['cores', 'threads', 'baseClock', 'boostClock', 'socket', 'tdp'],
  gpu: ['memory', 'lengthMm', 'tdp'],
  ram: ['capacity', 'type', 'speed', 'modules'],
  storage: ['capacity', 'interface', 'formFactor'],
  psu: ['wattage', 'efficiency', 'modular'],
  motherboard: ['socket', 'chipset', 'formFactor'],
  case: ['formFactor', 'maxGpuLengthMm'],
  cooler: ['type', 'heightMm'],
  prebuilt: [],
};
const SLOTS: Category[] = ['cpu', 'cooler', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'case'];

describe('catalog.json', () => {
  it('has unique kebab-case ids', () => {
    const ids = catalog.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('uses valid categories and allowed spec keys', () => {
    for (const p of catalog) {
      expect(Object.keys(ALLOWED), p.id).toContain(p.category);
      for (const k of Object.keys(p.specs)) expect(ALLOWED[p.category], `${p.id}.${k}`).toContain(k);
    }
  });
  it('has at least 8 parts per builder slot and some prebuilts', () => {
    for (const s of SLOTS) expect(catalog.filter(p => p.category === s).length, s).toBeGreaterThanOrEqual(8);
    expect(catalog.filter(p => p.category === 'prebuilt').length).toBeGreaterThan(0);
  });
  it('has no invented retailer refs yet', () => {
    for (const p of catalog) expect(p.refs, p.id).toEqual([]);
  });
});
