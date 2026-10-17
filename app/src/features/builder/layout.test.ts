import { describe, expect, it } from 'vitest'
import { SLOTS } from '../../lib/build'
import { layoutFor, moduleCount } from './layout'

describe('layoutFor', () => {
  it('has at least one box per slot; filled flag follows input', () => {
    const boxes = layoutFor({ cpu: true }, {})
    for (const s of SLOTS) expect(boxes.some(b => b.slot === s)).toBe(true)
    expect(boxes.find(b => b.slot === 'cpu')!.filled).toBe(true)
    expect(boxes.find(b => b.slot === 'gpu')!.filled).toBe(false)
  })
  it('GPU width from lengthMm, default otherwise', () => {
    const w = (specs: Record<string, string>) => layoutFor({}, { gpu: specs }).find(b => b.slot === 'gpu')!.size[2]
    expect(w({ lengthMm: '336' })).toBe(33.6)
    expect(w({})).toBe(28)
    expect(w({ lengthMm: 'n/a' })).toBe(28)
  })
  it('RAM stick count from modules', () => {
    const n = (specs: Record<string, string>) => layoutFor({}, { ram: specs }).filter(b => b.slot === 'ram').length
    expect(n({ modules: '4' })).toBe(4)
    expect(n({})).toBe(2)
  })
  it('parses module counts', () => {
    expect([ '2 x 16 GB', '4x8GB', '1', 'n/a', undefined ].map(moduleCount)).toEqual([2, 4, 1, 2, 2])
  })
  it('every box fits inside the case', () => {
    const all = Object.fromEntries(SLOTS.map(s => [s, true]))
    const boxes = layoutFor(all, { gpu: { lengthMm: '422' }, ram: { modules: '4' } })
    for (const b of boxes) for (let i = 0; i < 3; i++) {
      expect(Math.abs(b.position[i]) + b.size[i] / 2, `${b.slot} axis ${i}`).toBeLessThanOrEqual([21, 46, 45][i] / 2 + 1e-9)
    }
  })
})
