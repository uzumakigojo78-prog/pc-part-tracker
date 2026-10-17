import { SLOTS } from '../../lib/build'
import type { Slot } from '../../lib/build'

export interface Box { slot: Slot; position: [number, number, number]; size: [number, number, number]; filled: boolean }

type V3 = [number, number, number]
// Centimetres, w x h x d. Case is centred at the origin; y up, +z toward the viewer.
const CASE: V3 = [21, 46, 45]
const POS: Record<Exclude<Slot, 'ram' | 'storage'>, V3> = {
  case: [0, 0, 0],
  motherboard: [0, 4, -10.2], // against the back panel
  cpu: [-2, 8, -9.9],
  cooler: [-2, 8, -3],
  gpu: [0, -2, -4],
  psu: [0, -19, 0],
}
const RAM_BASE: V3 = [4, 8, -9.7]
const STORAGE_POS: V3 = [-6, -10, 12]

const num = (v: string | undefined, d: number) => {
  const n = Number(v)
  return v !== undefined && Number.isFinite(n) && n > 0 ? n : d
}

export function layoutFor(
  filled: Partial<Record<Slot, boolean>>,
  specs: Partial<Record<Slot, Record<string, string>>>,
): Box[] {
  const f = (s: Slot) => !!filled[s]
  const sizes: Record<Exclude<Slot, 'ram'>, V3> = {
    case: CASE, motherboard: [30.5, 24.4, 0.2], cpu: [4, 4, 0.5], cooler: [12, 15, 12],
    gpu: [num(specs.gpu?.lengthMm, 280) / 10, 4, 12], psu: [15, 8.6, 14], storage: [8, 0.3, 2.2],
  }
  const sticks = Math.round(num(specs.ram?.modules, 2))
  const boxes: Box[] = []
  for (const slot of SLOTS) {
    if (slot === 'ram') {
      for (let i = 0; i < sticks; i++) {
        boxes.push({ slot, position: [RAM_BASE[0] + i * 1.2, RAM_BASE[1], RAM_BASE[2]], size: [13.3, 3.1, 0.4], filled: f(slot) })
      }
    } else {
      boxes.push({ slot, position: slot === 'storage' ? STORAGE_POS : POS[slot], size: sizes[slot], filled: f(slot) })
    }
  }
  return boxes
}
